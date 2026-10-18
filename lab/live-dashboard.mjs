/** Lightweight ANSI terminal spectator: no UI dependencies, never modifies game state. */
import { stdout } from 'node:process';
import { setTimeout as pause } from 'node:timers/promises';
import { worth } from '../engine/index.mjs';

const allowed = new Set(['spectator', 'performance', 'off']);
const money = n => `N ${Number(n / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 })}`;
const seconds = ms => `${(ms / 1000).toFixed(1)}s`;
const clean = value => String(value ?? '').replace(/[\x00-\x1f\x7f\x1b]/g, ' ').replace(/\s+/g, ' ').trim();
const narrow = (value, width) => {
  const chars = [...clean(value)];
  return chars.length > width ? chars.slice(0, Math.max(0,width-1)).join('') + '…' : chars.join('');
};
function statusLabel(result) {
 if (result.winnerType==='bankruptcy') return `MENANG BANGKRUT: ${String(result.winner).toUpperCase()}`;
 if (result.winnerType==='net_worth') {
   const champ=result.rankings?.find(p=>p.seat===result.winnerSeat);
   return `MENANG KEKAYAAN: ${String(result.winner).toUpperCase()} (${money(champ?.worth ?? 0)})`;
 }
 if (result.draw) return 'SERI KEKAYAAN: total kekayaan tertinggi sama';
 const map = {
    action_cap: 'BELUM ADA PEMENANG: batas aman aksi',
    time_limit: 'BATAS WAKTU: skor kekayaan tidak tersedia',
    safety_time_cap: 'BELUM ADA PEMENANG: batas aman waktu',
    mortgage_redeem_oscillation: 'BELUM ADA PEMENANG: loop gadai/tebus',
    detected_loop: 'BELUM ADA PEMENANG: loop',
    interrupted: 'DIHENTIKAN PENGGUNA',
    no_actor: 'BERHENTI: tidak ada aktor',
    illegal_action: 'BERHENTI: aksi ilegal',
    planner_exception: 'BERHENTI: error model',
    no_action: 'BERHENTI: tidak ada aksi',
  };
  return map[result.stopReason] ?? `BELUM ADA PEMENANG: ${result.stopReason}`;
}
export function createDashboard({ mode = 'spectator', delayMs = 65, total = 1, victoryMode = 'bankruptcy', gameMs = 60000 } = {}) {
  const displayMode = allowed.has(mode) ? mode : 'spectator';
  const spectatorMs = Number.isFinite(Number(delayMs)) ? Math.min(1000, Math.max(0, Number(delayMs))) : 65;
  const interactive = Boolean(stdout.isTTY) && displayMode !== 'off';
  const frameMs = displayMode === 'performance' ? 170 : 0;
  const started = Date.now();
  let lastDraw = 0;
  let current = { index: 0, total, step: 0, maxActions: 0, round: 0, phase: '-', players: [], thinkingMs: 0, elapsedMs: 0, illegal: 0, loops: 0 };
  let latestEvents = [], finished = null, completed = 0, previousRun = [], active = false;
  const terminalWidth = () => Math.max(35, Math.min(82, stdout.columns || 65));
  const addEvents = events => {
    for (const e of events) latestEvents.push({text:clean(e.text || `${e.type} oleh ${e.actor}`), id:e.id});
    if(latestEvents.length > 5) latestEvents = latestEvents.slice(-5);
  };
  const render = (force = false) => {
    if(!interactive || !active) return;
    if(!force && frameMs && Date.now()-lastDraw < frameMs) return;
    lastDraw=Date.now();
    const width=terminalWidth(), horizontal='='.repeat(width);
    const lines=[
      horizontal,
      ' NUSA MIND BENCHMARK LAB  |  LIVE V1.2',
      horizontal,
      ` MATCH     ${String(current.index).padStart(2,'0')} / ${total}   |   SELESAI ${completed}/${total}`,
      ` TARGET    ${victoryMode==='timed'?`WAKTU ${(gameMs/60000).toFixed(1)} MENIT / KEKAYAAN`:'SAMPAI BANGKRUT'}`,
      ` ROUND     ${current.round}   |   STEP ${current.step}/${current.maxActions}`,
      ` PHASE     ${current.phase}   |   WAKTU ${seconds(current.elapsedMs)}`,
      ` PIKIR AI  ${current.thinkingMs.toFixed(2)} ms   |   MODE ${displayMode.toUpperCase()}`,
      '-'.repeat(width),
      victoryMode==='timed' ? ' PEMAIN           KAS       TOTAL KEKAYAAN' : ' PEMAIN                         KAS',
    ];
    for (const p of current.players) {
      lines.push(victoryMode==='timed' ? ` ${p.name.padEnd(9).slice(0,9)} ${money(p.cash).padStart(10)} ${money(p.netWorth??p.cash).padStart(15)}${p.out?'  [X]':''}${p.id===current.turn?' <':''}` : ` ${p.name.padEnd(12).slice(0,12)} ${money(p.cash).padStart(19)}${p.out?'  [BANGKRUT]':''}${p.id===current.turn?'  < GILIRAN':''}`);
    }
    lines.push('-'.repeat(width), ' 5 EVENT TERBARU (yang lama otomatis terganti)');
    const recent=[...latestEvents].reverse().slice(0,5);
    for(const e of recent) lines.push(` > ${narrow(e.text,width-4)}`);
    for(let i=recent.length;i<5;i++) lines.push(' > -');
    lines.push('-'.repeat(width),` ALERT LOOP ${current.loops}   |   ILEGAL ${current.illegal}`);
    if (finished) lines.push(narrow(` STATUS: ${statusLabel(finished)}`,width));
    else lines.push(' STATUS: BERJALAN  |  Ctrl+C untuk simpan & berhenti');
    if(previousRun.length) lines.push(narrow(` TERAKHIR: ${previousRun.at(-1)}`,width));
    stdout.write('\x1b[H'+lines.map(x=>narrow(x,width)).join('\n')+'\x1b[0J');
  };
  return {
    get interactive(){return interactive;},
    get delayMs(){return displayMode === 'spectator' ? spectatorMs : 0;},
    start(){if(!interactive)return;active=true;stdout.write('\x1b[?25l\x1b[2J\x1b[H');},
    begin({index,roster,maxActions}){
      latestEvents=[];finished=null;
      current={index,total,step:0,maxActions,round:1,phase:'opening',players:roster.map((p,id)=>({...p,id,cash:15000,out:false})),thinkingMs:0,elapsedMs:0,illegal:0,loops:0,turn:-1};
      render(true);
    },
    async onStep({state,events,step,maxActions,thinkingMs,elapsedMs,illegal,loops}){
      addEvents(events);
      current={...current,step,maxActions,round:state.round,phase:state.phase,players:state.players.map(p=>({...p,netWorth:worth(state,p.id)})),turn:state.turn,thinkingMs,elapsedMs,illegal,loops};
      render();
      if(interactive && displayMode==='spectator' && spectatorMs) {
        const before=Date.now();await pause(spectatorMs);return Date.now()-before;
      }
      return 0;
    },
    endMatch(result){
      completed++;finished=result;current={...current,step:result.actions,elapsedMs:result.elapsedMs,phase:result.phase};
      previousRun.push(`${result.matchId}: ${statusLabel(result)}`);
      if(previousRun.length>3)previousRun.shift();
      render(true);
      if(!interactive)console.log(`[${completed}/${total}] ${result.players.join(',')} | ${result.actions} actions | ${statusLabel(result)} | ${Math.round(result.elapsedMs)}ms`);
    },
    close(){if(interactive&&active){render(true);stdout.write('\x1b[?25h\n\n');active=false;}},
  };
}
export { statusLabel };

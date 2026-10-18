import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createGame, command, decisionActor, worth } from '../engine/index.mjs';
import { decidePersona, PERSONAS, recordBotMemory } from '../models/index.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDashboard, statusLabel } from './live-dashboard.mjs';
import { STABILITY_GUARD_VERSION } from '../models/bot/stability-guard.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{
 const [k,...parts]=x.slice(2).split('=');return [k,parts.length?parts.join('='):'true'];
}));
const int=(key,def,min,max)=>{const n=Number(args[key]??def);if(!Number.isInteger(n)||n<min||n>max)throw Error(`Invalid --${key}, expected integer ${min}..${max}`);return n};
const matches=int('matches',1,1,5000),players=int('players',2,2,6),maxActions=int('max-actions',600,1,50000),gameMs=int('game-ms',20000,100,3600000),budget=int('budget',24,0,2600),saveEvery=int('save-every',25,1,10000),seedBase=int('seed',20261018,0,2147483647);
// 'bankruptcy' counts only natural engine winners; 'timed' also awards by net worth after the requested time limit.
const victoryMode=String(args['victory-mode']||'bankruptcy');
if(!['bankruptcy','timed'].includes(victoryMode))throw Error('Invalid --victory-mode: bankruptcy or timed');
const outcomeAt=(state,stopReason)=>{
 const rankings=state.players.map(p=>({persona:p.botPersona,seat:p.id,name:p.name,cash:p.cash,worth:worth(state,p.id),bankrupt:p.out})).sort((a,b)=>b.worth-a.worth||b.cash-a.cash||a.seat-b.seat).map((r,i,all)=>({...r,rank:1+all.findIndex(x=>x.worth===r.worth)}));
 if(stopReason==='finished'){
  const champ=state.players[state.winner];
  return {winner:champ?.botPersona??null,winnerSeat:state.winner,winnerType:'bankruptcy',resolved:true,draw:false,rankings};
 }
 if(victoryMode==='timed'&&stopReason==='time_limit'){
  // An equal maximum net worth is a draw, not an arbitrary seat-based win.
  const leaders=rankings.filter(r=>r.worth===rankings[0]?.worth);
  const champ=leaders.length===1?leaders[0]:null;
  return {winner:champ?.persona??null,winnerSeat:champ?.seat??null,winnerType:champ?'net_worth':'draw',resolved:true,draw:!champ,tiedSeats:leaders.length>1?leaders.map(r=>r.seat):[],rankings};
 }
 return {winner:null,winnerSeat:null,winnerType:null,resolved:false,draw:false,rankings};
};
const traceFull=args['trace-full']==='true'||args['trace-full']==='1';
const displayMode=String(args.display||'spectator');
if(!['spectator','performance','off'].includes(displayMode))throw Error('Invalid --display');
const displayMs=int('display-ms',65,0,1000);
const dashboard=createDashboard({mode:displayMode,delayMs:displayMs,total:matches,victoryMode,gameMs});
let interrupted=false;
process.on('SIGINT',()=>{interrupted=true;});
const stopOnLoop=args['stop-on-loop']!=='false'&&args['stop-on-loop']!=='0';
const allowOverflow=args['allow-overflow']==='true';
const identities=String(args.bots||'nusa,kresna,apex,raka,bima,sari').split(',').map(x=>x.trim());
if(identities.length<players)throw Error('Specify at least --players model ids in --bots');
for(const id of identities)if(!PERSONAS.some(p=>p.id===id))throw Error('Unknown persona '+id);
const runId=String(args['run-id']||`run-${new Date().toISOString().replace(/[:.]/g,'-')}`);
if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(runId))throw Error('Unsafe run-id');
const runDir=path.resolve('runs',runId);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rngFor=seed=>{let v=seed>>>0;return ()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296}};
const append=(f,row)=>appendFile(f,JSON.stringify(row)+'\n');
const snapshot=async(f,s)=>writeFile(f,JSON.stringify(s,null,2)+'\n');
const percentile=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(p*(xs.length-1)))]:null;
function actorFor(state){
 if(state.phase==='won')return null;
 const isBot=id=>state.players[id]?.controller==='bot'&&!state.players[id].out;
 if(state.phase==='auction')return state.auction.participants.find(id=>isBot(id)&&id!==state.auction.highest&&!state.auction.passed.includes(id))??null;
 if(state.phase==='buildOffer')return state.buildOffer.pending.find(isBot)??null;
 const claim=state.rentClaims?.find(c=>isBot(c.to)&&['roll','end','jail','buy','card'].includes(state.phase));
 if(claim)return claim.to;
 const id=decisionActor(state);return isBot(id)?id:null;
}
function diff(before,after){
 const money=before.players.map((p,i)=>({actor:i,from:p.cash,to:after.players[i].cash,delta:after.players[i].cash-p.cash})).filter(r=>r.delta);
 const assets=Object.keys(before.assets).filter(t=>JSON.stringify(before.assets[t])!==JSON.stringify(after.assets[t])).map(tile=>({tile:Number(tile),before:before.assets[tile],after:after.assets[tile]}));
 return {money,assets,phase:{before:before.phase,after:after.phase},turn:{before:before.turn,after:after.turn},round:{before:before.round,after:after.round}};
}
function eventsBetween(before,after){return after.log.filter(e=>e.id>before.eventId).sort((a,b)=>a.id-b.id)}
function makeDetector(){
 let last=null,streak=0,matched=0,first=null,alerts=[];
 return {observe(before,action,after,step){
 const key=(action.type==='MORTGAGE'||action.type==='REDEEM')?`${before.turnSerial}|${before.round}|${before.turn}|${action.tile}`:null;
 if(key&&key===last?.key&&last?.type!==action.type){streak++;if(streak===1)first=step-1;}
 else {streak=0;first=step;}
 if(key&&streak>=5&&streak%2===1){const issue={kind:'mortgage_redeem_oscillation',actor:before.players.find(x=>x.id===before.turn)?.id,tile:action.tile,firstStep:first,lastStep:step,alternatingActions:streak+1,phase:before.phase,turnSerial:before.turnSerial};alerts.push(issue);}
 last={key,type:action.type};return alerts.at(-1)?.lastStep===step?alerts.at(-1):null;
 },get alerts(){return alerts}};
}
async function play(index){
 const seed=(seedBase+index*7919)>>>0,rng=rngFor(seed),roster=Array.from({length:players},(_,i)=>{const id=identities[(i+index)%players];return PERSONAS.find(p=>p.id===id)});
 const matchId=`${runId}-${String(index+1).padStart(4,'0')}`;
 const d=path.join(runDir,'matches',`match-${String(index+1).padStart(4,'0')}`);
 await mkdir(path.join(d,'checkpoints'),{recursive:true});
 let s=createGame({players:roster.map(p=>({name:p.name,controller:'bot',botPersona:p.id,botDifficulty:'hardcore'})),startingRoll:false,advisorEnabled:false,matchId},rng);
 const started=performance.now(),detector=makeDetector(),timeMs=[];
 let visualDelayMs=0;
 dashboard.begin({index:index+1,roster,maxActions});
 await snapshot(path.join(d,'initial-state.json'),s);
 await append(path.join(d,'events.jsonl'),{matchId,...s.log[0]});
 let actions=0,error=null,illegal=0;const actionCounts={};
 while(!interrupted&&s.phase!=='won'&&actions<maxActions&&performance.now()-started-visualDelayMs<gameMs){
  const actor=actorFor(s);if(actor===null){error={kind:'no_actor',phase:s.phase};break;}
  const before=s,step=actions+1,stamp=new Date().toISOString();let plan,act;
  const tick=performance.now();
  try{plan=decidePersona(before,actor,{timeBudgetMs:budget});act=plan?.action;}catch(e){error={kind:'planner_exception',message:String(e?.message||e),stack:String(e?.stack||'').slice(0,2000)};await append(path.join(d,'errors.jsonl'),{step,...error});break;}
  const thinkingMs=performance.now()-tick;timeMs.push(thinkingMs);
  const decision={step,at:stamp,actor,persona:before.players[actor].botPersona,model:plan?.diagnostics?.model||null,phase:before.phase,version:before.version,thinkingMs,action:act||null,diagnostics:plan?.diagnostics||null,reason:plan?.reason||null,candidates:plan?.candidates||null};
  await append(path.join(d,'decisions.jsonl'),decision);
  if(!act){error={kind:'no_action',step,actor,phase:before.phase};await append(path.join(d,'errors.jsonl'),error);break;}
  let next;
  try{
   // Only the model proposes an action; engine alone checks legality.
   next=command(before,actor,{...act,id:`bench:${matchId}:${step}`,expectedVersion:before.version},rng);
   // In production this callback is part of command(); extracted engine calls it externally.
   recordBotMemory(next,before,actor,act);
  }catch(e){illegal++;error={kind:'illegal_action',step,actor,action:act,message:String(e?.message||e)};await append(path.join(d,'errors.jsonl'),error);break;}
  const events=eventsBetween(before,next),changed=diff(before,next);
  const line={step,at:stamp,actor,persona:before.players[actor].botPersona,phaseBefore:before.phase,phaseAfter:next.phase,versionBefore:before.version,versionAfter:next.version,action:act,legal:true,stateHashBefore:hash(before),stateHashAfter:hash(next),thinkingMs,changes:changed,eventIds:events.map(e=>e.id)};
  await append(path.join(d,'actions.jsonl'),line);
  for(const e of events)await append(path.join(d,'events.jsonl'),{matchId,...e});
  if(traceFull)await append(path.join(d,'states.jsonl'),{step,state:next});
  actions++;actionCounts[act.type]=(actionCounts[act.type]||0)+1;const alert=detector.observe(before,act,next,step);
  if(alert)await append(path.join(d,'alerts.jsonl'),alert);
  s=next;
  visualDelayMs+=await dashboard.onStep({state:s,events,step:actions,maxActions,thinkingMs,elapsedMs:performance.now()-started-visualDelayMs,illegal,loops:detector.alerts.length});
  if(actions%saveEvery===0)await snapshot(path.join(d,'checkpoints',`state-${String(actions).padStart(6,'0')}.json`),s);
  if(alert&&stopOnLoop){error={kind:'detected_loop',...alert};break;}
 }
 const wallElapsedMs=performance.now()-started,elapsedMs=wallElapsedMs-visualDelayMs,finished=s.phase==='won';
 const stopReason=finished?'finished':error?.kind|| (interrupted?'interrupted':actions>=maxActions?'action_cap':victoryMode==='timed'?'time_limit':'safety_time_cap');
 const outcome=outcomeAt(s,stopReason);
 const result={matchId,seed,players:roster.map(p=>p.id),actions,elapsedMs,wallElapsedMs,displayDelayMs:visualDelayMs,victoryMode,finished,stopReason,error,illegal,phase:s.phase,version:s.version,...outcome,actionCounts,loops:detector.alerts,thinkingMs:{p50:percentile(timeMs,.5),p95:percentile(timeMs,.95),max:timeMs.length?Math.max(...timeMs):null},wealth:outcome.rankings};
 await snapshot(path.join(d,'final-state.json'),s);
 await snapshot(path.join(d,'final-save.json'),{format:'monopoli-nusantara-save',formatVersion:1,exportedAt:new Date().toISOString(),state:s});
 await snapshot(path.join(d,'summary.json'),result);
 return result;
}
await mkdir(runDir,{recursive:true});
await snapshot(path.join(runDir,'manifest.json'),{createdAt:new Date().toISOString(),benchmarkVersion:'1.2.1',source:'monopoli-nusantara-nusa-v23.zip',model:'NUSA-V23.0-CHRONOS-KAIROS',stabilityGuard:STABILITY_GUARD_VERSION,options:{victoryMode,matches,players,maxActions,gameMs,budget,saveEvery,seedBase,traceFull,stopOnLoop,identities,displayMode,displayMs},notes:['All bot seats are driven by the persona-router with the stability integration fix; no Groq calls.','Engine rules and native core algorithms are unchanged; bot guard integration is patched.','100% of produced public game events are captured before truncated game.log.','Bankruptcy winner only from engine; timed winner selected by engine-defined worth() when time limit is reached.']});
const results=[];let aborted=false;dashboard.start();
for(let i=0;i<matches;i++){
 if(interrupted){aborted=true;break;}
 try{const r=await play(i);results.push(r);await append(path.join(runDir,'matches.jsonl'),r);dashboard.endMatch(r);if(interrupted){aborted=true;break;}}
 catch(e){aborted=true;let err={match:i+1,error:String(e),stack:String(e?.stack||'').slice(0,2500)};await append(path.join(runDir,'failures.jsonl'),err);dashboard.close();console.error('FATAL',err);break;}
}
const wins=Object.fromEntries([...new Set(identities)].map(p=>[p,results.filter(x=>x.winner===p).length]));
const allTime=results.map(x=>x.elapsedMs);const actionTotals={};for(const r of results)for(const [type,n] of Object.entries(r.actionCounts||{}))actionTotals[type]=(actionTotals[type]||0)+n;
const summary={runId,completed:results.length,requested:matches,endedAt:new Date().toISOString(),wins,finished:results.filter(r=>r.finished).length,resolved:results.filter(r=>r.resolved).length,wealthWinners:results.filter(r=>r.winnerType==='net_worth').length,draws:results.filter(r=>r.draw).length,unfinished:results.filter(r=>!r.resolved).length,mode:victoryMode,illegal:results.reduce((n,r)=>n+r.illegal,0),loopGames:results.filter(r=>r.loops.length).length,averageActions:results.reduce((n,r)=>n+r.actions,0)/Math.max(1,results.length),actionTotals,averageGameMs:allTime.reduce((a,b)=>a+b,0)/Math.max(1,allTime.length),byStopReason:Object.fromEntries([...new Set(results.map(r=>r.stopReason))].map(k=>[k,results.filter(r=>r.stopReason===k).length])),aborted};
await snapshot(path.join(runDir,'summary.json'),summary);
await writeFile(path.join(runDir,'report.md'),`# NUSA Benchmark — ${runId}\n\n- Source: NUSA V23 core + stability guard ${STABILITY_GUARD_VERSION} (bot integration patch; rules unchanged)\n- Mode: ${victoryMode}; deadline/safety time: ${(gameMs/60000).toFixed(2)} minutes
- Games: ${results.length}/${matches}; natural bankruptcy wins: ${summary.finished}; timed wealth wins: ${summary.wealthWinners}; draws: ${summary.draws}; unresolved: ${summary.unfinished}\n- Illegal actions: ${summary.illegal}; loop games: ${summary.loopGames}\n- Average actions: ${summary.averageActions.toFixed(1)}\n- Winners (bankruptcy or timed wealth, separately labelled in matches/*/summary.json): ${JSON.stringify(wins)}\n- Stop reasons: ${JSON.stringify(summary.byStopReason)}\n\nAll event histories: matches/*/events.jsonl. Full terminal saves: matches/*/final-save.json.\nTimed results use engine worth() (cash + owned assets at rules valuation + building value), with mortgage assets at mortgage value. Equal top worth is a draw. Stops due to loop, error, safety cap or interruption have no winner. Bankruptcy results require phase 'won'.\n`);
dashboard.close();
console.log('HASIL: '+runDir);
console.log(`HASIL RESMI ${summary.resolved}/${results.length}; MENANG BANGKRUT ${summary.finished}; MENANG KEKAYAAN ${summary.wealthWinners}; SERI ${summary.draws}; BELUM ADA PEMENANG ${summary.unfinished}; LOOP ${summary.loopGames}; ALASAN ${JSON.stringify(summary.byStopReason)}`);
if(interrupted)console.log('Dihentikan pengguna: hasil pertandingan yang sudah diproses tetap tersimpan.');
if(aborted||summary.illegal>0||summary.loopGames>0)process.exitCode=2;

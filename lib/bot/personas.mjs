import {validDifficulty} from './mind-config.mjs';
import {requirePlayerName} from '../player-name.mjs';
/** 6 Distinct Grandmaster Personas for Monopoli Nusantara. */
export const PERSONAS=Object.freeze([
  Object.freeze({id:'raka',name:'Raka',role:'Tycoon Investor',risk:0.90,cvarAlpha:.80,concession:2.1,investment:1.18,negotiation:1.04,blocking:1.05,horizon:34,pawn:1}),
  Object.freeze({id:'bima',name:'Bima',role:'Master Negotiator',risk:0.98,cvarAlpha:.84,concession:1.5,investment:1.08,negotiation:1.25,blocking:1.06,horizon:34,pawn:2}),
  Object.freeze({id:'sari',name:'Sari',role:'Iron Strategist',risk:1.12,cvarAlpha:.89,concession:2.8,investment:1.10,negotiation:1.02,blocking:1.22,horizon:36,pawn:3}),
  Object.freeze({id:'nusa',name:'NUSA',role:'Sovereign Grandmaster',risk:0.95,cvarAlpha:.84,concession:1.9,investment:1.16,negotiation:1.15,blocking:1.18,horizon:36,pawn:4}),
  Object.freeze({id:'apex',name:'Arka',role:'Apex Strategist',risk:0.98,cvarAlpha:.84,concession:2.1,investment:1.14,negotiation:1.08,blocking:1.14,horizon:34,pawn:5}),
  Object.freeze({id:'kresna',name:'Kresna',role:'Quantum Nemesis',risk:0.94,cvarAlpha:.85,concession:1.85,investment:1.17,negotiation:1.18,blocking:1.20,horizon:36,pawn:0})
]);
export function personaFor(state,id){
  const player=state.players[id],bots=state.players.filter(p=>p.controller==='bot');
  return PERSONAS.find(p=>p.id===player?.botPersona)||PERSONAS[Math.max(0,bots.findIndex(p=>p.id===id))%PERSONAS.length];
}
export function localPlayers(name,count,humanPawn=0,difficulties={},selected=null){
  if(!Number.isInteger(count)||count<2||count>6)throw Error('VS Bot mendukung 2-6 peserta termasuk manusia.');
  const ids=selected===null?PERSONAS.slice(0,count-1).map(p=>p.id):selected.slice(0,count-1);
  if(ids.length!==count-1||new Set(ids).size!==ids.length||ids.some(id=>!PERSONAS.some(p=>p.id===id)))throw Error('Pilihan karakter bot harus valid dan unik.');
  const picked=ids.map(id=>PERSONAS.find(p=>p.id===id));
  const used=new Set([humanPawn]);
  return [{name:requirePlayerName(name),controller:'human',pawn:humanPawn},...picked.map(p=>{
    let pawn=p.pawn;if(used.has(pawn))pawn=[0,1,2,3,4,5].find(n=>!used.has(n));used.add(pawn);
    return {name:p.name,controller:'bot',botPersona:p.id,botDifficulty:validDifficulty(difficulties[p.id])?difficulties[p.id]:'medium',pawn};
  })];
}

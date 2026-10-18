import {validDifficulty} from './mind-config.mjs';
import {requirePlayerName} from '../player-name.mjs';
/**
 * NUSA V12.5 receives lean risk/cvarAlpha (unlocking earlier 3-house construction)
 * and the highest horizon (40), investment (1.28), and negotiation (1.32) weights
 * so its native economic floor generates maximum middle & late-game candidates.
 */
export const PERSONAS=Object.freeze([
  Object.freeze({id:'raka',name:'RAKA',role:'Tycoon Investor',risk:0.90,cvarAlpha:.80,concession:2.1,investment:1.18,negotiation:1.04,blocking:1.05,horizon:34,pawn:1}),
  Object.freeze({id:'bima',name:'BIMA',role:'Master Negotiator',risk:0.98,cvarAlpha:.84,concession:1.5,investment:1.08,negotiation:1.25,blocking:1.06,horizon:34,pawn:2}),
  Object.freeze({id:'sari',name:'SARI',role:'Iron Strategist',risk:1.12,cvarAlpha:.89,concession:2.8,investment:1.10,negotiation:1.02,blocking:1.22,horizon:36,pawn:3}),
  Object.freeze({id:'nusa',name:'NUSA',role:'Predictive Sovereign',risk:0.84,cvarAlpha:.78,concession:1.45,investment:1.28,negotiation:1.32,blocking:1.22,horizon:40,pawn:4}),
  Object.freeze({id:'apex',name:'ARKA',role:'Apex Strategist',risk:0.98,cvarAlpha:.84,concession:2.1,investment:1.14,negotiation:1.08,blocking:1.14,horizon:34,pawn:5}),
  Object.freeze({id:'kresna',name:'KRESNA',role:'Quantum Nemesis',risk:0.92,cvarAlpha:.83,concession:1.75,investment:1.18,negotiation:1.20,blocking:1.20,horizon:36,pawn:0})
]);
export function personaFor(state,id){
  const player=state.players[id],bots=state.players.filter(p=>p.controller==='bot');
  return PERSONAS.find(p=>p.id===player?.botPersona)||PERSONAS[Math.max(0,bots.findIndex(p=>p.id===id))%PERSONAS.length];
}
export function localPlayers(name,count,humanPawn=0,difficulties={},selected=null){
  if(!Number.isInteger(count)||count<2||count>6)throw Error('VS Bot mendukung 2-6 peserta.');
  const ids=selected===null?PERSONAS.slice(0,count-1).map(p=>p.id):selected.slice(0,count-1);
  const picked=ids.map(id=>PERSONAS.find(p=>p.id===id));
  const used=new Set([humanPawn]);
  return [{name:requirePlayerName(name),controller:'human',pawn:humanPawn},...picked.map(p=>{
    let pawn=p.pawn;if(used.has(pawn))pawn=[0,1,2,3,4,5].find(n=>!used.has(n));used.add(pawn);
    return {name:p.name,controller:'bot',botPersona:p.id,botDifficulty:validDifficulty(difficulties[p.id])?difficulties[p.id]:'medium',pawn};
  })];
}

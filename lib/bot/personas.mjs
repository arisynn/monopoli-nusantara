import {validDifficulty} from './mind-config.mjs';
import {requirePlayerName} from '../player-name.mjs';
/** Preferences, not difficulty. All personas use the same economic evaluator and safeguards. */
export const PERSONAS=Object.freeze([
 Object.freeze({id:'raka',name:'Raka',role:'Investor',risk:0.92,cvarAlpha:.80,concession:2.2,investment:1.12,negotiation:1,blocking:1,horizon:32,pawn:1}),
 Object.freeze({id:'bima',name:'Bima',role:'Negotiator',risk:1,cvarAlpha:.84,concession:1.6,investment:1.04,negotiation:1.18,blocking:1.02,horizon:34,pawn:2}),
 Object.freeze({id:'sari',name:'Sari',role:'Strategist',risk:1.14,cvarAlpha:.89,concession:3,investment:1.04,negotiation:1,blocking:1.16,horizon:36,pawn:3}),
 Object.freeze({id:'nusa',name:'₦USA',role:'Strategic Grandmaster',risk:1.02,cvarAlpha:.84,concession:2,investment:1.12,negotiation:1.07,blocking:1.1,horizon:36,pawn:4}),
 Object.freeze({id:'apex',name:'Arka',role:'Apex Strategist',risk:1.0,cvarAlpha:.84,concession:2.2,investment:1.1,negotiation:1.05,blocking:1.1,horizon:34,pawn:5})
]);
export function personaFor(state,id){
 const player=state.players[id],bots=state.players.filter(p=>p.controller==='bot');
 return PERSONAS.find(p=>p.id===player?.botPersona)||PERSONAS[Math.max(0,bots.findIndex(p=>p.id===id))%3];
}
export function localPlayers(name,count,humanPawn=0,difficulties={},selected=null){
 if(!Number.isInteger(count)||count<2||count>4)throw Error('VS Bot mendukung 2–4 peserta termasuk manusia.');
 const ids=selected===null?PERSONAS.slice(0,count-1).map(p=>p.id):selected.slice(0,count-1);
 if(ids.length!==count-1||new Set(ids).size!==ids.length||ids.some(id=>!PERSONAS.some(p=>p.id===id)))throw Error('Pilihan karakter bot harus valid dan unik.');
 const picked=ids.map(id=>PERSONAS.find(p=>p.id===id));
 const used=new Set([humanPawn]);
 return [{name:requirePlayerName(name),controller:'human',pawn:humanPawn},...picked.map(p=>{
  let pawn=p.pawn;if(used.has(pawn))pawn=[0,1,2,3,4,5].find(n=>!used.has(n));used.add(pawn);
  return {name:p.name,controller:'bot',botPersona:p.id,botDifficulty:validDifficulty(difficulties[p.id])?difficulties[p.id]:'medium',pawn};
 })];
}

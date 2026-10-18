import {createGame,command,decisionActor} from '../engine/index.mjs';
import {decidePersona, recordBotMemory} from '../models/index.mjs';
import {execFileSync} from 'node:child_process';
const players=['nusa','kresna'].map((botPersona,i)=>({controller:'bot',name:botPersona.toUpperCase(),botPersona}));
let seed=0x20261018;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
let state=createGame({players,startingRoll:false,matchId:'selftest',advisorEnabled:false},rng),count=0;
for(;count<8&&state.phase!=='won';count++){
 const actor=decisionActor(state),plan=decidePersona(state,actor,{timeBudgetMs:8});
 if(!plan?.action)throw Error('Missing plan '+state.phase);
 const next=command(state,actor,{...plan.action,id:'selftest'+count,expectedVersion:state.version},rng);
 recordBotMemory(next,state,actor,plan.action);state=next;
}
console.log(JSON.stringify({selftest:'PASS',actions:count,version:state.version,phase:state.phase,players:state.players.length}));

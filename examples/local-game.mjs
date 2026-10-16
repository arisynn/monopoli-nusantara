import {createGame,command,decisionActor} from '../lib/game.mjs';
import {localPlayers} from '../lib/bot/personas.mjs';
import {money} from '../lib/content.mjs';
const secureRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
let state=createGame({players:localPlayers('Jovan',4,0),startingRoll:false,advisorEnabled:false},secureRandom);
const actor=decisionActor(state);
state=command(state,actor,{type:'ROLL',id:crypto.randomUUID(),expectedVersion:state.version},secureRandom);
console.log(JSON.stringify({matchId:state.matchId,version:state.version,phase:state.phase,dice:state.dice,players:state.players.map(p=>({id:p.id,name:p.name,position:p.pos,cash:money(p.cash)})),events:state.log.slice(0,4)},null,2));

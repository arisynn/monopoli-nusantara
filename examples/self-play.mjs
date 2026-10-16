import {createGame,command} from '../lib/game.mjs';
import {decideMind,seeded,simulationActor} from '../lib/bot/mind.mjs';
import {PERSONAS} from '../lib/bot/personas.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const model=args.model||'medium',limit=Number(args['max-actions']||3000),rng=seeded(Number(args.seed||461));
if(!Number.isInteger(limit)||limit<1||limit>50000)throw Error('max-actions harus 1–50000.');
const players=PERSONAS.map(p=>({name:p.name,controller:'bot',botPersona:p.id,botDifficulty:model,pawn:p.pawn}));
let state=createGame({players,matchId:'headless-selfplay',advisorEnabled:false},rng),actions=0;
while(state.phase!=='won'&&actions<limit){
 const actor=simulationActor(state),plan=decideMind(state,actor,{timeBudgetMs:90,maxNodes:160});
 if(!plan.action)throw Error(`Tidak ada kandidat pada ${state.phase}.`);
 state=command(state,actor,{...plan.action,id:'headless-'+actions,expectedVersion:state.version},rng);actions++;
}
console.log(JSON.stringify({finished:state.phase==='won',actions,phase:state.phase,winner:state.winner===undefined?null:state.players[state.winner].name,players:state.players.map(p=>({name:p.name,out:p.out,cash:p.cash})),note:'Smoke self-play; bukan benchmark keunggulan kompetitif.'},null,2));
if(state.phase!=='won')process.exitCode=2;

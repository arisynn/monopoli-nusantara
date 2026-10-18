import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createGame,command} from '../lib/game.mjs';
import {botActor} from '../lib/server/bot-worker.mjs';
import {ComputePool} from '../termux/pool.mjs';
import {blockedFinance} from '../lib/bot/finance-history.mjs';
import {MODEL_MANIFEST_ID} from '../lib/bot/model-manifest.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const cap=Number(args.actions||500),budget=Number(args.budget||64);
if(!Number.isInteger(cap)||cap<1||cap>10000||!Number.isInteger(budget)||budget<0||budget>2600)throw Error('Invalid limits');
const rosters=[['nusa','kresna','apex','raka'],['bima','sari','nusa','kresna'],['apex','raka','bima','sari']];
const pool=new ComputePool(1),games=[],timings=[];const personas={};
try{
 for(const [index,roster] of rosters.entries()){
  let seed=20261018+index*7919;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  let s=createGame({players:roster.map(id=>({name:id,controller:'bot',botPersona:id,botDifficulty:'hardcore'})),startingRoll:false},rng);
  const game={roster,actions:0,bids:0,illegal:0,financeReversals:0,stopReason:'action_cap'};
  for(let step=0;step<cap&&s.phase!=='won';step++){
   const actor=botActor(s);if(actor===null)throw Error(`No actor ${s.phase}`);
   const started=performance.now(),plan=await pool.compute({state:s,actor,budget});timings.push(performance.now()-started);
   const action=plan.action;if(!action)throw Error('No model action');
   if(blockedFinance(s,actor,action))game.financeReversals++;
   if(action.type==='BID'){if(action.amount%50)throw Error('Off-grid bid');game.bids++;}
   try{s=command(s,actor,action,rng);}catch(e){game.illegal++;throw e;}
   game.actions++;personas[roster[actor]]=(personas[roster[actor]]||0)+1;
  }
  if(s.phase==='won'){game.stopReason='finished';game.winner=s.players[s.winner].botPersona;}
  game.version=s.version;games.push(game);
  console.log(`Game ${index+1}: ${game.actions} actions, ${game.bids} bids, ${game.stopReason}`);
 }
}finally{await pool.close();}
const sorted=timings.toSorted((a,b)=>a-b),quantile=q=>sorted[Math.floor((sorted.length-1)*q)]??null;
const report={manifest:MODEL_MANIFEST_ID,environment:'Node Linux compute threads (not Android; no network RTT)',budgetMs:budget,games,personas,
 decisionWallMs:{p50:quantile(.5),p95:quantile(.95),p99:quantile(.99)},notes:['Action caps are unresolved; no invented wealth winner.','Includes IPC and public decision computation; not a claim about network or device latency.']};
await writeFile(args.output||'docs/audits/TERMUX_MODEL_BENCHMARK.json',JSON.stringify(report,null,2)+'\n');
if(games.some(g=>g.illegal||g.financeReversals))process.exitCode=1;

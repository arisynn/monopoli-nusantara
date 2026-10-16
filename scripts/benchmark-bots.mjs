import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createGame,command,chooseBot,decisionActor,GROUPS,BOARD,assets} from '../lib/game.mjs';
import {chooseSmartBot} from '../lib/bot/strategy.mjs';
import {PERSONAS} from '../lib/bot/personas.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const stage=args.stage||'all';
const seeds=Number(args.seeds||3),maxActions=Number(args['max-actions']||1800),budget=Number(args.seconds||180)*1000;
const started=performance.now(),runs=[],timings=[];let illegal=0;
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const quantile=(a,q)=>a.length?a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))]:null;
function wilson(w,n){if(!n)return [0,1];const z=1.96,p=w/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,e=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-e,c+e]}
function play(n,seed,seat,persona,variant,stage,options={}){
 const rng=seeded(seed),players=Array.from({length:n},(_,id)=>({name:id===seat?persona.name:`Baseline ${id}`,controller:'bot',...(id===seat?{botPersona:persona.id}:{})}));
 let s=createGame({players,matchId:`bench-${seed}-${seat}`,startingRoll:true},rng),actions=0,builds=0,monopolies=0,trades=0,auctionRatio=[],failed=null;
 while(s.phase!=='won'&&actions<maxActions){const actor=decisionActor(s),smart=variant==='self'||actor===seat&&variant!=='baseline';let action;
  const t=performance.now();try{action=smart?chooseSmartBot(s,actor,options):chooseBot(s,actor);}catch(e){failed='planner_exception';break}
  if(smart&&timings.length<200000)timings.push(performance.now()-t);
  if(!action){failed='no_legal_candidate';break}
  const old=s;try{s=command(s,actor,{...action,id:`bench-${actions}`,expectedVersion:s.version},rng)}catch{illegal++;failed='illegal_action';break}
  actions++;if(actor===seat&&['BUILD','BUILD_JOIN'].includes(action.type))builds++;
  if(action.type==='TRADE_ACCEPT')trades++;
  monopolies=Math.max(monopolies,GROUPS.filter(g=>g.ids.every(i=>s.assets[i].owner===seat)).length);
  for(const e of s.log)if(e.id>old.eventId&&e.type==='auctionResult'&&e.auctionResult.winner===seat){const r=e.auctionResult;auctionRatio.push(r.amount/(r.kind==='building'?BOARD[r.tile].build:BOARD[r.tile].price));}
  if(actions%100===0&&performance.now()-started>budget){failed='time_budget';break}
 }
 const finished=s.phase==='won';return {n,seed,seat,persona:persona.id,variant,stage,finished,won:finished&&s.winner===seat,bankrupt:s.players[seat].out,actions,builds,monopolies,trades,auctionPriceRatio:auctionRatio.length?auctionRatio.reduce((a,b)=>a+b,0)/auctionRatio.length:null,failed:failed||(!finished?'action_cap':null)};
}
function append(r){runs.push(r);if(runs.length%12===0)console.log(`benchmark ${runs.length} games, ${Math.round((performance.now()-started)/1000)}s, finished ${runs.filter(r=>r.finished).length}`)}
// Tuning seeds are disjoint; defaults are frozen before the evaluation cohort.
if(stage==='all')for(let i=0;i<6&&performance.now()-started<budget;i++)append(play(2+i%3,1000+i,i%(2+i%3),PERSONAS[i%3],'smart','tuning'));
if(stage==='all'||stage==='evaluation')for(let k=0;k<seeds&&performance.now()-started<budget;k++)for(const persona of PERSONAS)for(const n of [2,3,4])for(let seat=0;seat<n;seat++){
 if(performance.now()-started>=budget)break;
 const seed=Number(args['seed-base']||250000)+k*997+n*31;
 append(play(n,seed,seat,persona,'smart','evaluation'));append(play(n,seed,seat,persona,'baseline','evaluation'));
}
if(stage==='all'||stage==='ablation')for(const [variant,options] of Object.entries({full:{},no_plan:{ablatePlan:true},fixed_reserve:{ablateReserve:true},no_trade:{ablateTrade:true},greedy_liquidation:{ablateLiquidation:true}}))for(let i=0;i<6&&performance.now()-started<budget;i++)append(play(2+i%3,80000+i,0,PERSONAS[i%3],variant,'ablation',options));
if(stage==='all'||stage==='self')for(let i=0;i<6&&performance.now()-started<budget;i++)append(play(2+i%3,90000+i,0,PERSONAS[i%3],'self','self_play'));
const evaluation=runs.filter(r=>r.stage==='evaluation'),summary=group=>{
 const selected=evaluation.filter(r=>group(r)),wins=selected.filter(r=>r.won).length,finished=selected.filter(r=>r.finished).length;
 return {games:selected.length,wins,winRate:selected.length?wins/selected.length:0,wilson95:wilson(wins,selected.length),finished,unfinished:selected.length-finished,bankrupt:selected.filter(r=>r.bankrupt).length,meanBuilds:selected.reduce((n,r)=>n+r.builds,0)/Math.max(1,selected.length),meanMonopolies:selected.reduce((n,r)=>n+r.monopolies,0)/Math.max(1,selected.length),acceptedTrades:selected.reduce((n,r)=>n+r.trades,0)};
};
const pairs=[];for(let i=0;i<evaluation.length-1;i+=2)if(evaluation[i].variant==='smart'&&evaluation[i+1].variant==='baseline')pairs.push(Number(evaluation[i].won)-Number(evaluation[i+1].won));
const bootstrap=seeded(1234),deltas=[];if(pairs.length)for(let i=0;i<1000;i++){let total=0;for(let j=0;j<pairs.length;j++)total+=pairs[Math.floor(bootstrap()*pairs.length)];deltas.push(total/pairs.length)}
const report={generatedAt:new Date().toISOString(),ruleset:'nusantara-c1009-2',maxActions,timeBudgetSeconds:budget/1000,wallSeconds:(performance.now()-started)/1000,games:runs.length,tuningGames:runs.filter(r=>r.stage==='tuning').length,evaluationGames:evaluation.length,smart:summary(r=>r.variant==='smart'),baseline:summary(r=>r.variant==='baseline'),pairedDelta:pairs.length?pairs.reduce((a,b)=>a+b,0)/pairs.length:null,pairedBootstrap95:[quantile(deltas,.025),quantile(deltas,.975)],byPersona:Object.fromEntries(PERSONAS.map(p=>[p.id,{smart:summary(r=>r.persona===p.id&&r.variant==='smart'),baseline:summary(r=>r.persona===p.id&&r.variant==='baseline')} ])),byPlayers:Object.fromEntries([2,3,4].map(n=>[n,{smart:summary(r=>r.n===n&&r.variant==='smart'),baseline:summary(r=>r.n===n&&r.variant==='baseline')}])),decisionMs:{median:quantile(timings,.5),p95:quantile(timings,.95),samples:timings.length},illegalActions:illegal,failedGames:runs.filter(r=>r.failed).length,notes:['Unfinished matches count as zero wins; no net-worth winner is invented.','Confidence intervals and paired bootstrap are descriptive; runs share seeds across seats/personas and are correlated.','Landing model is bounded public-card expectation, not an exact long-horizon simulation of jail/doubles.','Ablation cohorts are small diagnostics, not proof of causal competitive gain.','Desktop cloud timing is not Android profiling.'],runs};
mkdirSync('docs',{recursive:true});const path=args.output||'docs/BOT_BENCHMARK.json';writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,runs:undefined,byPersona:undefined,byPlayers:undefined},null,2));

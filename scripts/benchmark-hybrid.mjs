import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {runMatch} from './mind-learning-lab.mjs';
import {mindProvenance} from './mind-provenance.mjs';
import {seeded} from '../lib/bot/mind.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const config={seeds:Number(args.seeds||2),seedBase:Number(args['seed-base']||0x20000000),sizes:(args.players||'2,4,6').split(',').map(Number),candidate:args.candidate||'economic',maxMs:Number(args['game-ms']||60000),maxActions:Number(args['max-actions']||6000),budget:Number(args.budget||80),nodes:Number(args.nodes||160),split:args.split||'tuning'};
if(!Number.isSafeInteger(config.seeds)||config.seeds<1||config.seeds>10000||config.sizes.some(n=>![2,3,4,5,6].includes(n))||!['economic','search'].includes(config.candidate)||!['tuning','holdout'].includes(config.split)||!Number.isFinite(config.maxMs)||config.maxMs<100||!Number.isSafeInteger(config.maxActions)||config.maxActions<1||!Number.isSafeInteger(config.seedBase))throw Error('Invalid benchmark configuration');
const lower=config.split==='holdout'?0x30000000:0x20000000,upper=config.split==='holdout'?0x3fffffff:0x2fffffff;
if(config.seedBase<lower||config.seedBase+(config.seeds-1)*997>upper)throw Error('Use disjoint tuning/holdout seed ranges');
const output=args.output||'docs/MIND_HYBRID_BENCHMARK.json',provenance=mindProvenance();
const old=args.resume?JSON.parse(readFileSync(args.resume,'utf8')):null;
if(old&&(old.sourceHash!==provenance.sourceHash||JSON.stringify(old.config)!==JSON.stringify(config)))throw Error('Resume source/configuration mismatch');
const runs=old?.runs||[],controls=old?.controls||[],began=performance.now();
function interval(values){
 if(values.length<5)return null;
 const rng=seeded(17293),boot=[];for(let i=0;i<2000;i++){let total=0;for(let j=0;j<values.length;j++)total+=values[Math.floor(rng()*values.length)];boot.push(total/values.length);}boot.sort((a,b)=>a-b);return [boot[50],boot[1950]];
}
function summary(n){
 const rows=runs.filter(r=>r.n===n),wins=rows.filter(r=>r.won).length,clusters=[];
 for(let i=0;i<config.seeds;i++){const seed=config.seedBase+i*997,group=rows.filter(r=>r.seed===seed),control=controls.find(r=>r.seed===seed&&r.n===n);
  if(group.length===n&&control)clusters.push(group.reduce((sum,r)=>sum+Number(r.won)-Number(control.finished&&control.winner===r.seat),0)/n);
 }
 const sorted=q=>rows.map(r=>r.latencyByPolicy?.[config.candidate]?.[q]).filter(Number.isFinite).sort((a,b)=>a-b),p50=sorted('p50'),p95=sorted('p95');
 return {scheduledGames:config.seeds*n,attemptedGames:rows.length,finishedGames:rows.filter(r=>r.finished).length,wins,winRate:wins/(config.seeds*n),illegal:rows.reduce((sum,r)=>sum+r.illegal,0),failures:rows.filter(r=>r.failure).length,independentSeedClusters:clusters.length,pairedDelta:clusters.length?clusters.reduce((a,b)=>a+b,0)/clusters.length:null,clusterBootstrap95:interval(clusters),medianMatchDecisionP50:p50.length?p50[Math.floor(p50.length/2)]:null,medianMatchDecisionP95:p95.length?p95[Math.floor(p95.length/2)]:null};
}
function report(){
 const bySize=Object.fromEntries(config.sizes.map(n=>[n,summary(n)])),complete=runs.length===config.seeds*config.sizes.reduce((a,b)=>a+b,0),problems=[];
 if(!complete)problems.push('incomplete_experiment');if(config.split!=='holdout')problems.push('not_holdout');
 for(const n of config.sizes){const r=bySize[n];if(r.independentSeedClusters<500)problems.push(`insufficient_clusters_${n}`);if(r.illegal||r.finishedGames<r.attemptedGames*.99)problems.push(`health_gate_${n}`);if(!r.clusterBootstrap95||r.clusterBootstrap95[0]<=0)problems.push(`superiority_unproven_${n}`);}
 return {version:'4.10.0',generatedAt:new Date().toISOString(),sourceHash:provenance.sourceHash,provenance,config,complete,wallMs:performance.now()-began,bySize,promotion:{promote:problems.length===0,reasons:problems,automaticProductionChanges:false},runs,controls,limitations:['Cloud Node.js CPU, not Android/Termux measurements.','Frozen baseline is target v4.9.1; target integrators must freeze their own pre-merge bot.','Each seed rotates the candidate through every seat. Confidence intervals resample whole seed clusters per participant count.','Intervals withheld below five complete clusters; a smoke run cannot establish superiority.','Action-cap, timeout and errors remain zero-win outcomes in the scheduled denominator.','Paired initial seeds do not guarantee identical later real-game dice after policies diverge. Sandbox CRN does not alter authoritative match RNG.','Six-seat lab permits repeated persona labels; online production seat/controller limits remain unchanged.']};
}
const save=()=>{if(mindProvenance().sourceHash!==provenance.sourceHash)throw Error('Source changed during benchmark');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report(),null,2)+'\n');};
for(let i=0;i<config.seeds;i++)for(const n of config.sizes){
 const seed=config.seedBase+i*997;
 if(!controls.some(r=>r.seed===seed&&r.n===n)){const r=runMatch({seed,n,policies:['frozen-490'],maxMs:config.maxMs,maxActions:config.maxActions});controls.push(r);save();console.log(`control ${n} seats / seed ${seed} / ${r.finished?'finished':r.failure}`);}
 for(let seat=0;seat<n;seat++){
  if(runs.some(r=>r.seed===seed&&r.n===n&&r.seat===seat))continue;
  const policies=Array(n).fill('frozen-490');policies[seat]=config.candidate;
  const r=runMatch({seed,n,policies,timeBudgetMs:config.budget,maxNodes:config.nodes,maxMs:config.maxMs,maxActions:config.maxActions});runs.push({...r,seat,won:r.finished&&r.winner===seat});save();
  console.log(`candidate ${n} seats / seed ${seed} / seat ${seat} / ${r.finished?'finished':r.failure} / ${r.actions} actions`);await new Promise(setImmediate);
 }
}
save();console.log(JSON.stringify({output,bySize:report().bySize,promotion:report().promotion},null,2));

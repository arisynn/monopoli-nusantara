import {readFileSync,writeFileSync} from 'node:fs';
const evaluation=JSON.parse(readFileSync(process.argv[2]||'docs/BOT_EVALUATION.json','utf8'));
const ablation=JSON.parse(readFileSync(process.argv[3]||'docs/BOT_ABLATION.json','utf8'));
const paired=new Map(),clusters=new Map();
for(const r of evaluation.runs.filter(r=>r.stage==='evaluation')){
 const key=[r.seed,r.n,r.seat,r.persona].join(':');const p=paired.get(key)||{};p[r.variant]=r;paired.set(key,p);
}
for(const p of paired.values())if(p.smart&&p.baseline){const key=p.smart.seed,values=clusters.get(key)||[];values.push(Number(p.smart.won)-Number(p.baseline.won));clusters.set(key,values);}
let seed=1234;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const groups=[...clusters.values()],deltas=[];
if(groups.length)for(let i=0;i<5000;i++){let sum=0,n=0;for(let j=0;j<groups.length;j++){const g=groups[Math.floor(random()*groups.length)];sum+=g.reduce((a,b)=>a+b,0);n+=g.length}deltas.push(sum/n)}
deltas.sort((a,b)=>a-b);const interval=deltas.length?[deltas[Math.floor(deltas.length*.025)],deltas[Math.floor(deltas.length*.975)]]:[null,null];
const cohort=ablation.runs.filter(r=>r.stage==='ablation'),full=cohort.filter(r=>r.variant==='full');
const ablations=Object.fromEntries([...new Set(cohort.map(r=>r.variant))].map(variant=>{
 const rows=cohort.filter(r=>r.variant===variant),pairs=rows.map(r=>({r,base:full.find(x=>x.seed===r.seed&&x.n===r.n&&x.persona===r.persona&&x.seat===r.seat)})).filter(p=>p.base);
 return [variant,{games:rows.length,wins:rows.filter(r=>r.won).length,unfinished:rows.filter(r=>!r.finished).length,meanActions:rows.reduce((n,r)=>n+r.actions,0)/Math.max(1,rows.length),pairedWinDeltaVsFull:pairs.length?pairs.reduce((n,p)=>n+Number(p.r.won)-Number(p.base.won),0)/pairs.length:null}];
}));
const report={generatedAt:new Date().toISOString(),evaluationGames:evaluation.evaluationGames,independentSeedClusters:groups.length,pairedDelta:evaluation.pairedDelta,clusterBootstrap95:interval,competitiveSuperiorityEstablished:interval[0]>0,byPersona:evaluation.byPersona,byPlayers:evaluation.byPlayers,decisionMs:evaluation.decisionMs,ablation:ablations,
 meanAuctionFacePriceRatio:Object.fromEntries(['smart','baseline'].map(v=>{const rows=evaluation.runs.filter(r=>r.stage==='evaluation'&&r.variant===v&&r.auctionPriceRatio!==null);return [v,rows.reduce((n,r)=>n+r.auctionPriceRatio,0)/Math.max(1,rows.length)]})),
 limitations:['Bootstrap resamples whole seed groups because personas/seats and baseline replays are correlated. Only five seed indices per player count; expand held-out seeds before a strong claim.','Raw Wilson and row bootstrap intervals are descriptive, not independent-trial inference.','Build/monopoly counts and face-price ratios are activity proxies, not measured realized investment ROI. Monopoly count can include bankruptcy transfers. Accepted trade counts include the whole table.','Automatic trade utility/outcome quality scoring and Android profiling remain incomplete; scenario tests protect specific economic errors.','Ablations have six matched runs per variant and no statistical power claim. no_trade disables proactive and counteroffer generation, retaining legal accept/reject decisions.','No Groq requests were made; this is local-engine evaluation only.']};
writeFileSync('docs/BOT_BENCHMARK_ANALYSIS.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({independentSeedClusters:groups.length,pairedDelta:report.pairedDelta,clusterBootstrap95:interval,competitiveSuperiorityEstablished:report.competitiveSuperiorityEstablished,ablation:ablations},null,2));

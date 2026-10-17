import {parentPort} from 'node:worker_threads';
import {runMatch} from './mind-learning-lab.mjs';
const mapping={'foundation':'economic','learned-policy':'learned','search':'search','learned-search':'learned-search'};
parentPort.on('message',job=>{
 try{
  const {seed,n,pool,variants,model,budget,nodes,ablation}=job,control=runMatch({seed,n,policies:[pool],maxMs:120000}),controls=[],runs=[];
  for(let seat=0;seat<n;seat++)controls.push({...control,seat,won:control.finished&&control.winner===seat});
  for(let seat=0;seat<n;seat++)for(const variant of variants){const policies=Array(n).fill(pool);policies[seat]=mapping[variant];const r=runMatch({seed,n,policies,model,timeBudgetMs:budget,maxNodes:nodes,maxMs:120000,ablation});runs.push({...r,seat,variant,won:r.finished&&r.winner===seat});}
  parentPort.postMessage({seed,n,controls,runs});
 }catch(error){parentPort.postMessage({error:String(error.stack||error)});}
});

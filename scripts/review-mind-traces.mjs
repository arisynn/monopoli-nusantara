import {readFileSync,writeFileSync} from 'node:fs';
import {command,chooseBot} from '../lib/game.mjs';
import {sampleWorld,seeded,simulationActor,positionValue} from '../lib/bot/mind.mjs';
import {cycleFingerprint} from './mind-lab-utils.mjs';
const path=process.argv[2]||'docs/MIND_EVALUATION_traces.json',traces=JSON.parse(readFileSync(path,'utf8')),reviews=[],reviewedKeys=new Set();
for(const trace of traces){
 const key=JSON.stringify([trace.match,trace.version,trace.actor,trace.action,cycleFingerprint(trace.state)]);if(reviewedKeys.has(key))continue;reviewedKeys.add(key);
 const selected=trace.candidates.find(c=>c.action.actionId===trace.action.actionId);
 const choices=[selected,...trace.candidates.filter(c=>c!==selected).slice(0,3)].filter(Boolean),outcomes=[];
 for(const c of choices){
  const values=[];let illegal=0;
  for(let scenario=0;scenario<12;scenario++){
   const rng=seeded(460900+scenario*997),world=sampleWorld(trace.state,rng);let s;
   try{s=command(world,trace.actor,c.action,rng);}catch{illegal++;continue;}
   for(let i=0;i<28&&s.phase!=='won';i++){
    const who=simulationActor(s),intent=chooseBot(s,who);if(!intent)break;
    try{s=command(s,who,intent,rng);}catch{break;}
   }
   values.push(positionValue(s,trace.actor));
  }
  outcomes.push({action:c.action,localUtility:c.utility,meanPositionValue:values.length?values.reduce((n,v)=>n+v,0)/values.length:null,samples:values.length,illegal});
 }
 const valid=outcomes.filter(c=>c.meanPositionValue!==null),best=valid.slice().sort((a,b)=>b.meanPositionValue-a.meanPositionValue)[0],actual=valid[0];
 if(!actual||!best)continue;
 reviews.push({match:trace.match,version:trace.version,policy:trace.policy,phase:trace.phase,actor:trace.actor,selected:actual,bestCounterfactual:best,estimatedOpportunityLoss:best.meanPositionValue-actual.meanPositionValue,
  classification:best.meanPositionValue-actual.meanPositionValue>60?'counterfactual_regret':'no_clear_counterfactual_improvement',
  state:trace.state,candidates:trace.candidates,diagnostics:trace.diagnostics,
  caution:'Twelve public-information samples with a bounded baseline response policy and approximate value function. This diagnoses hypotheses, not proven causal mistakes or calibrated win probability.'});
}
reviews.sort((a,b)=>b.estimatedOpportunityLoss-a.estimatedOpportunityLoss);
const report={source:path,seedBase:460900,samplesPerAction:12,horizonActions:28,reviewed:reviews.length,regretCases:reviews.filter(r=>r.classification==='counterfactual_regret').length,reviews};
const output=path.replace(/_traces\.json$/,'_review.json');if(output===path)throw Error('Input must end in _traces.json');
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log({output,reviewed:report.reviewed,regretCases:report.regretCases,topLosses:reviews.slice(0,10).map(r=>({match:r.match,version:r.version,model:r.policy,loss:Math.round(r.estimatedOpportunityLoss),selected:r.selected.action,best:r.bestCounterfactual.action}))});

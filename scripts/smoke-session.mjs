import {GameSession} from '../frontend/session.mjs';
import {decideMind,seeded} from '../lib/bot/mind.mjs';
import {localBotActor} from '../frontend/domain.mjs';
import {writeFile} from 'node:fs/promises';
const runs=[];
for(const count of [2,3,4]){
 const s=new GameSession({random:seeded(461),persist:async()=>{},archive:async()=>{},mind:{decide:async(state,id)=>decideMind(state,id,{timeBudgetMs:0}),dispose(){}}});
 s.hidden=true;await s.startLocal({name:'Simulated human',count});let actions=0,error=null;const began=performance.now();
 while(s.state.phase!=='won'&&actions<3000){
  s.resetPresentation();const version=s.state.version,actor=localBotActor(s.state);
  if(actor!==null)await s.stepBot();else{const plan=decideMind(s.state,s.seat,{timeBudgetMs:0});if(!plan.action){error='No human policy action';break;}const{actionId,...intent}=plan.action;await s.act(intent.type,intent);}
  if(s.state.version===version){error=s.error||'No state progress';break;}actions++;
 }
 runs.push({players:count,seed:461,actions,finished:s.state.phase==='won',winner:s.state.players[s.state.winner]?.name||null,phase:s.state.phase,error,elapsedMs:Math.round(performance.now()-began)});s.dispose();
}
const report={scope:'Real frontend GameSession local orchestration without a DOM, injected zero-search-budget local mind, persistence double, human decisions simulated by the same planner; not browser QA or a competitive benchmark.',runs};
await writeFile('docs/CLASSIC_SESSION_SMOKE.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(runs.some(r=>r.error||!r.finished))process.exitCode=2;

import {BOARD,GROUPS,RULEPACK} from '../content.mjs';
import {rent,command} from '../game.mjs';
import {landingForecast,expectedRentAt} from './probability.mjs';
import {ruleState} from './candidates.mjs';

export const LEARNING_SCHEMA=1;
export const VALUE_FEATURES=Object.freeze(['cash','cash_log','equity','collateral','rent_power','developed_rent','complete_groups','near_groups','developed_groups','houses','hotels','mortgaged','debt_gap','rent_exposure','runway','jail_safety','acquisition_capacity','construction_capacity','unbuilt_monopoly','cards']);
const TYPES=['BUY','AUCTION','BID','PASS','BUILD','BUILD_JOIN','BUILD_DECLINE','REDEEM','MORTGAGE_REDEEM','MORTGAGE_KEEP','MORTGAGE','SELL','SELL_SET','OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT','JAIL_PAY','JAIL_CARD','ROLL','END'];
export const POLICY_FEATURES=Object.freeze(['economic_score','relative_score','cash_fraction','completes_group','blocks_group','building_level','cash_after','trade_size','learned_value_gain',...TYPES.map(t=>'action_'+t)]);
const bound=(n,a=-4,b=4)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:0));
export const dot=(weights,features)=>weights.reduce((n,w,i)=>n+w*features[i],0);
export function softmax(logits,temperature=1){const scaled=logits.map(x=>x/Math.max(.05,temperature)),max=Math.max(...scaled),exp=scaled.map(x=>Math.exp(x-max)),sum=exp.reduce((a,b)=>a+b,0);return exp.map(x=>x/sum);}

/** No decks, RNG, private memory or text prompt is a feature. Features are public
 * economic quantities. Training labels come exclusively from actual winners. */
export function valueFeatures(s,id){
 const p=s.players[id],own=BOARD.filter(t=>s.assets[t.id]?.owner===id),forecast=landingForecast(s,id,2);
 let equity=0,collateral=p.cash,income=0,developed=0,houses=0,hotels=0,mortgaged=0,exposure=0;
 for(const t of own){const a=s.assets[t.id];equity+=a.mortgaged?t.mortgage:t.price;equity+=(t.build||0)*a.level*.5;
  collateral+=(a.mortgaged?0:t.mortgage)+(t.build||0)*a.level*.5;
  if(a.mortgaged)mortgaged++;else{income+=rent(s,t.id,7);if(a.level)developed+=rent(s,t.id,7);}
  if(a.level===5)hotels++;else houses+=a.level;
 }
 for(const t of BOARD){const a=s.assets[t.id];if(a?.owner!=null&&a.owner!==id&&!a.mortgaged)exposure+=expectedRentAt(s,t.id,forecast);}
 let complete=0,near=0,built=0,unbuilt=0,construction=0;
 for(const g of GROUPS){const count=g.ids.filter(i=>s.assets[i].owner===id).length;
  if(count===g.ids.length){complete++;const level=g.ids.reduce((a,i)=>a+s.assets[i].level,0);if(level)built++;else unbuilt++;
   if(!g.ids.some(i=>s.assets[i].mortgaged))construction+=Math.min(3,Math.max(0,p.cash-exposure)/BOARD[g.ids[0]].build);
  }else if(count===g.ids.length-1)near++;
 }
 const debt=s.debt?.from===id?s.debt.amount:0,reserved=s.auction?.highest===id?s.auction.amount:0,cash=p.cash-reserved;
 const available=BOARD.filter(t=>t.price&&s.assets[t.id].owner===null).length/28;
 return [cash/15000,Math.log1p(Math.max(0,cash))/10,equity/15000,collateral/20000,income/20000,developed/20000,complete/3,near/4,built/3,houses/24,hotels/6,mortgaged/12,Math.max(0,debt-cash)/15000,exposure/5000,(cash-exposure)/15000,p.inJail?exposure/5000:0,available*Math.min(2,Math.max(0,cash)/6000),construction/9,unbuilt/3,(p.cards?.length||0)/3].map(n=>bound(n));
}
export function policyFeatures(s,id,candidate,plan,model=null,before=null){
 const action=candidate.action,p=s.players[id],t=BOARD[action.tile??(s.phase==='buy'?s.buy:s.auction?.tile)],cash=action.amount??(['BUY','BUILD','BUILD_JOIN'].includes(action.type)?(action.type==='BUY'?t?.price:t?.build):action.trade?.giveCash||0);
 let complete=0,block=0;
 if(t?.group>=0){const g=GROUPS[t.group];complete=g.ids.filter(i=>s.assets[i].owner===id).length===g.ids.length-1?1:0;block=s.players.some(q=>q.id!==id&&!q.out&&g.ids.filter(i=>s.assets[i].owner===q.id).length===g.ids.length-1)?1:0;}
 const top=Math.max(...plan.candidates.map(c=>c.score)),scale=Math.max(500,Math.abs(top));
 let gain=0;
 // Deterministic afterstates only. A bid is not a won property and an offer is
 // not an accepted trade; never hallucinate those settlements into the value.
 if(model&&['BUY','BUILD','BUILD_JOIN','REDEEM','MORTGAGE_REDEEM','MORTGAGE_KEEP','MORTGAGE','SELL','SELL_SET','TRADE_ACCEPT','JAIL_PAY','JAIL_CARD'].includes(action.type)){
  try{const next=command(ruleState({...s,log:[],seen:[]}),id,action,()=>.413),values=predictValues(next,model);gain=(values[id]-(before??predictValues(s,model)[id]))*12;}catch{}
 }
 return [Math.tanh(candidate.score/2000),bound((candidate.score-top)/scale,-4,0),cash/Math.max(1000,p.cash),complete,block,(s.assets[t?.id]?.level||0)/5,(p.cash-cash)/15000,(action.trade?(action.trade.give.length+action.trade.take.length)/4:0),gain,...TYPES.map(type=>action.type===type?1:0)].map(n=>bound(n));
}
export function createLearningModel(){
 const policy=Array(POLICY_FEATURES.length).fill(0);policy[0]=3;policy[1]=2;policy[8]=4;
 return {schema:LEARNING_SCHEMA,rulepack:RULEPACK.id,status:'candidate',valueFeatures:[...VALUE_FEATURES],policyFeatures:[...POLICY_FEATURES],value:Array(VALUE_FEATURES.length).fill(0),policy,training:{games:0,seedRanges:[]}};
}
export function validLearningModel(model){
 return !!model&&model.schema===LEARNING_SCHEMA&&model.rulepack===RULEPACK.id&&JSON.stringify(model.valueFeatures)===JSON.stringify(VALUE_FEATURES)&&JSON.stringify(model.policyFeatures)===JSON.stringify(POLICY_FEATURES)&&['candidate','promoted'].includes(model.status)&&['value','policy'].every(k=>Array.isArray(model[k])&&model[k].length===(k==='value'?VALUE_FEATURES.length:POLICY_FEATURES.length)&&model[k].every(w=>Number.isFinite(w)&&Math.abs(w)<=100));
}
export function predictValues(s,model){
 if(!validLearningModel(model))return null;
 const alive=s.players.filter(p=>!p.out),features=alive.map(p=>valueFeatures(s,p.id));
 if(s.phase==='won')return Object.fromEntries(s.players.map(p=>[p.id,p.id===s.winner?1:0]));
 const probabilities=softmax(features.map(x=>dot(model.value,x)));
 return Object.fromEntries(s.players.map(p=>[p.id,p.out?0:probabilities[alive.findIndex(q=>q.id===p.id)]]));
}
export function learnedPolicy(s,id,plan,model,{explore=false,rng=Math.random,temperature=.65}={}){
 if(!validLearningModel(model)||!plan.candidates.length)return null;
 // Hard obligations and rescues are governed by engine legality and the exact
 // rescue planner, not a stochastic recommendation from an unproven model.
 if(['starting','card','debt'].includes(s.phase)||plan.candidates[0].score>=1e7)return null;
 const best=plan.candidates[0],safe=plan.candidates.filter(c=>c.score>=0&&c.score>=best.score-Math.max(250,Math.abs(best.score)*.3));
 if(safe.length<2)return null;
 const before=predictValues(s,model)[id],features=safe.map(c=>policyFeatures(s,id,c,plan,model,before)),probabilities=softmax(features.map(x=>dot(model.policy,x)),temperature);
 let index=probabilities.indexOf(Math.max(...probabilities));
 if(explore){let draw=rng();index=probabilities.length-1;for(let i=0;i<probabilities.length;i++){draw-=probabilities[i];if(draw<=0){index=i;break;}}}
 return {action:safe[index].action,candidates:safe,features,probabilities,index};
}

/** Multiplayer softmax cross-entropy, using terminal outcomes, not net worth as
 * a substitute winner. Caller must split entire matches, not individual rows. */
export function fitValue(model,samples,{epochs=12,rate=.025,l2=.0005}={}){
 const losses=[];
 for(let epoch=0;epoch<epochs;epoch++){let loss=0;
  for(const sample of samples){
   const probabilities=softmax(sample.features.map(x=>dot(model.value,x)));
   for(let i=0;i<model.value.length;i++){let gradient=0;for(let j=0;j<sample.features.length;j++)gradient+=(probabilities[j]-(j===sample.winner?1:0))*sample.features[j][i];model.value[i]-=rate*(gradient+l2*model.value[i]);}
   loss-=Math.log(Math.max(1e-9,probabilities[sample.winner]));
  }
  losses.push(loss/Math.max(1,samples.length));
 }
 return losses;
}
/** On-policy REINFORCE with a pre-action value baseline. Rewards are terminal
 * win/loss; gradients must come from the exact policy which sampled the action. */
export function reinforcePolicy(model,episodes,{rate=.012,l2=.0002,temperature=.8}={}){
 let updates=0;const delta=Array(model.policy.length).fill(0);
 for(const episode of episodes){const decisions=episode.decisions||[];if(!decisions.length)continue;
  for(const d of decisions){const advantage=(episode.winner===d.actor?1:0)-d.baseline,chosen=d.features[d.index];
   for(let k=0;k<delta.length;k++){const expected=d.features.reduce((n,x,j)=>n+d.probabilities[j]*x[k],0);delta[k]+=advantage*(chosen[k]-expected)/temperature/Math.sqrt(decisions.length);}
   updates++;
  }
 }
 if(episodes.length)for(let k=0;k<model.policy.length;k++)model.policy[k]=bound(model.policy[k]+rate*(delta[k]/episodes.length-l2*model.policy[k]),-20,20);
 return updates;
}

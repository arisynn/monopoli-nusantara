import {BOARD,GROUPS,RULEPACK} from '../content.mjs';
import {rent,command} from '../game.mjs';
import {landingForecast,expectedRentAt} from './probability.mjs';
import {ruleState} from './candidates.mjs';
import {economyRules,strengthShares} from './economy.mjs';
import {stock} from '../game.mjs';
import {discreteCVaR,lossDistribution} from './risk.mjs';

export const LEARNING_SCHEMA=2;
const CORE=['cash','cash_log','equity','collateral','rent_power','developed_rent','complete_groups','near_groups','developed_groups','houses','hotels','mortgaged','debt_gap','rent_exposure','risk_runway','tail_exposure','acquisition_capacity','construction_capacity','unbuilt_monopoly','cards',...GROUPS.map((_,i)=>`group_${i}`)];
const AGG=[0,2,3,4,6,8,9,10,13,18];
export const VALUE_FEATURES=Object.freeze([...CORE.map(x=>'ego_'+x),...CORE.map(x=>'leader_'+x),...AGG.flatMap(i=>['others_max_'+CORE[i],'others_mean_'+CORE[i]]),
 'active_count','unowned','bank_houses','bank_hotels','development_phase','free_cash','mortgage_fraction','jail_fraction','own_construction_readiness','leader_strength_share','opponent_cash_mean','opponent_cash_min']);
const TYPES=['BUY','AUCTION','BID','PASS','BUILD','BUILD_JOIN','BUILD_DECLINE','REDEEM','MORTGAGE_REDEEM','MORTGAGE_KEEP','MORTGAGE','SELL','SELL_SET','OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT','JAIL_PAY','JAIL_CARD','ROLL','END'];
export const POLICY_FEATURES=Object.freeze(['economic_score','relative_score','cash_fraction','completes_group','blocks_group','building_level','cash_after','trade_size','learned_value_gain',...TYPES.map(t=>'action_'+t)]);
const bound=(n,a=-4,b=4)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:0));
export const dot=(weights,features)=>weights.reduce((n,w,i)=>n+w*features[i],0);
export function softmax(logits,temperature=1){const scaled=logits.map(x=>x/Math.max(.05,temperature)),max=Math.max(...scaled),exp=scaled.map(x=>Math.exp(x-max)),sum=exp.reduce((a,b)=>a+b,0);return exp.map(x=>x/sum);}

/** No decks, RNG, private memory or text prompt is a feature. Features are public
 * economic quantities. Training labels come exclusively from actual winners. */
function coreFeatures(s,id){
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
 const rules=economyRules(s),unit=rules.salary,start=rules.startingCash,tail=discreteCVaR(lossDistribution(s,id,1),.85).cvar;
 const groups=GROUPS.map(g=>{const owned=g.ids.filter(i=>s.assets[i].owner===id),count=owned.length;if(count<g.ids.length)return .7*count/g.ids.length;
  return .7+.3*owned.reduce((n,i)=>n+s.assets[i].level,0)/(5*g.ids.length);});
 return [cash/start,Math.log1p(Math.max(0,cash)/unit)/3,equity/start,collateral/(unit*10),income/(unit*10),developed/(unit*10),complete/8,near/8,built/8,houses/rules.houses,hotels/rules.hotels,mortgaged/28,Math.max(0,debt-cash)/start,exposure/(unit*2.5),(cash-tail)/start,tail/(unit*2.5),available*Math.min(2,Math.max(0,cash)/(unit*3)),construction/24,unbuilt/8,(p.cards?.length||0)/4,...groups].map(n=>bound(n));
}
export function valueFeatures(s,id){
 const alive=s.players.filter(p=>!p.out),cores=new Map(alive.map(p=>[p.id,coreFeatures(s,p.id)])),shares=strengthShares(s,BOARD,GROUPS,rent);
 const own=cores.get(id)||Array(28).fill(0),opponents=alive.filter(p=>p.id!==id).sort((a,b)=>shares[b.id]-shares[a.id]||a.id-b.id),leader=opponents[0],rest=opponents.slice(1),aggregate=[];
 for(const i of AGG){const values=rest.map(p=>cores.get(p.id)[i]);aggregate.push(Math.max(0,...values),values.reduce((a,b)=>a+b,0)/Math.max(1,values.length));}
 const rules=economyRules(s),bank=stock(s),properties=Object.values(s.assets),otherCash=opponents.map(p=>p.cash/rules.startingCash);
 const globals=[alive.length/6,BOARD.filter(t=>t.price&&s.assets[t.id].owner===null).length/28,bank.houses/rules.houses,bank.hotels/rules.hotels,properties.reduce((n,a)=>n+a.level,0)/140,
  Math.max(0,own[0]-own[13]),properties.filter(a=>a.mortgaged).length/28,alive.filter(p=>p.inJail).length/6,own[17],Math.max(0,...Object.values(shares)),otherCash.reduce((a,b)=>a+b,0)/Math.max(1,otherCash.length),otherCash.length?Math.min(...otherCash):0];
 return [...own,...(leader?cores.get(leader.id):Array(28).fill(0)),...aggregate,...globals].map(n=>bound(n));
}
export function policyFeatures(s,id,candidate,plan,model=null,before=null){
 const action=candidate.action,p=s.players[id],t=BOARD[action.tile??(s.phase==='buy'?s.buy:s.auction?.tile)],cash=action.amount??(['BUY','BUILD','BUILD_JOIN'].includes(action.type)?(action.type==='BUY'?t?.price:t?.build):action.trade?.giveCash||0);
 let complete=0,block=0;
 if(t?.group>=0){const g=GROUPS[t.group];complete=g.ids.filter(i=>s.assets[i].owner===id).length===g.ids.length-1?1:0;block=s.players.some(q=>q.id!==id&&!q.out&&g.ids.filter(i=>s.assets[i].owner===q.id).length===g.ids.length-1)?1:0;}
 const rules=economyRules(s),top=Math.max(...plan.candidates.map(c=>c.score)),scale=Math.max(rules.salary*.25,Math.abs(top));
 let gain=0;
 // Deterministic afterstates only. A bid is not a won property and an offer is
 // not an accepted trade; never hallucinate those settlements into the value.
 if(model&&['BUY','BUILD','BUILD_JOIN','REDEEM','MORTGAGE_REDEEM','MORTGAGE_KEEP','MORTGAGE','SELL','SELL_SET','TRADE_ACCEPT','JAIL_PAY','JAIL_CARD'].includes(action.type)){
  try{const next=command(ruleState({...s,log:[],seen:[]}),id,action,()=>.413),values=predictValues(next,model);gain=(values[id]-(before??predictValues(s,model)[id]))*12;}catch{}
 }
 return [Math.tanh(candidate.score/rules.salary),bound((candidate.score-top)/scale,-4,0),cash/Math.max(rules.salary*.5,p.cash),complete,block,(s.assets[t?.id]?.level||0)/5,(p.cash-cash)/rules.startingCash,(action.trade?(action.trade.give.length+action.trade.take.length)/4:0),gain,...TYPES.map(type=>action.type===type?1:0)].map(n=>bound(n));
}
export function createLearningModel({hidden=0}={}){
 const policy=Array(POLICY_FEATURES.length).fill(0);policy[0]=3;policy[1]=2;policy[8]=4;
 if(!Number.isInteger(hidden)||hidden<0||hidden>32)throw RangeError('Invalid tiny value network width');
 let seed=7291;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/4294967296-.5)*.04;};
 const valueNetwork=hidden?{hidden,input:VALUE_FEATURES.length,weights:Array.from({length:hidden*VALUE_FEATURES.length},random),bias:Array(hidden).fill(0),output:Array(hidden).fill(0),offset:0}:null;
 return {schema:LEARNING_SCHEMA,rulepack:RULEPACK.id,status:'candidate',valueFeatures:[...VALUE_FEATURES],policyFeatures:[...POLICY_FEATURES],value:Array(VALUE_FEATURES.length).fill(0),policy,valueNetwork,training:{games:0,seedRanges:[]}};
}
export function validLearningModel(model){
 const finite=xs=>Array.isArray(xs)&&xs.every(w=>Number.isFinite(w)&&Math.abs(w)<=100),n=model?.valueNetwork;
 const validNetwork=!n||(Number.isInteger(n.hidden)&&n.hidden>0&&n.hidden<=32&&n.input===VALUE_FEATURES.length&&finite(n.weights)&&n.weights.length===n.hidden*n.input&&finite(n.bias)&&n.bias.length===n.hidden&&finite(n.output)&&n.output.length===n.hidden&&Number.isFinite(n.offset)&&Math.abs(n.offset)<=100);
 return !!model&&model.schema===LEARNING_SCHEMA&&model.rulepack===RULEPACK.id&&JSON.stringify(model.valueFeatures)===JSON.stringify(VALUE_FEATURES)&&JSON.stringify(model.policyFeatures)===JSON.stringify(POLICY_FEATURES)&&['candidate','promoted'].includes(model.status)&&validNetwork&&['value','policy'].every(k=>finite(model[k])&&model[k].length===(k==='value'?VALUE_FEATURES.length:POLICY_FEATURES.length));
}
function hiddenValues(network,features){return network.bias.map((b,j)=>{let sum=b;for(let i=0;i<features.length;i++)sum+=network.weights[j*features.length+i]*features[i];return Math.tanh(sum);});}
export function valueLogit(model,features){const n=model.valueNetwork;return dot(model.value,features)+(n?dot(n.output,hiddenValues(n,features))+n.offset:0);}
export function predictValues(s,model){
 if(!validLearningModel(model))return null;
 const alive=s.players.filter(p=>!p.out),features=alive.map(p=>valueFeatures(s,p.id));
 if(s.phase==='won')return Object.fromEntries(s.players.map(p=>[p.id,p.id===s.winner?1:0]));
 const probabilities=softmax(features.map(x=>valueLogit(model,x)));
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
   const targets=sample.targets||sample.features.map((_,i)=>i===sample.winner?1:0);
   if(targets.length!==sample.features.length||targets.some(x=>!Number.isFinite(x)||x<0)||Math.abs(targets.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Value target must be an undiscounted probability distribution');
   const probabilities=softmax(sample.features.map(x=>valueLogit(model,x))),errors=probabilities.map((p,j)=>p-targets[j]);
   const n=model.valueNetwork,hidden=n?sample.features.map(x=>hiddenValues(n,x)):null,output=n?[...n.output]:null;
   for(let i=0;i<model.value.length;i++){let gradient=0;for(let j=0;j<sample.features.length;j++)gradient+=errors[j]*sample.features[j][i];model.value[i]=bound(model.value[i]-rate*(bound(gradient,-5,5)+l2*model.value[i]),-20,20);}
   if(n)for(let h=0;h<n.hidden;h++){
    const gradient=errors.reduce((sum,e,j)=>sum+e*hidden[j][h],0);n.output[h]=bound(n.output[h]-rate*(gradient+l2*n.output[h]),-20,20);
    const derivatives=errors.map((e,j)=>e*output[h]*(1-hidden[j][h]**2));n.bias[h]=bound(n.bias[h]-rate*derivatives.reduce((a,b)=>a+b,0),-20,20);
    for(let i=0;i<n.input;i++){const k=h*n.input+i,g=derivatives.reduce((sum,d,j)=>sum+d*sample.features[j][i],0);n.weights[k]=bound(n.weights[k]-rate*(bound(g,-5,5)+l2*n.weights[k]),-20,20);}
   }
   loss-=targets.reduce((sum,t,j)=>sum+t*Math.log(Math.max(1e-9,probabilities[j])),0);
  }
  losses.push(loss/Math.max(1,samples.length));
 }
 return losses;
}

/** Frozen-model TD(lambda), gamma=1: estimates eventual victory probability,
 * not a time-discounted reward. Each frame carries absolute public player IDs. */
export function tdLambdaSamples(model,episode,{lambda=.8}={}){
 if(!Number.isFinite(lambda)||lambda<0||lambda>1)throw RangeError('Invalid TD lambda');
 if(!episode||episode.winner==null)return [];
 const frames=[...(episode.frames||[])].sort((a,b)=>a.serial-b.serial),out=[];let nextReturn=null,nextBootstrap=null;
 for(let k=frames.length-1;k>=0;k--){const frame=frames[k],terminal=Object.fromEntries(frame.ids.map(id=>[id,id===episode.winner?1:0]));
  const target=frame.ids.map(id=>nextReturn?(1-lambda)*(nextBootstrap[id]||0)+lambda*(nextReturn[id]||0):terminal[id]);
  const total=target.reduce((a,b)=>a+b,0);if(total<=0)continue;const normalized=target.map(x=>x/total);
  out.unshift({...frame,targets:normalized,winner:frame.ids.indexOf(episode.winner)});nextReturn=Object.fromEntries(frame.ids.map((id,i)=>[id,normalized[i]]));
  const p=softmax(frame.features.map(x=>valueLogit(model,x)));nextBootstrap=Object.fromEntries(frame.ids.map((id,i)=>[id,p[i]]));
 }
 return out;
}

/** Advantage-weighted regression with a KL anchor to the sampling policy.
 * Baseline REINFORCE remains exported solely for ablations and old reports. */
export function advantageWeightedPolicy(model,episodes,{rate=.01,beta=.3,temperature=.8,anchor=.1,l2=.0002}={}){
 const delta=Array(model.policy.length).fill(0);let updates=0;
 for(const episode of episodes){if(episode.winner==null)continue;const targets=tdLambdaSamples(model,episode);
  for(const d of episode.decisions||[]){
   const frame=targets.find(f=>f.serial>d.serial),target=frame?frame.targets[frame.ids.indexOf(d.actor)]||0:Number(episode.winner===d.actor);
   const advantage=target-d.baseline,weight=Math.exp(bound(advantage/Math.max(.05,beta),-3,3));
   const p=softmax(d.features.map(x=>dot(model.policy,x)),temperature);
   for(let i=0;i<delta.length;i++){const expected=d.features.reduce((n,x,j)=>n+p[j]*x[i],0),oldExpected=d.features.reduce((n,x,j)=>n+d.probabilities[j]*x[i],0);
    delta[i]+=(weight*(d.features[d.index][i]-expected)-anchor*(expected-oldExpected))/temperature;
   }updates++;
  }
 }
 if(updates)for(let i=0;i<delta.length;i++)model.policy[i]=bound(model.policy[i]+rate*(delta[i]/updates-l2*model.policy[i]),-20,20);
 return updates;
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,command,BOARD,GROUPS,stock,decisionActor,rent} from '../lib/game.mjs';
import {discreteCVaR,lossDistribution,riskReserve} from '../lib/bot/risk.mjs';
import {analyzeState,rationalBidLimit} from '../lib/bot/analysis.mjs';
import {mortgageSubset,rescuePlan} from '../lib/bot/liquidation.mjs';
import {allocateDevelopment,postTradeDevelopment,replayManagement} from '../lib/bot/allocation.mjs';
import {canonicalTradeDelta,evaluateTrade,paretoFrontier,negotiationCandidates} from '../lib/bot/negotiation.mjs';
import {ScenarioRandom} from '../lib/bot/scenario-random.mjs';
import {createLearningModel,validLearningModel,valueFeatures,VALUE_FEATURES,tdLambdaSamples,advantageWeightedPolicy,fitValue,predictValues} from '../lib/bot/learning.mjs';
import {concessionOrder,rejectionActive,ownershipKey,negotiationContext} from '../lib/bot/concessions.mjs';
import {recordBotMemory,memoryFor} from '../lib/bot/memory.mjs';
import {tradeRetryVerdict} from '../lib/bot/trade-memory.mjs';
import {planDecision} from '../lib/bot/strategy.mjs';
import {seeded,decideMind,rolloutPolicy} from '../lib/bot/mind.mjs';
const setup=(n=3)=>createGame({players:Array.from({length:n},(_,id)=>({name:'P'+id,controller:'bot',botPersona:['raka','bima','sari'][id%3]})),startingRoll:false,matchId:'hybrid'},seeded(9));
const own=(s,t,id,level=0)=>Object.assign(s.assets[t],{owner:id,level});
const trade=(to,patch={})=>({to,give:[],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0,...patch});
test('CVaR splits discrete probability atoms, handles exact quantiles and normalized masses',()=>{
 const a=discreteCVaR([{loss:0,prob:.95},{loss:1500,prob:.05}],.9);assert.equal(a.var,0);assert(Math.abs(a.cvar-750)<1e-8);assert.equal(a.mean,75);
 assert.equal(discreteCVaR([{loss:0,prob:.9},{loss:100,prob:.1}],.9).var,0);
 assert.equal(discreteCVaR([{loss:20,prob:2},{loss:100,prob:2}],0).cvar,60);
 assert.equal(discreteCVaR([{loss:7,prob:1}],.95).cvar,7);assert.throws(()=>discreteCVaR([],1));
});
test('cash-path distribution conserves probability and cannot inspect shuffled decks/private persona',()=>{
 const s=setup(6);s.players[0].pos=34;own(s,37,1,5);own(s,39,1,5);const copy=structuredClone(s);copy.decks.chance.reverse();copy.players[1].botPersona='sari';
 for(const n of [1,2]){const rows=lossDistribution(s,0,n);assert(Math.abs(rows.reduce((n,x)=>n+x.prob,0)-1)<1e-9);assert.deepEqual(rows,lossDistribution(copy,0,n));assert.throws(()=>{rows[0].loss=8;});}
});
test('one-roll cash-risk projection matches real engine across all dice and public card draws',()=>{
 const s=setup();s.players.forEach(p=>p.cash=1000000);s.players[0].pos=0;for(const t of BOARD.filter(t=>t.price))own(s,t.id,1,t.type==='city'?2:0);
 const predicted=lossDistribution(s,0,1).reduce((n,x)=>n+x.loss*x.prob,0);let actual=0;
 for(let x=1;x<=6;x++)for(let y=1;y<=6;y++)for(let card=0;card<16;card++){
  const w=structuredClone(s);for(const deck of ['chance','community'])w.decks[deck]=[card,...w.decks[deck].filter(i=>i!==card)];let i=0;
  let leaf=command(w,0,{type:'ROLL'},()=>i++===0?(x-.5)/6:(y-.5)/6);
  const variants=leaf.card?.utilityRoll?36:1;
  for(let u=0;u<variants;u++){let next=leaf,k=0;while(next.phase==='card')next=command(next,0,{type:'ACK'},()=>k++===0?(Math.floor(u/6)+.5)/6:(u%6+.5)/6);
   actual+=Math.max(0,w.players[0].cash-next.players[0].cash)/(36*16*variants);
  }
 }
 // Includes the card's independent utility dice. From square zero there is no
 // chance -> community recursion, so one public draw covers every card branch.
 assert(Math.abs(predicted-actual)<1e-7,`${predicted} vs ${actual}`);
});
test('salary is credited along forward movement; backward and jail teleports never earn it',()=>{
 const s=setup();s.players[0].pos=38;own(s,1,1,0);own(s,3,1,0);
 const afterGo=discreteCVaR(lossDistribution(s,0,1),.8).mean;
 s.players[0].pos=0;const noGo=discreteCVaR(lossDistribution(s,0,1),.8).mean;assert(afterGo<noGo);
 s.players[0].pos=26;s.doubles=2;const rows=lossDistribution(s,0,1);assert(rows.some(x=>x.loss===0));
});
test('reserve includes tail risk but discounts legally mortgageable standalone collateral',()=>{
 const s=setup();s.players[0].pos=30;own(s,37,1,5);own(s,39,1,5);const before=riskReserve(s,0);
 own(s,5,0);own(s,15,0);const after=riskReserve(s,0);assert(after.buffer>before.buffer);assert(after.reserve<before.reserve);assert.equal(after.horizonRolls,2);
});
test('mortgage DP matches exhaustive subset objective on a small independent portfolio',()=>{
 const s=setup();for(const t of [1,6,12,15,31])own(s,t,0);s.players[0].cash=0;s.phase='debt';s.debt={from:0,to:null,amount:1900,label:'test'};
 const a=analyzeState(s,0),p=mortgageSubset(s,0,1900,a);assert(p?.exact);assert(p.raised>=1900);
 let next=s;for(const action of p.path)next=command(next,0,action);assert(next.players[0].cash>=1900);
 assert.equal(new Set(p.path.map(a=>a.tile)).size,p.path.length);
 const tiles=[1,6,12,15,31];let best=Infinity;
 for(let bits=0;bits<1<<tiles.length;bits++){let cash=0,damage=0,count=0;for(let k=0;k<tiles.length;k++)if(bits>>k&1){const t=BOARD[tiles[k]];cash+=t.mortgage;count++;damage+=Math.max(0,t.price*.8-t.mortgage*.95-t.mortgage+rent(s,t.id,7)*a.probability(t.id)*a.others.length*a.persona.horizon);}
  if(cash>=1900)best=Math.min(best,damage+(cash-1900)*.015+count*.05);
 }
 assert(Math.abs(p.damage+(p.raised-1900)*.015+p.path.length*.05-best)<1e-7);
});
test('zero optimization budget still rescues debt needing many mortgages without false bankruptcy',()=>{
 const s=setup();for(const t of [5,12,15,25,28,35])own(s,t,0);s.players[0].cash=0;s.phase='debt';s.debt={from:0,to:1,amount:5200,label:'test'};
 const p=rescuePlan(s,0,analyzeState(s,0),{maxNodes:0,timeBudgetMs:0});assert(p);assert(p.budgetExhausted);
 let next=s;for(const a of p.path)next=command(next,0,a);assert(next.players[0].cash>=5200);
});
test('hotel shortage rescue uses existing SELL_SET and never invents an illegal partial breakdown',()=>{
 const s=setup();own(s,37,0,5);own(s,39,0,5);for(const t of [1,3,6,8,9,11,13,14])own(s,t,1,4);s.players[0].cash=0;s.phase='debt';s.debt={from:0,to:1,amount:3000,label:'test'};
 const p=rescuePlan(s,0,analyzeState(s,0),{maxNodes:0,timeBudgetMs:0});assert(p);assert.equal(p.path[0].type,'SELL_SET');let next=s;
 for(const a of p.path)next=command(next,0,a);assert(next.players[0].cash>=3000);assert(stock(next).houses>=0);
});
test('development can go beyond three houses to hotels when cash and stock make it useful',()=>{
 const s=setup();own(s,1,0,3);own(s,3,0,3);s.players[0].cash=25000;
 const p=allocateDevelopment(s,0,{reserve:1000});assert(p.path.length>0);assert(p.state.assets[3].level>3);
 const actual=replayManagement(s,0,p.path);assert(actual.complete);assert.deepEqual(actual.state.assets,p.state.assets);assert.equal(s.assets[3].level,3);
});
test('trade development projections share physical stock and cannot allocate the same house twice',()=>{
 const s=setup(3);for(const t of [1,3])own(s,t,0);for(const t of [6,8,9])own(s,t,1);for(const t of [11,13,14,16,18,19,21])own(s,t,2,4);own(s,23,2,2);
 assert.equal(stock(s).houses,2);const outputs=postTradeDevelopment(s,[0,1]);assert.equal(outputs.length,2);
 for(const o of outputs){assert(stock(o.state).houses>=0);assert(o.plans.reduce((n,p)=>n+p.buildings,0)<=2);}
});
test('canonical barter preserves sender/receiver direction, fees and original state',()=>{
 const s=setup();own(s,39,0);s.assets[39].mortgaged=true;const t=trade(1,{give:[39],giveCash:250,takeCash:100});const before=JSON.stringify(s),d=canonicalTradeDelta(s,t,0);
 assert.equal(d.deltas[0].cash,-150);assert.equal(d.deltas[1].cash,150-200);assert.deepEqual(d.deltas[1].received,[39]);evaluateTrade(s,1,t,0);assert.equal(JSON.stringify(s),before);
});
test('200 deterministic gift/payment cases cannot exploit fee solvency or reverse cash perspective',()=>{
 for(let i=0;i<200;i++){
  const s=setup();const persona=['raka','bima','sari'][i%3];s.players[1].botPersona=persona;own(s,39,0);
  if(i%4===0){s.assets[39].mortgaged=true;s.players[1].cash=0;assert(evaluateTrade(s,1,trade(1,{give:[39]}),0).insolventAfterFees);}
  else if(i%4===1){const v=evaluateTrade(s,1,trade(1,{give:[39]}),0);assert(v.freeBeneficial);assert(v.net>0);}
  else if(i%4===2){const v=evaluateTrade(s,1,trade(1,{takeCash:500+i}),0);assert(v.unilateralLoss);assert(v.net<0);}
  else{const amount=50+i,t=trade(1,{giveCash:amount});assert.equal(canonicalTradeDelta(s,t,0).deltas[1].cash,amount);assert(evaluateTrade(s,1,t,0).net>0);}
 }
});
test('both sides post-trade development, Pareto filtering and anti-leader context are public',()=>{
 const s=setup(4);own(s,1,0);own(s,3,1);own(s,6,1);own(s,8,1);own(s,9,0);for(const t of [16,18,19])own(s,t,2,4);s.players[2].cash=50000;
 const t=trade(1,{give:[9],take:[3]}),a=evaluateTrade(s,0,t,0);assert(a.postDevelopment.length===2);assert(a.postDevelopment.some(o=>o.plans.some(p=>p.buildings>0)));assert(a.catchUp);
 const copy=structuredClone(s);copy.players[1].controller='human';copy.players[1].botPersona='sari';assert.equal(evaluateTrade(copy,0,t,0).net,a.net);
 const rows=[{trade:{to:1},own:10,partner:5},{trade:{to:1},own:9,partner:4},{trade:{to:2},own:1,partner:1}];assert.equal(paretoFrontier(rows).length,2);
});
test('offer-specific refusals replace recipient cooldown, legacy cooldown and concession feedback survive save',()=>{
 let s=setup();own(s,1,0);s.phase='end';const a={type:'OFFER',trade:trade(1,{give:[1],takeCash:100})};s=command(s,0,a);s=command(s,1,{type:'TRADE_REJECT'});
 assert(!rejectionActive(s,memoryFor(s,0),1));assert(!tradeRetryVerdict(s,0,a.trade).allowed);
 const legacy=structuredClone(memoryFor(s,0));delete legacy.tradeHistory;assert(rejectionActive(s,legacy,1));
 assert.equal(concessionOrder(s,1).length,4);
 const roundTrip=JSON.parse(JSON.stringify(s));assert.deepEqual(concessionOrder(roundTrip,1),concessionOrder(s,1));
 own(s,3,2);assert(!rejectionActive(s,legacy,1));assert(tradeRetryVerdict(s,0,a.trade).allowed);assert.equal(roundTrip.botMemory.players[0].rejections[1].ownership,ownershipKey(roundTrip));
 const arms=roundTrip.botMemory.opponents[1].concessions[negotiationContext(roundTrip)];assert.equal(arms.reduce((n,a)=>n+a.rejected,0),1);
});
test('counteroffers stop at depth two',()=>{
 let s=setup();own(s,1,0);s=command(s,0,{type:'OFFER',trade:trade(1,{give:[1],takeCash:10000})});s.botMemory.negotiation.depth=2;
 assert(!negotiationCandidates(s,1,analyzeState(s,1)).some(c=>c.type==='COUNTER'));
});
test('outgoing proposal rankings do not depend on the recipient controller or persona',()=>{
 const s=setup(4);s.phase='end';own(s,1,0);own(s,3,1);own(s,6,1);own(s,8,1);own(s,9,0);const copy=structuredClone(s);copy.players[1].botPersona='sari';copy.players[1].controller='human';
 assert.deepEqual(planDecision(s,0).candidates,planDecision(copy,0).candidates);
});
test('simulated recipients can decline a priced offer; offers never imply automatic settlement',()=>{
 let s=setup();own(s,1,0);s=command(s,0,{type:'OFFER',trade:trade(1,{give:[1],takeCash:100})});
 assert.equal(rolloutPolicy(s,1,()=>0,{rootActor:0}).type,'TRADE_ACCEPT');assert.equal(rolloutPolicy(s,1,()=>.999,{rootActor:0}).type,'TRADE_REJECT');
});
test('indifference auction cap accounts for liquidity and re-entry resets exactly as engine specifies',()=>{
 let s=setup();s.phase='buy';s.buy=19;s=command(s,0,{type:'AUCTION'});s=command(s,1,{type:'PASS'});assert(s.auction.passed.includes(1));s=command(s,2,{type:'BID',amount:100});assert(!s.auction.passed.includes(1));
 const a=analyzeState(s,1),cap=rationalBidLimit(s,1,2000,a);assert(cap<=2000);assert.equal(cap%10,0);s.players[1].cash=700;assert(rationalBidLimit(s,1,2000,analyzeState(s,1))<=700);
});
test('CRN movement streams do not drift after extra utility/response events',()=>{
 const a=new ScenarioRandom(123),b=new ScenarioRandom(123),s=setup();const first=a.forAction(s,0,{type:'ROLL'});first();first();
 const same=b.forAction(s,0,{type:'ROLL'});same();same();b.stream(0,0,'utility-dice')();b.policy(s,1)();
 const next={...s,turnSerial:1};const x=a.forAction(next,1,{type:'ROLL'}),y=b.forAction(next,1,{type:'ROLL'});assert.deepEqual([x(),x()],[y(),y()]);
 const nextDouble=a.forAction(s,0,{type:'ROLL'});assert.notEqual(nextDouble(),new ScenarioRandom(123).forAction(s,0,{type:'ROLL'})());
});
test('coordinate dice remain distributed across all faces',()=>{
 const counts=Array(6).fill(0);for(let seed=0;seed<6000;seed++)counts[Math.floor(new ScenarioRandom(seed).uniform(3,2,'movement-dice',0)*6)]++;
 assert(counts.every(n=>n>850&&n<1150));
});
test('88-dimensional features support 2..6 players and ignore opponent controller/persona',()=>{
 assert.equal(VALUE_FEATURES.length,88);for(const n of [2,3,4,5,6]){const s=setup(n),f=valueFeatures(s,0);assert.equal(f.length,88);assert(f.every(Number.isFinite));const copy=structuredClone(s);copy.players[1].controller='human';copy.players[1].botPersona='sari';assert.deepEqual(f,valueFeatures(copy,0));}
 const m=createLearningModel({hidden:8});assert(validLearningModel(m));m.schema=1;assert(!validLearningModel(m));
});
test('tiny MLP value fitting learns without external inference dependencies',()=>{
 const m=createLearningModel({hidden:8}),x=Array(88).fill(0),y=Array(88).fill(0);x[0]=1;y[0]=-1;
 const losses=fitValue(m,Array.from({length:30},()=>({features:[x,y],winner:0})),{epochs:5});assert(losses.at(-1)<losses[0]);assert(m.valueNetwork.output.some(v=>v!==0));assert(validLearningModel(m));
});
test('TD(lambda) uses undiscounted normalized winner targets despite irregular decision timing',()=>{
 const m=createLearningModel(),x=Array(88).fill(0),frames=[{serial:0,ids:[0,1,2],features:[x,x,x]},{serial:50,ids:[0,2],features:[x,x]}],samples=tdLambdaSamples(m,{winner:2,frames});
 assert(samples.every(f=>Math.abs(f.targets.reduce((a,b)=>a+b,0)-1)<1e-9));assert.equal(samples[0].targets[1],0);assert.equal(samples[1].targets[1],1);assert.equal(tdLambdaSamples(m,{winner:null,frames}).length,0);
 assert.throws(()=>fitValue(m,[{features:[x,x],targets:[.1,.2]}]));
});
test('AWR increases a rewarded action while capped games produce no policy updates',()=>{
 const m=createLearningModel(),x=Array(m.policy.length).fill(0),y=[...x];x[3]=1;y[3]=-1;const before=m.policy[3];
 assert.equal(advantageWeightedPolicy(m,[{winner:null,decisions:[]}]),0);assert.equal(advantageWeightedPolicy(m,[{winner:0,decisions:[{actor:0,serial:0,features:[x,y],probabilities:[.5,.5],index:0,baseline:.5}]}]),1);assert(m.policy[3]>before);
});

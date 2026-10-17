import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,command,BOARD,GROUPS,DECKS} from '../lib/game.mjs';
import {landingForecast,expectedRentAt} from '../lib/bot/probability.mjs';
import {analyzeState,landingProbabilities} from '../lib/bot/analysis.mjs';
import {rescuePlan} from '../lib/bot/liquidation.mjs';
import {developmentRoutes} from '../lib/bot/development.mjs';
import {planDecision} from '../lib/bot/strategy.mjs';
import {evaluateTrade,negotiationCandidates,tradeAcceptance} from '../lib/bot/negotiation.mjs';
import {createLearningModel,fitValue,reinforcePolicy,valueFeatures,predictValues,learnedPolicy,validLearningModel,POLICY_FEATURES} from '../lib/bot/learning.mjs';
import {decideMind,seeded,observation,rolloutPolicy} from '../lib/bot/mind.mjs';
import {runMatch} from '../scripts/mind-learning-lab.mjs';
import {cycleFingerprint} from '../scripts/mind-lab-utils.mjs';
const setup=(n=3)=>createGame({players:Array.from({length:n},(_,id)=>({name:'P'+id,controller:'bot',botPersona:['raka','bima','sari'][id%3]})),startingRoll:false,matchId:'learning-test'},seeded(12));
const own=(s,t,id,level=0)=>Object.assign(s.assets[t],{owner:id,level});

test('forecast keeps jail confinement across future rolls and differentiates visiting',()=>{
 const s=setup();s.players[0].pos=10;s.players[0].inJail=true;s.players[0].jail=0;
 const one=landingForecast(s,0,1),two=landingForecast(s,0,2);
 assert(one.visits[10]>=30/36);assert(two.visits[10]>1.4);
 s.players[0].inJail=false;assert(landingForecast(s,0,1).visits[10]<one.visits[10]);
});
test('third jail attempt moves and predicts the mandatory fine only on non-double',()=>{
 const s=setup();s.players[0].pos=10;s.players[0].inJail=true;s.players[0].jail=2;
 const f=landingForecast(s,0,1);assert(Math.abs(f.jailFine-500*30/36)<1e-9);assert(f.visits[10]<.1);
});
test('third double goes to jail and cached forecasts conserve probability',()=>{
 const s=setup();s.doubles=2;
 assert(landingForecast(s,0,1).visits[10]>=1/6);
 for(const steps of [1,2,3,6])assert(Math.abs(landingProbabilities(s,0,steps).reduce((a,b)=>a+b,0)-steps)<1e-8);
});
test('one-roll public jail forecast matches all dice outcomes and all public card draws in the real engine',()=>{
 const s=setup();s.players[0].pos=10;s.players[0].inJail=true;s.players[0].jail=2;
 const expected=landingForecast(s,0,1).visits,actual=Array(40).fill(0);
 for(let x=1;x<=6;x++)for(let y=1;y<=6;y++)for(let draw=0;draw<16;draw++){
  const world=structuredClone(s);for(const deck of ['chance','community'])world.decks[deck]=[draw,...world.decks[deck].filter(i=>i!==draw)];
  let cursor=0,leaf=command(world,0,{type:'ROLL'},()=>cursor++===0?(x-.5)/6:(y-.5)/6);
  for(let i=0;i<4&&leaf.phase==='card';i++)leaf=command(leaf,0,{type:'ACK'},()=>.5);
  actual[leaf.players[0].pos]+=1/(36*16);
 }
 for(let tile=0;tile<40;tile++)assert(Math.abs(expected[tile]-actual[tile])<1e-9,`tile ${tile}`);
});
test('chance station premium contributes to expected rent; hidden order never changes forecasts',()=>{
 const s=setup();s.players[0].pos=29;for(const t of [5,15,25,35])own(s,t,1);
 const f=landingForecast(s,0,2);assert(f.rentWeights.some((v,i)=>v>f.visits[i]+1e-8));
 assert([5,15,25,35].some(t=>expectedRentAt(s,t,f)>f.visits[t]*2000));
 const hidden=structuredClone(s);hidden.decks.chance.reverse();hidden.decks.community.reverse();assert.deepEqual(f,landingForecast(hidden,0,2));
});
test('probability cache cannot be corrupted by a caller',()=>{const s=setup(),f=landingForecast(s,0,1);assert.throws(()=>{f.visits[0]=400;});assert(landingForecast(s,0,1).visits[0]<1);});
test('rescue plans can fund obligations requiring more than four legal mortgages',()=>{
 const s=setup();for(const tile of [5,12,15,25,28,35])own(s,tile,0);s.players[0].cash=0;s.phase='debt';s.debt={from:0,to:1,amount:5200,label:'test'};
 const plan=rescuePlan(s,0,analyzeState(s,0));assert(plan);assert(plan.path.length>=5);let next=s;
 for(const action of plan.path)next=command(next,0,action,seeded(1));assert(next.players[0].cash>=5200);assert.equal(s.players[0].cash,0);
});
test('investment route actually makes a funding action competitive without dismantling a complete group',()=>{
 const s=setup(4);for(const t of [16,18,19])own(s,t,0);for(const t of [5,12,15,25])own(s,t,0);s.players[0].cash=6500;
 const routes=developmentRoutes(s,0,analyzeState(s,0));assert(routes.length);const p=planDecision(s,0);assert(p.summary.investmentRoutes.length);
 assert(routes.every(r=>r.funding.every(i=>![16,18,19].includes(i))));assert.doesNotThrow(()=>command(s,0,routes[0].first));
});
test('development funding does not assume houses that the bank cannot supply',()=>{
 const s=setup(4);for(const t of [16,18,19])own(s,t,0);for(const t of [5,12,15,25])own(s,t,0);s.players[0].cash=6500;
 for(const t of [1,3,6,8,9,11,13])own(s,t,1,4);
 const routes=developmentRoutes(s,0,analyzeState(s,0));
 assert(routes.every(r=>r.funding.length===0),'Scarce houses must not induce mortgages to fund an impossible group milestone.');
 for(const route of routes){let next=s;for(const action of route.path)next=command(next,0,action);assert(next.bank.houses>=0);}
});
test('all personas reject a free mortgaged deed whose mandatory fee would force immediate insolvency',()=>{
 for(const persona of ['raka','bima','sari']){
  let s=setup();s.players[1].botPersona=persona;s.players[1].cash=0;own(s,39,0);s.assets[39].mortgaged=true;
  s=command(s,0,{type:'OFFER',trade:{to:1,give:[39],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0}});
  const v=evaluateTrade(s,1,s.trade,0);assert(v.insolventAfterFees);assert(v.net<0);assert.notEqual(planDecision(s,1).action.type,'TRADE_ACCEPT');
  s.players[1].cash=300;assert(!evaluateTrade(s,1,s.trade,0).insolventAfterFees);assert.equal(planDecision(s,1).action.type,'TRADE_ACCEPT');
 }
});
test('negotiation explores asset bundles and multiple cash allocations with legal direction',()=>{
 const s=setup(4);s.phase='end';for(const t of [16])own(s,t,0);for(const t of [18,19])own(s,t,1);for(const t of [1,6,8])own(s,t,0);for(const t of [3,9])own(s,t,1);
 const offers=negotiationCandidates(s,0,analyzeState(s,0));assert(offers.length>1);assert(offers.some(c=>c.trade.take.length===2||c.trade.give.length===2));
 for(const c of offers)assert.doesNotThrow(()=>command(s,0,c));
});
test('public trade response memory influences willingness and survives bid updates',()=>{
 let s=setup();const t={to:1,give:[],take:[],giveCash:100,takeCash:0,giveCards:0,takeCards:0};s=command(s,0,{type:'OFFER',trade:t});s=command(s,1,{type:'TRADE_ACCEPT'});
 assert.equal(s.botMemory.opponents[1].tradeAccepted,1);const positive=tradeAcceptance(s,1,{net:100,raw:100});s.botMemory.opponents[1].tradeRejected=20;assert(tradeAcceptance(s,1,{net:100,raw:100})<positive);
 s.phase='buy';s.buy=19;s=command(s,0,{type:'AUCTION'});s=command(s,1,{type:'BID',amount:100});assert.equal(s.botMemory.opponents[1].tradeAccepted,1);
});
test('rollout continuation accepts a free property rather than using the legacy fixed trade policy',()=>{
 let s=setup();own(s,39,0);s=command(s,0,{type:'OFFER',trade:{to:1,give:[39],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0}});
 assert.equal(rolloutPolicy(s,1,seeded(5)).type,'TRADE_ACCEPT');
});
test('feature extraction and decisions never depend on hidden deck order or private memory',()=>{
 const s=setup(),h=structuredClone(s);h.decks.chance.reverse();h.botMemory={players:{1:{secret:39}},opponents:{}};
 assert.deepEqual(valueFeatures(s,0),valueFeatures(h,0));assert.deepEqual(valueFeatures(s,0),valueFeatures(observation(s,0),0));
 const model=createLearningModel();assert.deepEqual(predictValues(s,model),predictValues(h,model));
});
test('winner-derived value fitting changes weights and learns from a synthetic labelled position',()=>{
 const model=createLearningModel(),features=[Array(model.value.length).fill(0),Array(model.value.length).fill(0)];features[0][0]=1;features[1][0]=-1;
 const losses=fitValue(model,Array.from({length:40},()=>({features,winner:0})),{epochs:8});assert(model.value[0]>0);assert(losses.at(-1)<losses[0]);
});
test('on-policy reinforcement increases rewarded action preference without a scripted action table',()=>{
 const m=createLearningModel(),a=Array(m.policy.length).fill(0),b=[...a];a[3]=1;b[3]=-1;const before=m.policy[3];
 const updates=reinforcePolicy(m,[{winner:0,decisions:[{actor:0,features:[a,b],probabilities:[.5,.5],index:0,baseline:.5}]}],{rate:.1});
 assert.equal(updates,1);assert(m.policy[3]>before);
});
test('learned policy weights can change a close decision while never inventing an action',()=>{
 const s=setup(),m=createLearningModel();m.policy.fill(0);m.policy[POLICY_FEATURES.indexOf('action_AUCTION')]=8;s.phase='buy';s.buy=1;
 const p={candidates:[{id:'x',action:{type:'BUY',actionId:'x'},score:100},{id:'y',action:{type:'AUCTION',actionId:'y'},score:0}]};
 const d=learnedPolicy(s,0,p,m);assert.equal(d.action.type,'AUCTION');m.policy[POLICY_FEATURES.indexOf('action_BUY')]=10;assert.equal(learnedPolicy(s,0,p,m).action.type,'BUY');
});
test('candidate models cannot silently activate in production; explicit research use is reported',()=>{
 const s=setup(),m=createLearningModel();s.phase='buy';s.buy=1;
 assert.equal(decideMind(s,0,{difficulty:'hardcore',learningModel:m,timeBudgetMs:0}).diagnostics.learning.enabled,false);
 assert.equal(decideMind(s,0,{difficulty:'hardcore',learningModel:m,allowCandidateModel:true,timeBudgetMs:0}).diagnostics.learning.enabled,true);
});
test('invalid learning artifacts fail closed without NaN or illegal actions',()=>{
 for(const edit of [m=>m.value[0]=NaN,m=>m.schema=9,m=>m.rulepack='other',m=>m.policy.pop()]){
  const m=createLearningModel();edit(m);assert(!validLearningModel(m));assert.equal(predictValues(setup(),m),null);assert(decideMind(setup(),0,{learningModel:m,allowCandidateModel:true}).action);
 }
});
test('multiplayer value probabilities sum to one and terminal labels honour the actual winner',()=>{
 const s=setup(6),m=createLearningModel();assert(Math.abs(Object.values(predictValues(s,m)).reduce((a,b)=>a+b,0)-1)<1e-9);
 s.phase='won';s.winner=3;assert.equal(predictValues(s,m)[3],1);assert.equal(predictValues(s,m)[0],0);
});
test('self-play capped matches have no invented winner, training labels or policy rewards',()=>{
 const r=runMatch({seed:12,n:2,maxActions:3,collect:true});assert(!r.finished);assert.equal(r.failure,'action_cap');assert.equal(r.winner,null);assert.deepEqual(r.samples,[]);assert.equal(r.episode,null);
});
test('sampling diagnostic data does not change the seeded policy or environment path',()=>{
 const options={seed:15,n:2,maxActions:35,model:createLearningModel(),policies:['learned'],explore:true};
 const a=runMatch({...options,collect:true}),b=runMatch({...options,collect:false});assert.equal(a.actions,b.actions);assert.deepEqual(a.failureState,b.failureState);
});
test('bankruptcy auctions of different properties are progress, not an infinite policy cycle',()=>{
 const s=setup();s.phase='buy';s.buy=1;const a=command(s,0,{type:'AUCTION'}),b=structuredClone(a);b.auction.tile=39;
 assert.notEqual(cycleFingerprint(a),cycleFingerprint(b));
 b.auction.tile=1;b.auction.id='fresh-event-id-only';b.version+=10;b.eventId+=10;assert.equal(cycleFingerprint(a),cycleFingerprint(b),'event churn cannot hide a real loop');
 b.queue=[{kind:'auction',tile:3}];assert.notEqual(cycleFingerprint(a),cycleFingerprint(b));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,command,BOARD,GROUPS,stock} from '../lib/game.mjs';
import {analyzeState} from '../lib/bot/analysis.mjs';
import {generateCandidates} from '../lib/bot/candidates.mjs';
import {decideMind,MODELS} from '../lib/bot/mind.mjs';
import {buildingCashReserve,constructionAffordable} from '../lib/bot/economy.mjs';
import {allocateDevelopment} from '../lib/bot/allocation.mjs';
import {decisionGate} from '../lib/bot/strategy.mjs';
const setup=()=>{
 const s=createGame({players:[{name:'Bot',controller:'bot'},{name:'Human',controller:'human'}],startingRoll:false},()=>.2);
 for(const tile of GROUPS[3].ids)s.assets[tile].owner=0;
 return s;
};
test('construction buffer uses display Nusa denomination and responds to risk within N50..N200',()=>{
 assert.equal(buildingCashReserve({reserve:0}),500);assert.equal(buildingCashReserve({reserve:1200}),1200);assert.equal(buildingCashReserve({reserve:99000}),2000);
});
test('candidate generation and advisor choices cannot spend the construction buffer',()=>{
 const s=setup();s.players[0].cash=1400;
 const a=analyzeState(s,0),actions=generateCandidates(s,0,a);
 assert(actions.every(c=>constructionAffordable(s,0,c,a.reserve)));
 assert(!actions.some(c=>c.type==='BUILD'),'risk-aware buffer prevents construction when cash is low');
 const plan={action:actions[0],candidates:actions.map(action=>({id:action.actionId,action,score:0}))};
 assert.equal(decisionGate(plan,'invented-build').accepted,false);
 // Human legality is unchanged by the bot policy.
 assert.doesNotThrow(()=>command(s,0,{type:'BUILD',tile:16}));
});
for(const model of MODELS)for(const persona of ['raka','bima','sari'])test(`${model.code}/${persona} preserves the construction buffer over repeated management`,()=>{
 let s=setup();s.players[0].botPersona=persona;s.players[0].cash=5700;
 let builds=0;
 for(let i=0;i<18;i++){
  const reserve=buildingCashReserve(analyzeState(s,0));
  const p=decideMind(s,0,{difficulty:model.id,timeBudgetMs:45,maxNodes:32});
  assert(p.action);assert(constructionAffordable(s,0,p.action,reserve));
  if(!['BUILD','BUILD_JOIN'].includes(p.action.type))break;
  s=command(s,0,p.action,()=>.3);
  if(!['buildOffer','auction'].includes(s.phase)){assert(s.players[0].cash>=reserve);builds++;}
  else break;
 }
 assert(s.players[0].cash>=500);assert(builds<=5);if(model.id!=='easy')assert(builds>0,'cash protection must still allow strategic development');
});
test('building bids and BUILD_JOIN reserve funds even though initial participation is free',()=>{
 const s=setup();s.players[0].cash=2400;
 s.phase='auction';s.auction={id:'reserve',kind:'building',building:'house',targets:{0:16,1:6},participants:[0,1],bidder:0,highest:null,amount:100,passed:[]};
 const a=analyzeState(s,0),c=generateCandidates(s,0,a);
 assert(c.filter(x=>x.type==='BID').every(x=>s.players[0].cash-x.amount>=buildingCashReserve(a)));
 assert(!constructionAffordable(s,0,{type:'BID',amount:2300},a.reserve));
 s.phase='buildOffer';s.buildOffer={kind:'house',pending:[0],targets:{}};s.auction=null;s.players[0].cash=1400;
 assert(!generateCandidates(s,0,analyzeState(s,0)).some(x=>x.type==='BUILD_JOIN'));
});
test('allocation prefixes preserve the same floor and exact physical stock',()=>{
 const s=setup();s.players[0].cash=6000;
 const p=allocateDevelopment(s,0,{reserve:2000,probability:()=>.1,horizon:50});
 assert(p.path.length>0);let next=s;
 for(const a of p.path){next=command(next,0,a,()=>.2);assert(next.players[0].cash>=2000);assert.deepEqual(next.bank,stock(next));}
 assert.equal(next.players[0].cash,p.state.players[0].cash);
});

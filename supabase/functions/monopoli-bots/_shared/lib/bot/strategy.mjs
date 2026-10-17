import {BOARD,GROUPS} from '../content.mjs';
import {command,rent,redemption,assets,chooseBot as baseline} from '../game.mjs';
import {analyzeState,portfolioValue,propertyValue,liquidityPenalty,auctionCompetition,clamp} from './analysis.mjs';
import {generateCandidates,ruleState,legalCandidate} from './candidates.mjs';
import {strategyView} from './memory.mjs';
import {evaluateTrade,tradeAcceptance} from './negotiation.mjs';
import {rescuePlan} from './liquidation.mjs';
import {developmentRoutes} from './development.mjs';
const economicTypes=new Set(['BUY','BID','BUILD','REDEEM','MORTGAGE_REDEEM','OFFER','COUNTER','TRADE_ACCEPT','SELL','SELL_SET','MORTGAGE']);
function buildingScore(s,id,tile,a){
 const t=BOARD[tile],asset=s.assets[tile],cost=t.build,remaining=s.players[id].cash-cost;
 const immediate=(t.rents[asset.level+1]-rent(s,tile,7))*a.probability(tile)*a.others.length*a.persona.horizon;
 const g=GROUPS[t.group];let roadmap=0,steps=0;
 for(const i of g.ids){const level=s.assets[i].level;if(level<3){roadmap+=(BOARD[i].rents[3]-rent(s,i,7))*a.probability(i)*a.others.length*a.persona.horizon-(3-level)*BOARD[i].build*.5;steps+=3-level;}}
 const houseRelease=asset.level===4&&a.stock.houses<5&&a.others.some(p=>GROUPS.some(group=>group.ids.every(i=>s.assets[i].owner===p.id)))?cost*.4:0;
 const opportunity=Math.max(immediate-cost*.5,steps?roadmap/steps:0)*a.persona.investment;
 return opportunity+immediate*.08-houseRelease-(liquidityPenalty(remaining,Math.max(360,a.reserve-immediate*.35))-liquidityPenalty(s.players[id].cash,Math.max(360,a.reserve-immediate*.35)));
}
function liquidationLoss(s,id,action,a){
 const next=command(ruleState(s),id,action,()=>.3),gain=next.players[id].cash-s.players[id].cash;
 const loss=Math.max(0,portfolioValue(s,id,a)-portfolioValue(next,id,a)-gain);
 return {next,gain,loss};
}
function debtPlan(s,id,candidates,a){
 if(a.options.ablateLiquidation)return null;
 return rescuePlan(s,id,a,{maxNodes:a.options.fast?32:160})?.path[0]||null;
}
function score(s,id,c,a,tradeContext){
 const p=s.players[id],costPenalty=cost=>liquidityPenalty(p.cash-cost,a.reserve)-liquidityPenalty(p.cash,a.reserve);
 if(c.type==='CLAIM_RENT'||c.type==='PAY')return 1e8;
 if(c.type==='BANKRUPT')return -1e8;
 if(c.type==='BUY')return propertyValue(s,id,s.buy,a)-BOARD[s.buy].price-costPenalty(BOARD[s.buy].price)*.75;
 if(c.type==='AUCTION')return 0;
 if(c.type==='BID'){
  const auction=s.auction,value=auction.kind==='building'?BOARD[auction.targets[id]].build+Math.max(0,buildingScore(s,id,auction.targets[id],a)):propertyValue(s,id,auction.tile,a);
  const surplus=value-c.amount-costPenalty(c.amount)*.8;
  // A low bid seldom ends a contested auction. Balance surplus against public resistance.
  // This weight is an estimate, not a claimed calibrated probability of winning.
  const resistance=Math.max(100,auctionCompetition(s,id,a));
  const settlementWeight=clamp(.08+.86*(c.amount/resistance)**1.6,.08,.94);
  return surplus<0?surplus:surplus*settlementWeight;
 }
 if(c.type==='PASS')return 0;
 if(c.type==='BUILD'||c.type==='BUILD_JOIN')return buildingScore(s,id,c.tile,a);
 if(c.type==='BUILD_DECLINE')return 0;
 if(c.type==='REDEEM'||c.type==='MORTGAGE_REDEEM'){
  const tile=c.tile??s.mortgageDecision.tile,next={...s,assets:{...s.assets,[tile]:{...s.assets[tile],mortgaged:false}}};
  const cost=redemption(tile);return portfolioValue(next,id,a)-portfolioValue(s,id,a)-cost-costPenalty(cost);
 }
 if(c.type==='MORTGAGE_KEEP')return -BOARD[s.mortgageDecision.tile].mortgage*.1;
 if(['SELL','SELL_SET','MORTGAGE'].includes(c.type)){
  const {gain,loss}=liquidationLoss(s,id,c,a);
  return s.phase==='debt'?2000-loss/Math.max(1,gain)*1000-Math.max(0,gain-(s.debt.amount-p.cash))*.05:-loss-300;
 }
 if(['OFFER','COUNTER','TRADE_ACCEPT'].includes(c.type)){
  const t=c.type==='TRADE_ACCEPT'?s.trade:c.trade,from=c.type==='TRADE_ACCEPT'?s.trade.from:id,v=evaluateTrade(s,id,t,from,tradeContext);
  if(v.net<0)return v.net-1000;
  if(c.type==='TRADE_ACCEPT')return v.freeBeneficial&&!v.insolventAfterFees?1e8:v.net+100;
  const partner=evaluateTrade(s,t.to,t,from,tradeContext);
  return v.net*tradeAcceptance(s,t.to,partner)*a.persona.negotiation-120+(s.phase==='debt'&&v.net>0?500:0);
 }
 if(c.type==='TRADE_REJECT')return 0;
 if(c.type==='JAIL_PAY'||c.type==='JAIL_CARD'){
  const opportunity=BOARD.filter(t=>t.price&&s.assets[t.id].owner===null).length*35;
  const benefit=opportunity-a.expectedRisk*1.3;
  return benefit-(c.type==='JAIL_PAY'?500+costPenalty(500):250);
 }
 return 0;
}
export function planDecision(input,id,options={}){
 if(input.schemaVersion===1){const action=baseline(input,id);return {action,candidates:action?[{action,score:0,id:'legacy'}]:[],shouldConsult:false,reason:'legacy',summary:{}};}
 const s=strategyView(input,id),a=analyzeState(s,id,options),candidates=generateCandidates(s,id,a);
 if(!candidates.length)return {action:null,candidates:[],shouldConsult:false,summary:{}};
 const planned=s.phase==='debt'?debtPlan(s,id,candidates,a):null;
 const tradeContext={observerId:id,analyses:new Map([[id,a]])};
 const ranked=candidates.map(action=>({id:action.actionId,action,score:score(s,id,action,a,tradeContext)}));
 if(planned){const selected=ranked.find(c=>c.action.type===planned.type&&c.action.tile===planned.tile);if(selected)selected.score=1e7;}
 const routes=options.fast||options.noPlanning?[]:developmentRoutes(s,id,a);
 for(const route of routes){const c=ranked.find(c=>c.action.type===route.first.type&&c.action.tile===route.first.tile);if(c&&route.score>=c.score){c.score=route.score;c.macro=route.path;}}
 ranked.sort((x,y)=>y.score-x.score||x.id.localeCompare(y.id));
 const top=ranked[0],runner=ranked[1],complex=['trade','auction','debt'].includes(s.phase)||top.action.type==='OFFER'||top.action.type==='BUILD';
 const near=runner&&top.score-runner.score<=Math.max(150,Math.abs(top.score)*.15);
 const safe=ranked.filter(c=>c.score>=0&&economicTypes.has(c.action.type));
 return {action:top.action,candidates:ranked,shouldConsult:!!(complex&&near&&safe.length>1),summary:{persona:a.persona.id,phase:a.phase,reserve:a.reserve,risk:{cvar:a.risk.cvar,alpha:a.risk.alpha,mortgageBuffer:a.risk.buffer,ruinProbability:a.risk.ruinProbability,horizonRolls:a.risk.horizonRolls,model:a.risk.model},expectedRentRisk:Math.round(a.expectedRisk),targetGroup:a.targetGroup,liquidationPlanned:!!planned,investmentRoutes:routes.slice(0,2).map(({first,funding,groupIndex,buildCost,expectedRentGain})=>({first,funding,groupIndex,buildCost,expectedRentGain}))},reason:complex?'strategic':'mechanical'};
}
export function chooseSmartBot(s,id,options={}){return planDecision(s,id,options).action;}
export function decisionGate(plan,actionId){
 const best=plan.candidates.find(c=>c.id===plan.action?.actionId)||plan.candidates[0],candidate=plan.candidates.find(c=>c.id===actionId);
 if(!best||!candidate)return {action:plan.action,accepted:false,reason:'illegal_action'};
 // Scores are internal Nusa utility estimates. Advisor may choose a close alternative only.
 const tolerance=Math.min(200,Math.max(40,Math.abs(best.score)*.08));
 if(candidate.score<best.score-tolerance||candidate.score<0&&best.score>=0)return {action:plan.action,accepted:false,reason:'economic_guard'};
 return {action:candidate.action,accepted:true};
}

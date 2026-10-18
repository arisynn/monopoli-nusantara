/** NUSA V23 public temporal telemetry.
 * An "orbit" is a normalization of 40/7 future dice rolls, not a table round
 * or a promise that a pawn passes GO. Cards, jail and doubles are forecast by
 * probability.mjs; the live shuffled deck and private bot memory are not read.
 * ETTR extrapolates the current public board and is a heuristic, not a verdict
 * of inevitable bankruptcy. Liquidating buildings also changes future drift.
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {buildTargets,canManage,canTrade,interest,managementError,redemption,stock} from '../../game.mjs';
import {economyRules} from '../economy.mjs';
import {landingForecast,expectedRentAt} from '../probability.mjs';

export const NORMALIZED_ORBIT_ROLLS=40/7;
export const TEMPORAL_POSTURES=Object.freeze({
  ATTRITION_LOCKDOWN:'ATTRITION_LOCKDOWN',TEMPO_BREAKER:'TEMPO_BREAKER',
  APEX_EXECUTIONER:'APEX_EXECUTIONER',NEUTRAL:'NEUTRAL'
});
const freeze=Object.freeze;
const finite=n=>Number.isFinite(n)?n:0;
const own=(view,id,tile)=>view.assets[tile]?.owner===id;
const groupTradable=(view,tile)=>BOARD[tile]?.group<0||GROUPS[BOARD[tile]?.group]?.ids.every(i=>!(view.assets[i]?.level>0));
const alivePlayers=view=>view.players.filter(p=>!p.out);

/** Directional seat distance, skipping eliminated seats. It grants no exclusive
 * construction rights: the engine accepts management outside one's own turn. */
export function turnDistance(view,from,to){
  const order=alivePlayers(view).map(p=>p.id),a=order.indexOf(from),b=order.indexOf(to);
  return a<0||b<0?Infinity:(b-a+order.length)%order.length;
}
export function nextTurnPlayer(view,from=view.turn){
  const players=alivePlayers(view),index=players.findIndex(p=>p.id===from);
  if(players.length<2)return null;
  if(index>=0)return players[(index+1)%players.length];
  // A bankrupt active seat may still be present while its estate is resolved.
  for(let d=1;d<=view.players.length;d++){
    const candidate=view.players[(from+d)%view.players.length];
    if(candidate&&!candidate.out)return candidate;
  }
  return null;
}

/** Current public commitments, separate from recurring expected cashflow.
 * Resume contexts contain interrupted obligations, so inspect them as well.
 * Mortgage interest and manual rent remain conditional until resolved/claimed.
 */
function publicObligations(view){
  const result=new Map(alivePlayers(view).map(p=>[p.id,{confirmed:[],conditional:[]}]));
  const seen=new WeakSet(),pending=[view];let inspected=0;
  const add=(from,to,amount,source,conditional=false,tile=null)=>{
    if(!result.has(from)||!(amount>0))return;
    result.get(from)[conditional?'conditional':'confirmed'].push(freeze({from,to,amount,source,tile}));
  };
  const inspectPayment=(payment,source)=>{
    if(!payment||typeof payment!=='object'||seen.has(payment))return;
    seen.add(payment);add(payment.from,payment.to,finite(payment.amount),source,false,payment.tile??null);
  };
  while(pending.length&&inspected++<96){
    const ctx=pending.pop();if(!ctx||typeof ctx!=='object'||seen.has(ctx))continue;seen.add(ctx);
    inspectPayment(ctx.debt,'active_debt');
    if(ctx.trade?.context)pending.push(ctx.trade.context);
    for(const q of ctx.queue||[]){
      if(q?.kind==='resume')pending.push(q.context);
      else if(q?.kind==='pay')inspectPayment(q,'queued_payment');
      else if(q?.kind==='mortgage'&&!seen.has(q)){
        seen.add(q);
        if(own(view,q.player,q.tile)&&view.assets[q.tile]?.mortgaged)add(q.player,null,interest(q.tile),'pending_mortgage_interest',true,q.tile);
      }
    }
    const decision=ctx.mortgageDecision;
    if(decision&&!seen.has(decision)){
      seen.add(decision);
      if(own(view,decision.player,decision.tile)&&view.assets[decision.tile]?.mortgaged)add(decision.player,null,interest(decision.tile),'mortgage_choice_interest',true,decision.tile);
    }
    const c=ctx.card;
    if(c&&!seen.has(c)){
      seen.add(c);
      if(c.money<0)add(c.player,null,-c.money,'revealed_card');
      if(c.repair){
        const cost=BOARD.reduce((sum,t)=>sum+(own(view,c.player,t.id)?(view.assets[t.id].level===5?c.repair[1]:view.assets[t.id].level*c.repair[0]):0),0);
        add(c.player,null,cost,'revealed_repair');
      }
      if(c.each)for(const p of alivePlayers(view))if(p.id!==c.player)add(c.each<0?c.player:p.id,c.each<0?p.id:c.player,Math.abs(c.each),'revealed_player_payment');
    }
  }
  for(const c of view.rentClaims||[])add(c.from,c.to,finite(c.amount),'uncollected_manual_rent',true,c.tile??null);
  return result;
}

function capitalOf(view,id,obligations){
  const p=view.players[id];let mortgagePotential=0,buildingLiquidation=0,immediateMortgage=0;
  for(const t of BOARD){
    if(!t.price||!own(view,id,t.id))continue;
    const a=view.assets[t.id];
    if(!a.mortgaged)mortgagePotential+=t.mortgage||0;
    buildingLiquidation+=(t.build||0)*(a.level||0)/2;
    if(!managementError(view,id,t.id,'MORTGAGE'))immediateMortgage+=t.mortgage||0;
  }
  const committedCash=view.auction?.highest===id?finite(view.auction.amount):0;
  const confirmedObligations=obligations.confirmed.reduce((n,o)=>n+o.amount,0);
  const conditionalObligations=obligations.conditional.reduce((n,o)=>n+o.amount,0);
  const liquidationCapacity=finite(p.cash)+mortgagePotential+buildingLiquidation;
  return {cash:finite(p.cash),committedCash,confirmedObligations,conditionalObligations,
    confirmedObligationDetails:freeze(obligations.confirmed),conditionalObligationDetails:freeze(obligations.conditional),
    spendableCash:Math.max(0,p.cash-committedCash-confirmedObligations),
    mortgagePotential,immediateMortgagePotential:immediateMortgage,buildingLiquidation,liquidationCapacity,
    liquidationRunway:Math.max(0,liquidationCapacity-committedCash-confirmedObligations),
    conservativeLiquidationRunway:Math.max(0,liquidationCapacity-committedCash-confirmedObligations-conditionalObligations),
    immediateInsolvent:liquidationCapacity<confirmedObligations+committedCash};
}

function deadWeightOf(view,actor,graph){
  const players=alivePlayers(view),owner=tid=>view.assets[tid]?.owner;
  const keyHolders=new Set(GROUPS.flatMap(g=>{
    const held=g.ids.filter(t=>owner(t)===actor);
    if(held.length!==g.ids.length-1)return [];
    const holder=owner(g.ids.find(t=>owner(t)!==actor));return holder!=null&&holder!==actor?[holder]:[];
  }));
  return BOARD.filter(t=>{
    const a=view.assets[t.id];if(!t.price||a?.owner!==actor||a.level>0||!groupTradable(view,t.id))return false;
    if(graph?.brokerTargetTiles?.has(t.id))return false;
    if([...keyHolders].some(id=>(graph?.desireMatrix?.get(id)?.[t.id]||0)>=65))return false;
    if(t.group>=0){
      const ids=GROUPS[t.group].ids,count=ids.filter(i=>owner(i)===actor).length;
      if(count>=ids.length-1)return false;
      if(players.some(p=>p.id!==actor&&ids.filter(i=>owner(i)===p.id).length>=ids.length-1))return false;
    }else if(BOARD.filter(b=>b.type===t.type&&owner(b.id)===actor).length>=2)return false;
    return true;
  }).map(t=>freeze({...t,tileId:t.id,canMortgage:!view.assets[t.id].mortgaged,
    minSalePrice:t.price,maxSalePrice:Math.floor(t.price*1.35/10)*10}));
}

function readyChains(view,actor,graph,tradeCount,stopped){
  if(view.phase!=='end'||view.turn!==actor||tradeCount>=3||!canTrade(view,actor))return [];
  const result=[];
  for(let groupId=0;groupId<GROUPS.length&&!stopped();groupId++){
    const g=GROUPS[groupId];if(g.ids.filter(i=>own(view,actor,i)).length!==g.ids.length-1)continue;
    const missingTile=g.ids.find(i=>!own(view,actor,i)),keyHolderId=view.assets[missingTile]?.owner;
    if(keyHolderId==null||keyHolderId===actor||view.players[keyHolderId]?.out||!groupTradable(view,missingTile))continue;
    const desires=graph?.desireMatrix?.get(keyHolderId)||[];
    for(const t of BOARD){
      if(!t.price||!own(view,actor,t.id)||t.group===groupId||!groupTradable(view,t.id)||(desires[t.id]||0)<65)continue;
      const baitGroup=t.group>=0?GROUPS[t.group]:null;
      const ownCount=baitGroup?.ids.filter(i=>own(view,actor,i)).length||0;
      if(baitGroup&&(ownCount===baitGroup.ids.length||baitGroup.ids.filter(i=>own(view,keyHolderId,i)).length>=baitGroup.ids.length-1))continue;
      result.push(freeze({groupId,targetGroupId:groupId,missingTile,ultimateTargetTile:missingTile,
        keyHolderId,partnerId:keyHolderId,baitTile:t.id,desireScore:desires[t.id],
        priority:(graph?.groupTopologies?.[groupId]?.tier||1)*desires[t.id]/65,
        candidatePriority:495,breaksOwnNearMonopoly:!!baitGroup&&ownCount===baitGroup.ids.length-1,
        acquisitionInterest:view.assets[missingTile]?.mortgaged?interest(missingTile):0,
        partnerInterest:view.assets[t.id]?.mortgaged?interest(t.id):0,
        turnDistance:turnDistance(view,actor,keyHolderId),requiresAcceptance:true,
        exclusiveBuildWindow:false}));
    }
  }
  return result.sort((a,b)=>b.priority-a.priority||a.baitTile-b.baitTile).slice(0,12);
}

function preEndOf(view,actor,next,forecast,deadWeight,capital,stopped){
  if(view.phase!=='end'||view.turn!==actor||!next||!forecast)return [];
  const bank=stock(view),eligible=alivePlayers(view).filter(p=>p.cash>=100&&buildTargets(view,p.id,'house').length).length;
  const safeMortgage=deadWeight.filter(t=>t.canMortgage&&!managementError(view,actor,t.id,'MORTGAGE'));
  const mortgageBuffer=safeMortgage.reduce((n,t)=>n+(t.mortgage||0),0),result=[];
  for(let groupId=0;groupId<GROUPS.length&&!stopped();groupId++){
    const g=GROUPS[groupId];if(!g.ids.every(i=>own(view,actor,i)))continue;
    const redeemTiles=g.ids.filter(i=>view.assets[i]?.mortgaged);
    const redeemCost=redeemTiles.reduce((n,i)=>n+redemption(i),0);
    const buildTiles=g.ids.filter(i=>!managementError(view,actor,i,'BUILD'));
    for(const tileId of g.ids){
      const a=view.assets[tileId],hitProbability=forecast.visits[tileId]||0;
      if(hitProbability<=0||!a.mortgaged&&a.level>=3)continue;
      const levels=Object.fromEntries(g.ids.map(i=>[i,view.assets[i].level||0])),buildPath=[];
      while(levels[tileId]<3&&buildPath.length<g.ids.length*3){
        const minimum=Math.min(...g.ids.map(i=>levels[i]));
        const choices=g.ids.filter(i=>levels[i]===minimum).sort((i,j)=>{
          if(i===tileId)return -1;if(j===tileId)return 1;
          return (forecast.visits[j]||0)*(BOARD[j].rents[levels[j]+1]-BOARD[j].rents[levels[j]])-(forecast.visits[i]||0)*(BOARD[i].rents[levels[i]+1]-BOARD[i].rents[levels[i]])||i-j;
        });
        const chosen=choices[0];if(chosen===undefined)break;levels[chosen]++;buildPath.push(chosen);
      }
      const buildCost=buildPath.reduce((n,i)=>n+BOARD[i].build,0),requiredCapital=redeemCost+buildCost;
      const legalRedeems=redeemTiles.filter(i=>canManage(view,actor)&&view.phase!=='debt'&&!managementError(view,actor,i,'REDEEM')&&capital.spendableCash>=redemption(i));
      const canBuildNow=canManage(view,actor)&&!['debt','auction'].includes(view.phase)&&buildTiles.length>0;
      result.push(freeze({tileId,groupId,nextPlayerId:next.id,hitProbability,
        forwardDistance:(tileId-next.pos+40)%40,inApexWindow:(tileId-next.pos+40)%40>=5&&(tileId-next.pos+40)%40<=9,
        redeemTiles:freeze([...redeemTiles]),buildTiles:freeze(buildTiles),buildPath:freeze(buildPath),
        redeemCost,buildCost,requiredCapital,mortgageBuffer,
        affordableNow:capital.spendableCash>=requiredCapital,
        affordableWithMortgage:capital.spendableCash+mortgageBuffer>=requiredCapital,
        canRedeemNow:legalRedeems.length>0,canBuildNow,
        redeemActions:freeze(legalRedeems.map(tile=>freeze({type:'REDEEM',tile}))),
        buildActions:freeze(canBuildNow?buildTiles.map(tile=>freeze({type:'BUILD',tile})):[]),
        fundingActions:freeze(safeMortgage.map(t=>freeze({type:'MORTGAGE',tile:t.id}))),
        housesRequired:buildPath.length,houseStock:bank.houses,
        sufficientHouseStock:bank.houses>=buildPath.length,
        constructionMayInterrupt:eligible>=2&&bank.houses-buildPath.length<eligible,
        rivalCanManageBeforeRoll:canManage(view,next.id),exclusiveBuildWindow:false}));
    }
  }
  return result.sort((a,b)=>b.hitProbability-a.hitProbability||b.inApexWindow-a.inApexWindow).slice(0,12);
}

/** Pure, bounded public-board analysis. Optional shouldStop is checked between
 * players/groups; no search, engine command, private state or persistent writes.
 * Returned Maps are read-only by convention, like board-graph.mjs telemetry. */
export function analyzeTemporal(view,actor,boardGraph={},options={}){
  const players=alivePlayers(view),horizonRolls=2,rules=economyRules(view);
  const stopped=()=>typeof options.shouldStop==='function'&&options.shouldStop();
  const forecasts=new Map(),immediate=new Map(),obligations=publicObligations(view);
  const cashflowByPlayer=new Map(),distances=new Map(),initiative=new Map();
  let complete=true;
  for(const p of players){
    if(stopped()){complete=false;break;}
    forecasts.set(p.id,landingForecast(view,p.id,horizonRolls));
    immediate.set(p.id,landingForecast(view,p.id,1));
  }
  // Partial cashflow would silently underestimate income, so omit all drift rows
  // when the cooperative deadline interrupted forecast collection.
  if(forecasts.size===players.length)for(const p of players){
    const f=forecasts.get(p.id),flow=f.cashflow;let income=0,rentOut=0;
    for(const t of BOARD){
      if(!t.price)continue;const owner=view.assets[t.id]?.owner;if(owner==null||view.assets[t.id]?.mortgaged)continue;
      if(owner===p.id){for(const other of players)if(other.id!==p.id)income+=expectedRentAt(view,t.id,forecasts.get(other.id));}
      else rentOut+=expectedRentAt(view,t.id,f);
    }
    const fallbackTax=BOARD.reduce((n,t)=>n+(t.type==='tax'?(f.visits[t.id]||0)*t.tax:0),0);
    const nonRent=flow?flow.nonRentNet:rules.salary*horizonRolls/NORMALIZED_ORBIT_ROLLS-fallbackTax-f.jailFine;
    const perRollDrift=(income-rentOut+nonRent)/horizonRolls,drift=perRollDrift*NORMALIZED_ORBIT_ROLLS;
    const capital=capitalOf(view,p.id,obligations.get(p.id));
    const ETTR=drift<0?capital.conservativeLiquidationRunway/-drift:Infinity;
    cashflowByPlayer.set(p.id,freeze({id:p.id,...capital,drift,perOrbitDrift:drift,perRollDrift,ETTR,ettr:ETTR,
      incomePerRoll:income/horizonRolls,rentOutPerRoll:rentOut/horizonRolls,nonRentPerRoll:nonRent/horizonRolls,
      salaryPerRoll:flow?flow.salary/horizonRolls:rules.salary/NORMALIZED_ORBIT_ROLLS,
      taxPerRoll:flow?flow.tax/horizonRolls:fallbackTax/horizonRolls,
      cardNetPerRoll:flow?flow.cardNet/horizonRolls:0,
      conditionalCardReceivablePerRoll:flow?flow.cardReceivable/horizonRolls:0,
      jailFinePerRoll:f.jailFine/horizonRolls,forecastComplete:!!flow,
      rentCollection:view.rules?.rent==='manual'?'conditional_on_public_claim':'automatic',
      estimateOnly:true}));
  }
  const next=nextTurnPlayer(view,view.turn),actorNext=nextTurnPlayer(view,actor);
  for(const p of players){
    const distance=turnDistance(view,actor,p.id);distances.set(p.id,distance);
    const before=players.filter(q=>q.id!==actor&&turnDistance(view,actor,q.id)<distance).map(q=>q.id);
    initiative.set(p.id,freeze({id:p.id,turnDistance:distance,interveningPlayers:freeze(before),
      actsNextAfterActor:actorNext?.id===p.id,canManageNow:canManage(view,p.id),
      canBuildBeforeOwnRoll:true,exclusiveBuildWindow:false,
      interdictionUrgency:distance===1?1.45:distance===2?1.2:1}));
  }
  const self=cashflowByPlayer.get(actor),rivals=[...cashflowByPlayer.values()].filter(p=>p.id!==actor);
  const highest=rivals.slice().sort((a,b)=>b.drift-a.drift)[0]||null;
  const executionTargets=rivals.filter(p=>p.drift<0&&p.ETTR<=2).sort((a,b)=>a.ETTR-b.ETTR);
  let macroPosture=TEMPORAL_POSTURES.NEUTRAL;
  if(self){
    if(executionTargets.length)macroPosture=TEMPORAL_POSTURES.APEX_EXECUTIONER;
    else if(self.drift>0&&(!highest||self.drift>=highest.drift))macroPosture=TEMPORAL_POSTURES.ATTRITION_LOCKDOWN;
    else if(highest&&highest.drift>self.drift)macroPosture=TEMPORAL_POSTURES.TEMPO_BREAKER;
  }
  const tradeCount=Number.isFinite(options.roundTradeCount)?options.roundTradeCount:(view.log||[]).filter(e=>e.type==='trade'&&e.turn===view.round&&e.actor===actor).length;
  const deadWeightAssets=deadWeightOf(view,actor,boardGraph);
  const pendingBroker=options.brokerState;
  const readyStep2BrokerChains=readyChains(view,actor,boardGraph,tradeCount,stopped).map(chain=>{
    const matchesPending=!!pendingBroker&&['ready_step2','awaiting_step1'].includes(pendingBroker.stage)&&
      pendingBroker.baitTile===chain.baitTile&&pendingBroker.ultimateTargetTile===chain.ultimateTargetTile&&
      pendingBroker.keyHolderId===chain.keyHolderId&&pendingBroker.targetGroupId===chain.targetGroupId&&
      pendingBroker.turnSerial===view.turnSerial&&pendingBroker.matchId===view.matchId;
    return freeze({...chain,matchesPending});
  }).sort((a,b)=>Number(b.matchesPending)-Number(a.matchesPending)||b.priority-a.priority);
  const ownCapital=self||capitalOf(view,actor,obligations.get(actor)||{confirmed:[],conditional:[]});
  const preEndTargets=preEndOf(view,actor,next,immediate.get(next?.id),deadWeightAssets,ownCapital,stopped);
  return freeze({cashflowByPlayer,macroPosture,turnDistance:distances,initiative,nextTurnPlayer:next,
    nextPlayerId:next?.id??null,actorNextTurnPlayer:actorNext,
    executionTargets:freeze(executionTargets),driftLeaderId:highest&&(!self||highest.drift>self.drift)?highest.id:actor,
    readyStep2BrokerChains:freeze(readyStep2BrokerChains),deadWeightAssets:freeze(deadWeightAssets),
    preEndTargets:freeze(preEndTargets),roundTradeCount:tradeCount,complete:complete&&!stopped(),
    normalization:freeze({horizonRolls,rollsPerOrbit:NORMALIZED_ORBIT_ROLLS,
      model:'public-independent-roll-marginals',ettrIsHeuristic:true,
      orbitalDriftIsNotTableRound:true,cardReceivablesAreConditional:true,
      outsideTurnManagementAllowed:true,opponentCanBuildBeforeRoll:true})});
}

import {BOARD,GROUPS} from '../content.mjs';
import {assets,interest,canTrade,rent} from '../game.mjs';
import {analyzeState,portfolioValue,liquidityPenalty,clamp} from './analysis.mjs';
import {memoryFor} from './memory.mjs';
import {landingForecast} from './probability.mjs';
import {postTradeDevelopment} from './allocation.mjs';
import {economyRules,strengthShares} from './economy.mjs';
import {concessionOrder,rejectionActive} from './concessions.mjs';
const empty=to=>({to,give:[],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0});
export function canonicalTradeDelta(s,t,from=t.from){
  const to=t.to;if(from===to||!s.players[from]||!s.players[to]||s.players[from].out||s.players[to].out)throw Error('Invalid trade participants');
  for(const key of ['giveCash','takeCash','giveCards','takeCards'])if(!Number.isSafeInteger(t[key])||t[key]<0)throw Error('Invalid trade quantity');
  if(!Array.isArray(t.give)||!Array.isArray(t.take)||new Set([...t.give,...t.take]).size!==t.give.length+t.take.length)throw Error('Invalid trade assets');
  for(const [tiles,owner] of [[t.give,from],[t.take,to]])for(const tile of tiles)if(s.assets[tile]?.owner!==owner||(BOARD[tile].group>=0&&GROUPS[BOARD[tile].group].ids.some(i=>s.assets[i].level)))throw Error('Trade asset unavailable');
  if(s.players[from].cash<t.giveCash||s.players[to].cash<t.takeCash||s.players[from].cards.length<t.giveCards||s.players[to].cards.length<t.takeCards)throw Error('Trade funds unavailable');
  const fee=tiles=>tiles.reduce((n,i)=>n+(s.assets[i].mortgaged?interest(i):0),0);
  return {proposerId:from,responderId:to,deltas:{
    [from]:{cash:t.takeCash-t.giveCash-fee(t.take),fee:fee(t.take),given:t.give,received:t.take,cards:t.takeCards-t.giveCards},
    [to]:{cash:t.giveCash-t.takeCash-fee(t.give),fee:fee(t.give),given:t.take,received:t.give,cards:t.giveCards-t.takeCards}}};
}
function tradeAfterstate(s,t,from,context){
  const key=JSON.stringify([from,t]);context.projections||=new Map();if(context.projections.has(key))return context.projections.get(key);
  const canonical=canonicalTradeDelta(s,t,from),next={...s,assets:structuredClone(s.assets),players:s.players.map(p=>({...p,cards:[...p.cards]}))};
  for(const id of [from,t.to]){next.players[id].cash+=canonical.deltas[id].cash;for(const tile of canonical.deltas[id].received)next.assets[tile].owner=id;}
  const given=next.players[from].cards.splice(0,t.giveCards),taken=next.players[t.to].cards.splice(0,t.takeCards);
  next.players[from].cards.push(...taken);next.players[t.to].cards.push(...given);
  const before=strengthShares(s,BOARD,GROUPS,rent),reserves=Object.fromEntries([from,t.to].map(id=>[id,Math.min(economyRules(s).salary,(context.analyses?.get(id)?.reserve||0)*.65)]));
  const projected=postTradeDevelopment(next,[from,t.to],{reserves,horizon:24,maxSteps:30}),after={};
  for(const p of s.players)after[p.id]=projected.reduce((n,o)=>n+strengthShares(o.state,BOARD,GROUPS,rent)[p.id],0)/projected.length;
  const result={canonical,next,before,after,projected};context.projections.set(key,result);return result;
}
export function evaluateTrade(s,id,t,from=t.from,context={}){
  if(from===undefined)from=id;
  const to=t.to,other=id===from?to:from;if(id!==from&&id!==to)return {net:-Infinity,raw:-Infinity,opponentGain:Infinity};
  context.analyses||=new Map();
  const a=context.analyses.get(id)||analyzeState(s,id,{fast:true,publicOpponent:context.observerId!==undefined&&context.observerId!==id}),b=context.analyses.get(other)||analyzeState(s,other,{fast:true,publicOpponent:true});
  context.analyses.set(id,a);context.analyses.set(other,b);
  let projection;try{projection=tradeAfterstate(s,t,from,context);}catch{return {net:-1e8,raw:-1e8,opponentGain:1e8,invalid:true};}
  const {canonical,next,before,after,projected}=projection;
  const cash=next.players[id].cash-s.players[id].cash,otherCash=next.players[other].cash-s.players[other].cash;
  const unit=economyRules(s).salary,cards=canonical.deltas[id].cards*unit*.125;
  const raw=cash+cards+portfolioValue(next,id,a)-portfolioValue(s,id,a);
  const opponentGain=otherCash-cards+portfolioValue(next,other,b)-portfolioValue(s,other,b);
  let monopolyThreat=0;const ownArrivals=landingForecast(s,id,3).visits;
  for(const g of GROUPS){const before=g.ids.every(i=>s.assets[i].owner===other),after=g.ids.every(i=>next.assets[i].owner===other);
    if(after&&!before){const cost=g.ids.length*3*BOARD[g.ids[0]].build;
      const danger=g.ids.reduce((n,i)=>n+BOARD[i].rents[3]*(.65*.025+.35*ownArrivals[i]/3),0)*a.persona.horizon;
      monopolyThreat+=Math.max(0,danger-cost*.3)*clamp(next.players[other].cash/Math.max(1,cost),.15,1)*a.persona.blocking*.65;
    }}
  const liquidity=liquidityPenalty(next.players[id].cash,a.reserve)-liquidityPenalty(s.players[id].cash,a.reserve);
  const liquidation=next.players[id].cash+assets(next,id).reduce((n,t)=>n+(next.assets[t.id].mortgaged?0:t.mortgage)+(t.build||0)*next.assets[t.id].level/2,0);
  const auctionReserved=s.auction?.highest===id?s.auction.amount:0;
  const insolventAfterFees=liquidation<auctionReserved||(!!s.auction&&next.players[id].cash<auctionReserved);
  const d=canonical.deltas[id],unilateralLoss=!d.received.length&&d.cards<=0&&d.cash<=0&&(d.given.length||d.cash<0||d.cards<0);
  const freeBeneficial=!d.given.length&&d.cards>=0&&(id===from?t.giveCash===0:t.takeCash===0)&&d.cash>=0&&(d.received.length||d.cash>0||d.cards>0);
  const active=s.players.filter(p=>!p.out),leader=active.slice().sort((x,y)=>before[y.id]-before[x.id])[0].id;
  const catchUp=active.length>=3&&leader!==id&&leader!==other&&before[leader]>1.4/active.length;
  const deltaShare=after[id]-before[id],partnerDelta=after[other]-before[other];
  const weight=catchUp ? .1 : leader===other&&before[leader]>1.35/active.length ? .65 : .25;
  const strategic=(deltaShare-weight*Math.max(0,partnerDelta-deltaShare))*unit*8;
  const waitingPenalty=raw>0&&!freeBeneficial?unit*.025*BOARD.filter(q=>q.price&&s.assets[q.id].owner===null).length/28:0;
  const net=insolventAfterFees||unilateralLoss?raw-monopolyThreat-liquidity-1e7:freeBeneficial?Math.max(unit*.01,raw):raw-monopolyThreat*.65-liquidity+strategic-waitingPenalty;
  return {raw,net,opponentGain,monopolyThreat,liquidity,insolventAfterFees,unilateralLoss,freeBeneficial,deltaShare,partnerDelta,catchUp,
    shareModel:'uncalibrated-public-strength',postDevelopment:projected.map(o=>({order:o.order,plans:o.plans})),canonical};
}
export function tradeAcceptance(s,recipient,value){
  if(value.invalid||value.insolventAfterFees||value.unilateralLoss)return 0;
  const prior=s.botMemory?.opponents?.[recipient],accepted=prior?.tradeAccepted||0,rejected=prior?.tradeRejected||0;
  const willingness=(accepted+2)/(accepted+rejected+4),margin=value.net/Math.max(250,Math.abs(value.raw)*.35);
  return clamp((1/(1+Math.exp(-clamp(margin,-12,12))))*(.75+willingness*.4),.01,.97);
}
export function negotiationCandidates(s,id,analysis){
  if(!(s.phase==='trade'&&s.trade.to===id)&&!['end','debt'].includes(s.phase))return [];
  const out=[],unique=new Set(),context={analyses:new Map([[id,analysis],...analysis.others.map(p=>[p.id,analyzeState(s,p.id,{fast:true,publicOpponent:true})])])};
  const add=(type,trade)=>{const key=JSON.stringify(trade);if(!unique.has(key)){unique.add(key);out.push({type,trade});}};
  if(s.phase==='trade'&&s.trade.to===id){
    const current=s.trade,value=evaluateTrade(s,id,current,current.from,context);
    if(value.net>=0||(s.botMemory?.negotiation?.depth||0)>=2)return out;
    if(!current.give.length&&!current.giveCash&&!current.giveCards)return out;
    const counter={to:current.from,give:[...current.take],take:[...current.give],giveCash:0,takeCash:0,giveCards:current.takeCards,takeCards:current.giveCards};
    const raw=evaluateTrade(s,id,counter,id).net;
    if(raw>0)counter.giveCash=Math.floor(Math.min(raw*.7,Math.max(0,s.players[id].cash-analysis.reserve*.4),current.takeCash));
    else counter.takeCash=Math.ceil(-raw+Math.min(200,Math.abs(raw)*.08));
    if(counter.takeCash<=s.players[counter.to].cash&&evaluateTrade(s,id,counter,id,context).net>=0)add('COUNTER',counter);
    for(const fraction of [.35,.6,.85]){
      const adjusted={...counter,give:[...counter.give],take:[...counter.take]};
      if(adjusted.takeCash)adjusted.takeCash=Math.ceil(adjusted.takeCash*(1+fraction*.25));
      else adjusted.giveCash=Math.floor(adjusted.giveCash*fraction);
      if(adjusted.takeCash<=s.players[adjusted.to].cash&&evaluateTrade(s,id,adjusted,id,context).net>=0)add('COUNTER',adjusted);
    }
    return out;
  }
  const memory=memoryFor(s,id);
  if(!['end','debt'].includes(s.phase)||!canTrade(s,id)||s.players[id].lastOfferRound===s.round||s.turnSerial-memory.lastOfferSerial<s.players.length)return out;
  const available=assets(s,id).filter(t=>!s.assets[t.id].level&&(t.group<0||GROUPS[t.group].ids.every(i=>!s.assets[i].level)));
  if(s.phase==='debt'&&s.debt.from===id){
    for(const p of analysis.others){if(rejectionActive(s,memory,p.id))continue;
      for(const t of available.slice().sort((a,b)=>a.price-b.price).slice(0,4)){
        const trade={...empty(p.id),give:[t.id],takeCash:Math.min(p.cash,Math.ceil(Math.max(t.price*.85,s.debt.amount-s.players[id].cash)))};
        if(trade.takeCash>t.mortgage&&trade.takeCash<=t.price*1.4)add('OFFER',trade);
      }}
    return out.slice(0,6);
  }
  const targets=BOARD.filter(t=>t.price&&s.assets[t.id].owner!==null&&s.assets[t.id].owner!==id&&s.assets[t.id].level===0&&(t.group<0||GROUPS[t.group].ids.every(i=>!s.assets[i].level)))
    .filter(t=>t.group>=0&&analysis.groups[t.group].owned>0)
    .sort((a,b)=>(b.group===analysis.targetGroup)-(a.group===analysis.targetGroup)||analysis.groups[b.group].owned-analysis.groups[a.group].owned).slice(0,6);
  for(const t of targets){const other=s.assets[t.id].owner;if(rejectionActive(s,memory,other))continue;
    const cash=Math.ceil(t.price*1.1),trade={...empty(other),take:[t.id],giveCash:cash};
    if(cash<=s.players[id].cash)add('OFFER',trade);
    const donors=available.filter(d=>d.group!==t.group&&!(d.group>=0&&analysis.groups[d.group].owned===GROUPS[d.group].ids.length))
      .sort((a,b)=>{const count=d=>d.group<0?0:GROUPS[d.group].ids.filter(i=>s.assets[i].owner===other).length;return count(b)-count(a)||a.price-b.price}).slice(0,3);
    for(const d of donors){
      const swap={...empty(other),give:[d.id],take:[t.id]};
      const otherGain=evaluateTrade(s,other,swap,id,context).net;
      if(otherGain<0)swap.giveCash=Math.ceil(-otherGain+Math.min(100,-otherGain*.05));
      if(swap.giveCash<=s.players[id].cash)add('OFFER',swap);
    }
    const bundles=[[],...donors.map(d=>[d.id])];
    for(let i=0;i<donors.length;i++)for(let j=i+1;j<donors.length;j++)bundles.push([donors[i].id,donors[j].id]);
    const takeTargets=[[t.id]];
    const sameOwner=BOARD.filter(q=>q.id!==t.id&&q.group===t.group&&s.assets[q.id].owner===other&&!s.assets[q.id].level);
    if(sameOwner.length)takeTargets.push([t.id,sameOwner[0].id]);
    for(const give of bundles)for(const take of takeTargets){
      const base={...empty(other),give,take},own=evaluateTrade(s,id,base,id,context),partner=evaluateTrade(s,other,base,id,context);
      const lower=Math.max(-s.players[other].cash,-partner.net),upper=Math.min(s.players[id].cash,own.net);
      if(upper<lower)continue;
      for(const share of concessionOrder(s,other)){
        const payment=Math.round(lower+(upper-lower)*share),proposal={...base,giveCash:Math.max(0,payment),takeCash:Math.max(0,-payment)};
        if(evaluateTrade(s,id,proposal,id,context).net>=0&&evaluateTrade(s,other,proposal,id,context).net>=-1)add('OFFER',proposal);
      }
    }
  }
  const valued=out.map(c=>{const own=evaluateTrade(s,id,c.trade,id,context),partner=evaluateTrade(s,c.trade.to,c.trade,id,context);return {...c,own:own.net,partner:partner.net,priority:own.net*tradeAcceptance(s,c.trade.to,partner)};});
  return paretoFrontier(valued).sort((a,b)=>b.priority-a.priority).slice(0,analysis.options.fast?6:24).map(({priority,own,partner,...c})=>c);
}
export function paretoFrontier(rows){
  return rows.filter((a,i)=>!rows.some((b,j)=>i!==j&&b.trade.to===a.trade.to&&b.own>=a.own&&b.partner>=a.partner&&(b.own>a.own+1e-8||b.partner>a.partner+1e-8)));
}

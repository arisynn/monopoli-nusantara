import {BOARD,GROUPS} from '../content.mjs';
import {assets,interest,canTrade} from '../game.mjs';
import {analyzeState,portfolioValue,liquidityPenalty,clamp} from './analysis.mjs';
import {memoryFor} from './memory.mjs';
const empty=to=>({to,give:[],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0});
export function evaluateTrade(s,id,t,from=t.from){
 if(from===undefined)from=id;
 const to=t.to,other=id===from?to:from;if(id!==from&&id!==to)return {net:-Infinity,raw:-Infinity,opponentGain:Infinity};
 const a=analyzeState(s,id),b=analyzeState(s,other),next={...s,assets:structuredClone(s.assets),players:s.players.map(p=>({...p,cards:[...p.cards]}))};
 next.players[from].cash+=t.takeCash-t.giveCash;next.players[to].cash+=t.giveCash-t.takeCash;
 for(const [ids,owner] of [[t.give,to],[t.take,from]])for(const tile of ids){next.assets[tile].owner=owner;if(next.assets[tile].mortgaged)next.players[owner].cash-=interest(tile);}
 const cash=next.players[id].cash-s.players[id].cash,otherCash=next.players[other].cash-s.players[other].cash;
 const cards=(id===from?t.takeCards-t.giveCards:t.giveCards-t.takeCards)*250;
 const raw=cash+cards+portfolioValue(next,id,a)-portfolioValue(s,id,a);
 const opponentGain=otherCash-cards+portfolioValue(next,other,b)-portfolioValue(s,other,b);
 let monopolyThreat=0;
 for(const g of GROUPS){const before=g.ids.every(i=>s.assets[i].owner===other),after=g.ids.every(i=>next.assets[i].owner===other);
  if(after&&!before){const cost=g.ids.length*3*BOARD[g.ids[0]].build;
   const danger=g.ids.reduce((n,i)=>n+BOARD[i].rents[3]*a.probability(i),0)*a.persona.horizon;
   monopolyThreat+=Math.max(0,danger-cost*.3)*clamp(next.players[other].cash/Math.max(1,cost),.15,1)*a.persona.blocking*.65;
  }
 }
 const liquidity=liquidityPenalty(next.players[id].cash,a.reserve)-liquidityPenalty(s.players[id].cash,a.reserve);
 return {raw,net:raw-monopolyThreat-liquidity,opponentGain,monopolyThreat,liquidity};
}
export function negotiationCandidates(s,id,analysis){
 const out=[],add=(type,trade)=>out.push({type,trade});
 if(s.phase==='trade'&&s.trade.to===id){
  const current=s.trade,value=evaluateTrade(s,id,current,current.from);
  if(value.net>=0||(s.botMemory?.negotiation?.depth||0)>=2)return out;
  if(!current.give.length&&!current.giveCash&&!current.giveCards)return out;
  const counter={to:current.from,give:[...current.take],take:[...current.give],giveCash:0,takeCash:0,giveCards:current.takeCards,takeCards:current.giveCards};
  const raw=evaluateTrade(s,id,counter,id).net;
  if(raw>0)counter.giveCash=Math.floor(Math.min(raw*.7,Math.max(0,s.players[id].cash-analysis.reserve*.4),current.takeCash));
  else counter.takeCash=Math.ceil(-raw+Math.min(200,Math.abs(raw)*.08));
  if(counter.takeCash<=s.players[counter.to].cash&&evaluateTrade(s,id,counter,id).net>=0)add('COUNTER',counter);
  return out;
 }
 const memory=memoryFor(s,id);
 if(!['end','debt'].includes(s.phase)||!canTrade(s,id)||s.players[id].lastOfferRound===s.round||s.turnSerial-memory.lastOfferSerial<s.players.length)return out;
 const available=assets(s,id).filter(t=>!s.assets[t.id].level&&(t.group<0||GROUPS[t.group].ids.every(i=>!s.assets[i].level)));
 if(s.phase==='debt'&&s.debt.from===id){
  for(const p of analysis.others){if(memory.rejections[p.id]?.untilSerial>s.turnSerial)continue;
   for(const t of available.slice().sort((a,b)=>a.price-b.price).slice(0,4)){
    const trade={...empty(p.id),give:[t.id],takeCash:Math.min(p.cash,Math.ceil(Math.max(t.price*.85,s.debt.amount-s.players[id].cash)))};
    if(trade.takeCash>t.mortgage&&trade.takeCash<=t.price*1.4)add('OFFER',trade);
   }
  }
  return out.slice(0,6);
 }
 const targets=BOARD.filter(t=>t.price&&s.assets[t.id].owner!==null&&s.assets[t.id].owner!==id&&s.assets[t.id].level===0&&(t.group<0||GROUPS[t.group].ids.every(i=>!s.assets[i].level)))
  .filter(t=>t.group>=0&&analysis.groups[t.group].owned>0)
  .sort((a,b)=>(b.group===analysis.targetGroup)-(a.group===analysis.targetGroup)||analysis.groups[b.group].owned-analysis.groups[a.group].owned).slice(0,3);
 for(const t of targets){const other=s.assets[t.id].owner;if(memory.rejections[other]?.untilSerial>s.turnSerial)continue;
  const cash=Math.ceil(t.price*1.1),trade={...empty(other),take:[t.id],giveCash:cash};
  if(cash<=s.players[id].cash)add('OFFER',trade);
  const donors=available.filter(d=>d.group!==t.group&&!(d.group>=0&&analysis.groups[d.group].owned===GROUPS[d.group].ids.length))
   .sort((a,b)=>{const count=d=>d.group<0?0:GROUPS[d.group].ids.filter(i=>s.assets[i].owner===other).length;return count(b)-count(a)||a.price-b.price}).slice(0,3);
  for(const d of donors){
   const swap={...empty(other),give:[d.id],take:[t.id]};
   const otherGain=evaluateTrade(s,other,swap,id).net;
   if(otherGain<0)swap.giveCash=Math.ceil(-otherGain+Math.min(100,-otherGain*.05));
   if(swap.giveCash<=s.players[id].cash)add('OFFER',swap);
  }
 }
 return out.slice(0,12);
}

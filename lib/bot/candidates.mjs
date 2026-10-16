import {BOARD,DECKS,AUCTION_RULES} from '../content.mjs';
import {botCandidates,command,canManage,managementError,assets,chooseBot as baseline} from '../game.mjs';
import {propertyValue,auctionCompetition} from './analysis.mjs';
import {negotiationCandidates} from './negotiation.mjs';
export function ruleState(visible){
 const held=new Set(visible.players.flatMap(p=>p.cards||[]).map(c=>c.deck+':'+c.idx));
 if(visible.card?.jailCard)held.add(visible.card.deck+':'+visible.card.idx);
 return {...visible,seen:[],decks:Object.fromEntries(Object.entries(DECKS).map(([name,cards])=>[name,cards.map((_,i)=>i).filter(i=>!held.has(name+':'+i))]))};
}
export function legalCandidate(visible,id,action){
 try{command(ruleState(visible),id,action,()=>.413);return true}catch{return false}
}
export function generateCandidates(s,id,a){
 if(s.schemaVersion===1){const action=baseline(s,id);return action?[action]:[];}
 let candidates=botCandidates(s,id).map(({actionId,...action})=>action).filter(action=>!['BID','OFFER'].includes(action.type));
 if(s.phase==='auction'){
  const auction=s.auction,member=auction.participants.includes(id);
  candidates=candidates.filter(action=>!(action.type==='PASS'&&auction.passed.includes(id)));
  if(member&&auction.highest!==id){const tile=auction.kind==='building'?auction.targets[id]:auction.tile;
   const minimum=Math.max(AUCTION_RULES.minimum,auction.amount+AUCTION_RULES.increment);
   const value=auction.kind==='building'?BOARD[tile].build*2:propertyValue(s,id,tile,a);
   const maximum=Math.floor(Math.min(s.players[id].cash,Math.max(0,value),Math.max(0,s.players[id].cash-a.reserve*.35))/AUCTION_RULES.increment)*AUCTION_RULES.increment;
   const opponent=a.others.filter(p=>auction.participants.includes(p.id)).reduce((v,p)=>Math.max(v,s.botMemory?.opponents?.[p.id]?.aggression||1),1);
   const contest=Math.min(maximum,auctionCompetition(s,id,a)*.75);
   const values=[minimum,Math.ceil(contest/AUCTION_RULES.increment)*AUCTION_RULES.increment,Math.ceil((minimum+Math.max(minimum,maximum)*.12*opponent)/AUCTION_RULES.increment)*AUCTION_RULES.increment,maximum];
   for(const amount of [...new Set(values)])if(amount>=minimum&&amount<=maximum)candidates.push({type:'BID',amount});
  }
 }
 if(canManage(s,id))for(const t of assets(s,id))for(const type of ['BUILD','REDEEM','MORTGAGE','SELL','SELL_SET']){
  if(!managementError(s,id,t.id,type)&&!(s.phase==='debt'&&['BUILD','REDEEM'].includes(type))&&!(s.phase==='auction'&&type==='BUILD'))candidates.push({type,tile:t.id});
 }
 if(!a.options.ablateTrade)candidates.push(...negotiationCandidates(s,id,a));
 if(s.phase==='debt'&&s.debt.from===id)candidates.push({type:'BANKRUPT'});
 const unique=new Map();for(const action of candidates){const key=JSON.stringify(action);if(!unique.has(key)&&legalCandidate(s,id,action))unique.set(key,action);}
 return [...unique.values()].slice(0,64).map((action,i)=>({...action,actionId:`c${i}`}));
}

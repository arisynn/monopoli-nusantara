import {BOARD,DECKS,AUCTION_RULES} from '../content.mjs';
import {botCandidates,command,canManage,managementError,assets,chooseBot as baseline} from '../game.mjs';
import {propertyValue,auctionCompetition,rationalBidLimit} from './analysis.mjs';
import {negotiationCandidates} from './negotiation.mjs';
import {constructionAffordable} from './economy.mjs';
import {blockedDevelopment} from './memory.mjs';
export function ruleState(visible){
 const held=new Set(visible.players.flatMap(p=>p.cards||[]).map(c=>c.deck+':'+c.idx));
 if(visible.card?.jailCard)held.add(visible.card.deck+':'+visible.card.idx);
 return {...visible,seen:[],decks:Object.fromEntries(Object.entries(DECKS).map(([name,cards])=>[name,cards.map((_,i)=>i).filter(i=>!held.has(name+':'+i))]))};
}
export function candidateState(visible,id,action,context){
 const {actionId,...intent}=action;
 const compute=()=>{
  context?.count('transitions');
  try{
   const rules=context?context.memo(visible,'rules','public',()=>ruleState(visible)):ruleState(visible);
   return command(rules,id,intent,()=>.413);
  }catch{context?.count('rejected');return null;}
 };
 return context?context.memo(visible,'transition',id+':'+JSON.stringify(intent),compute):compute();
}
export function legalCandidate(visible,id,action,context){
 return !!action&&!!candidateState(visible,id,action,context);
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
   const maximum=rationalBidLimit(s,id,value,a);
   const opponent=a.options.ablateOpponent?1:a.others.filter(p=>auction.participants.includes(p.id)).reduce((v,p)=>Math.max(v,s.botMemory?.opponents?.[p.id]?.aggression||1),1);
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
 const unique=new Map();for(const action of candidates){if(!constructionAffordable(s,id,action,a.reserve))continue;if(['BUILD','BUILD_JOIN'].includes(action.type)&&blockedDevelopment(s,id,action.tile))continue;const key=JSON.stringify(action);if(!unique.has(key)&&legalCandidate(s,id,action,a.options.context))unique.set(key,action);}
 const all=[...unique.values()];
 // Round-robin action families only when capped. Mechanical exits and complete
 // economic alternatives must survive a large management/trade portfolio.
 let selected=all;
 if(all.length>64){const buckets=new Map();for(const action of all){if(!buckets.has(action.type))buckets.set(action.type,[]);buckets.get(action.type).push(action);}selected=[];while(selected.length<64){let added=false;for(const bucket of buckets.values())if(bucket.length&&selected.length<64){selected.push(bucket.shift());added=true;}if(!added)break;}}
 return selected.map((action,i)=>({...action,actionId:`c${i}`}));
}

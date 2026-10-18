import {BOARD} from '../content.mjs';
import {offerArm,negotiationContext,ownershipKey} from './concessions.mjs';
import {rememberTradeResponse,tradeSignature} from './trade-memory.mjs';
import {recordNusaObservation,observedOpponents} from './observer.mjs';
export const developmentFingerprint=s=>JSON.stringify([s.turnSerial,s.players.map(p=>[p.cash,p.out]),s.assets]);
export function blockedDevelopment(s,id,tile){
 const blocked=memoryFor(s,id).blockedDevelopment;
 return blocked?.fingerprint===developmentFingerprint(s)&&blocked.tiles.includes(tile);
}
export function memoryFor(state,id){return state.botMemory?.players?.[id]||{lastOfferSerial:-100,lastSignature:'',rejections:{}};}
export function recordBotMemory(state,previous,actor,action){
 const failedBuilding=action.type==='PASS'&&previous.auction?.kind==='building'&&previous.auction.highest===null&&state.auction?.id!==previous.auction.id;
 if(!failedBuilding&&!['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT','BID'].includes(action.type)&&!state.players.some(p=>p.controller==='bot'&&p.botPersona==='nusa'&&!p.out))return;
 const m=state.botMemory||={version:1,players:{},opponents:{},negotiation:null};
 m.players||={};m.opponents||={};
 rememberTradeResponse(state,previous,actor,action,m);
 recordNusaObservation(state,previous,actor,action,m);
 if(failedBuilding)for(const [player,tile] of Object.entries(previous.auction.targets)){
  const memory=m.players[player]||={lastOfferSerial:-100,lastSignature:'',rejections:{}};
  const fingerprint=developmentFingerprint(state),old=memory.blockedDevelopment;
  memory.blockedDevelopment={fingerprint,tiles:[...new Set([...(old?.fingerprint===fingerprint?old.tiles:[]),tile])].slice(-28)};
 }
 const own=m.players[actor]||={lastOfferSerial:-100,lastSignature:'',rejections:{}};
 if(action.type==='OFFER'){
  if(state.players[actor].controller==='bot'){own.lastOfferSerial=state.turnSerial;own.lastSignature=JSON.stringify(action.trade);own.lastCanonicalSignature=tradeSignature(action.trade);}
  m.negotiation={depth:0,startedVersion:previous.version,from:actor,to:action.trade.to};
 }
 if(action.type==='COUNTER')m.negotiation={...(m.negotiation||{}),depth:(m.negotiation?.depth||0)+1};
 if(['OFFER','COUNTER'].includes(action.type)){
  const old=m.opponents[actor]||{aggression:1,observations:0},groups={...(old.groups||{})};
  for(const tile of action.trade.take){const group=BOARD[tile].group;if(group>=0)groups[group]=Math.min(100,(groups[group]||0)+1);}
  m.opponents[actor]={...old,groups};
 }
 if(action.type==='TRADE_REJECT'&&previous.trade&&actor===previous.trade.to){
  const from=previous.trade.from,prior=m.players[from]||={lastOfferSerial:-100,lastSignature:'',rejections:{}};
  prior.rejections[actor]={untilSerial:state.turnSerial+state.players.length*2,count:Math.min(10,(prior.rejections[actor]?.count||0)+1),ownership:ownershipKey(state)};
 }
 if(['TRADE_ACCEPT','TRADE_REJECT'].includes(action.type)&&previous.trade&&actor===previous.trade.to){
  const old=m.opponents[actor]||{aggression:1,observations:0};
  const context=negotiationContext(previous),arms=Array.from({length:4},(_,i)=>({accepted:0,rejected:0,...old.concessions?.[context]?.[i]})),arm=offerArm(previous.trade),counts=arms[arm];
  arms[arm]={accepted:Math.min(1000,counts.accepted+Number(action.type==='TRADE_ACCEPT')),rejected:Math.min(1000,counts.rejected+Number(action.type==='TRADE_REJECT'))};
  m.opponents[actor]={...old,concessions:{...(old.concessions||{}),[context]:arms},tradeAccepted:Math.min(1000,(old.tradeAccepted||0)+(action.type==='TRADE_ACCEPT'?1:0)),tradeRejected:Math.min(1000,(old.tradeRejected||0)+(action.type==='TRADE_REJECT'?1:0))};
 }
 if(['TRADE_ACCEPT','TRADE_REJECT'].includes(action.type))m.negotiation=null;
 if(action.type==='BID'&&previous.auction){
  const a=previous.auction,t=BOARD[a.kind==='building'?a.targets[actor]:a.tile];
  const ratio=action.amount/(a.kind==='building'?t.build:t.price);
  const old=m.opponents[actor];m.opponents[actor]={...old,aggression:Math.min(4,old?old.aggression*.75+ratio*.25:ratio),observations:Math.min(1000,(old?.observations||0)+1)};
 }
}
export function strategyView(state,id){
 const {decks,seen,botMemory,...visible}=state;
 return {...visible,log:(state.log||[]).filter(e=>!e.audience||e.audience==='public').slice(0,80),botMemory:{version:1,players:{[id]:memoryFor(state,id)},opponents:observedOpponents(botMemory,id),negotiation:botMemory?.negotiation||null}};
}

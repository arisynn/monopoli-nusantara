import {BOARD} from '../content.mjs';

// Version, logs, own cash and mortgage flags are deliberately excluded: paying
// interest and flipping a deed are not economic progress. New obligations,
// construction, movement, other players' actions and turn changes invalidate it.
export function financeContext(s, actor) {
  return JSON.stringify([s.matchId,s.turnSerial,s.phase,s.turn,s.debt,s.buy,s.auction,
    s.trade,s.mortgageDecision,s.buildOffer,s.rentClaims,
    s.players.map(p=>[p.id,p.out,p.pos,p.inJail,p.id===actor?null:p.cash]),
    Object.values(s.assets).map(a=>[a.owner,a.level])]);
}
export function financeMemory(s, actor) {
  const m=s.botMemory?.players?.[actor]?.finance;
  return m?.context===financeContext(s,actor)?m:null;
}
export function blockedFinance(s,actor,action) {
  if(!['MORTGAGE','REDEEM'].includes(action?.type)||s.phase==='debt')return false;
  const previous=financeMemory(s,actor)?.tiles?.[action.tile];
  return !!previous&&previous!==action.type;
}
export function cleanFinancePath(path) {
  if(!Array.isArray(path)||!path.length||path.length>24)return null;
  const out=[];
  for(const a of path){
    if(!a||!['MORTGAGE','BUILD','REDEEM','BUY'].includes(a.type))return null;
    if(a.type==='BUY')out.push({type:'BUY'});
    else {if(!Number.isInteger(a.tile)||!BOARD[a.tile]?.price)return null;out.push({type:a.type,tile:a.tile});}
  }
  return out;
}
export function recordFinance(state,previous,actor,action,memory) {
  const old=financeMemory(previous,actor),same=(a,b)=>a?.type===b?.type&&a?.tile===b?.tile;
  const tiles=financeContext(state,actor)===financeContext(previous,actor)?{...(old?.tiles||{})}:{};
  if(['MORTGAGE','REDEEM'].includes(action.type))tiles[action.tile]=action.type;
  let pending=old?.pending?.length&&same(old.pending[0],action)?old.pending.slice(1):[];
  const planned=action.type==='MORTGAGE'&&cleanFinancePath(action.financePlan);
  if(planned)pending=planned;
  const own=memory.players[actor]||={lastOfferSerial:-100,lastSignature:'',rejections:{}};
  own.finance={version:1,context:financeContext(state,actor),tiles,pending};
}

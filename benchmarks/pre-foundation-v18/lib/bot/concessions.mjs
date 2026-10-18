import {BOARD} from '../content.mjs';
export const CONCESSIONS=Object.freeze([.2,.35,.5,.65]);
export const ownershipKey=s=>BOARD.filter(t=>t.price).map(t=>s.assets[t.id].owner??'-').join(',');
export const negotiationContext=s=>BOARD.filter(t=>t.price&&s.assets[t.id].owner===null).length>12?'early':'late';
export function offerArm(trade){
 const gross=trade.give.reduce((n,i)=>n+BOARD[i].price,0)+trade.take.reduce((n,i)=>n+BOARD[i].price,0);
 const fraction=Math.min(1,Math.max(0,trade.giveCash-trade.takeCash)/Math.max(1,gross));
 return CONCESSIONS.reduce((best,v,i)=>Math.abs(v-fraction)<Math.abs(CONCESSIONS[best]-fraction)?i:best,0);
}
/** Small contextual UCB posterior over observed public accept/reject responses.
 * Ranks safe concession sizes only; it can never override the trade evaluator. */
export function concessionOrder(s,recipient){
 const arms=s.botMemory?.opponents?.[recipient]?.concessions?.[negotiationContext(s)]||[],total=arms.reduce((n,a)=>n+(a?.accepted||0)+(a?.rejected||0),0);
 return CONCESSIONS.map((value,index)=>{const a=arms[index]||{},n=(a.accepted||0)+(a.rejected||0),posterior=((a.accepted||0)+2)/(n+4);
  return {value,score:posterior+.15*Math.sqrt(Math.log(total+2)/(n+1))};
 }).sort((a,b)=>b.score-a.score||a.value-b.value).map(a=>a.value);
}
export function rejectionActive(s,memory,recipient){const rejection=memory.rejections?.[recipient];return rejection?.untilSerial>s.turnSerial&&(!rejection.ownership||rejection.ownership===ownershipKey(s));}

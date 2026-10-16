import {BOARD,GROUPS} from './content.mjs';

export const boundedAmount=(value,max)=>Math.max(0,Math.min(max,Math.floor(Number(value)||0)));
export function changeTradeOpponent(trade,to){return to===trade.to?trade:{...trade,to,take:[],takeCash:0,takeCards:0}}
export function toggleSelection(selected,id,multiple=true){return multiple?(selected.includes(id)?selected.filter(n=>n!==id):[...selected,id]):[id]}
export function filterChoices(items,query='',selectedOnly=false,selected=[]){
 const needle=query.trim().toLocaleLowerCase('id');
 return items.filter(item=>(!selectedOnly||selected.includes(item.id))&&`${item.label} ${item.detail||''}`.toLocaleLowerCase('id').includes(needle));
}
export function tradeChoices(game,owner,selected=[]){
 return BOARD.filter(t=>game.assets[t.id]?.owner===owner||selected.includes(t.id)).map(t=>{
  const a=game.assets[t.id],stale=a?.owner!==owner,developed=t.group>=0&&GROUPS[t.group].ids.some(id=>game.assets[id]?.level>0);
  return {id:t.id,label:t.name,color:t.color,detail:stale?'Pemilik berubah · hapus pilihan':developed?'Jual bangunan kelompok dahulu':a.mortgaged?'Digadai':`Harga Rp${t.price.toLocaleString('id-ID')}`,disabled:(stale||developed)&&!selected.includes(t.id)};
 });
}
export function tradeDraftStatus(game,from,trade){
 const to=game.players.find(p=>p.id===trade.to&&p.id!==from&&!p.out);
 const ids=[...trade.give,...trade.take];
 const hasValue=ids.length+trade.giveCash+trade.takeCash+trade.giveCards+trade.takeCards>0;
 let reason='';
 if(!to)reason='Pilih lawan yang masih aktif.';
 else if(new Set(ids).size!==ids.length)reason='Properti terpilih lebih dari sekali.';
 else if([[trade.give,from],[trade.take,to.id]].some(([list,owner])=>list.some(id=>game.assets[id]?.owner!==owner||(BOARD[id]?.group>=0&&GROUPS[BOARD[id].group].ids.some(tile=>game.assets[tile]?.level>0)))))reason='Kepemilikan atau bangunan berubah. Periksa pilihan properti.';
 else if([trade.giveCash,trade.takeCash,trade.giveCards,trade.takeCards].some(n=>!Number.isSafeInteger(n)||n<0)||trade.giveCash>game.players[from].cash||trade.takeCash>to.cash||trade.giveCards>game.players[from].cards.length||trade.takeCards>to.cards.length)reason='Uang atau kartu melebihi kepemilikan saat ini.';
 return {hasValue,invalid:!!reason,reason};
}

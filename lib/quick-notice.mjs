/** A summary for presentation only. Full engine text remains in History. */
export function summarizeNotices(list){
 if(!list.length)return null;
 const useful=list.filter(e=>!/^Giliran |kedaluwarsa|dapat menagih/.test(e.text));
 const chosen=useful.length?useful:list;
 const full=chosen.map(e=>e.text).join(' ');
 const turn=chosen.every(e=>e.type==='turn');
 let text=turn?chosen.at(-1).text:full;
 if(!turn&&full.length>96){
  const first=chosen[0];
  text=first.type==='trade'&&/Barter selesai/.test(first.text)?'Barter selesai.':first.type==='trade'&&/ditolak|dibatalkan/.test(first.text)?'Tawaran barter ditolak atau dibatalkan.':first.text.length>90?first.text.slice(0,87).trimEnd()+'…':first.text;
  if(chosen.length>1)text+=' + transaksi lain';
 }
 return {id:list.at(-1).id,text,detail:!turn&&text!==full,kind:turn?'turn':'transaction',duration:turn?2000:3200};
}

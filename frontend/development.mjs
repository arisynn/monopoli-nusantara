import {BOARD,GROUPS,rent,canTrade} from '../lib/game.mjs';
import {assetPermission} from './domain.mjs';

export function developmentGroups(state,seat,busy=false){
 return GROUPS.map((group,id)=>{
  const owned=group.ids.filter(tile=>state.assets[tile].owner===seat).length;
  const rows=group.ids.map(tile=>{
   const t=BOARD[tile],a=state.assets[tile],own=a.owner===seat;
   const reason=own?assetPermission(state,seat,tile,'BUILD',busy):'Bukan milik Anda.';
   const barter=!busy&&a.owner!==null&&!own&&!state.players[a.owner]?.out&&canTrade(state,seat)&&!group.ids.some(i=>state.assets[i].level>0);
   return {tile,own,owner:a.owner,level:a.level,mortgaged:a.mortgaged,reason,barter,
    rent:rent(state,tile),nextRent:a.level<5?t.rents[a.level+1]:null,cost:t.build};
  });
  const ready=rows.some(row=>!row.reason),missing=group.ids.length-owned,mortgaged=rows.some(row=>row.mortgaged);
  const status=missing?`Kurang ${missing} properti`:mortgaged?'Masih digadai':ready?'Siap dibangun':rows.every(row=>row.level===5)?'Hotel lengkap':rows.find(row=>row.reason)?.reason||'Bangun merata';
  return {...group,id,owned,ready,missing,status,rows};
 }).sort((a,b)=>Number(b.ready)-Number(a.ready)||Number(b.missing===0)-Number(a.missing===0)||b.owned-a.owned||a.id-b.id);
}

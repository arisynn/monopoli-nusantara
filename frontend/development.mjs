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

// Preview only. Uses the same BUILD validator, never writes to the live snapshot.
// The queue revalidates each individual intention against the latest server state.
export function buildPreview(state,seat,group,count=15){
 const ids=GROUPS[group]?.ids;if(!ids||!Number.isInteger(count)||count<1||count>15)return {tiles:[],cost:0};
 let preview={...state,assets:structuredClone(state.assets),players:state.players.map(p=>({...p}))};
 const tiles=[];let cost=0;
 for(let n=0;n<count;n++){
  const tile=ids.filter(id=>!assetPermission(preview,seat,id,'BUILD')).sort((a,b)=>preview.assets[a].level-preview.assets[b].level||a-b)[0];
  if(tile===undefined)break;
  const price=BOARD[tile].build;tiles.push(tile);cost+=price;
  preview.assets[tile].level++;preview.players[seat].cash-=price;
 }
 return {tiles,cost};
}

'use client';
import NusaText from './NusaText';
import {ChevronRight} from 'lucide-react';
import {BOARD,GROUPS,money} from '@/lib/content.mjs';
import {managementError,canManage,redemption} from '@/lib/game.mjs';

export default function AssetActions({game,player,tile,busy,onAction}:{game:any;player:number;tile:number;busy:boolean;onAction:(id:number,type:string)=>void}){
 const property:any=BOARD[tile],asset=game.assets[tile];
 const choices=asset?.mortgaged?[['REDEEM','Tebus',money(game.schemaVersion===1?Math.ceil(property.mortgage*1.1):redemption(tile))]]:asset?.level>0?
  [['BUILD',asset.level===4?'Bangun hotel':`Bangun rumah ke-${asset.level+1}`,money(property.build)],['SELL','Jual bangunan',`Terima ${money(property.build/2)}`],['SELL_SET','Jual semua bangunan set','Seluruh kelompok warna']]:
  [...(property.type==='city'?[['BUILD',asset.level===4?'Bangun hotel':`Bangun rumah ke-${asset.level+1}`,money(property.build)],...(GROUPS[property.group].ids.some(id=>game.assets[id]?.level>0)?[['SELL_SET','Jual semua bangunan set','Seluruh kelompok warna']]:[])]:[]),['MORTGAGE','Gadai',`Terima ${money(property.mortgage)}`]];
 return <div className="manage-actions">{choices.filter(([type])=>type!=='BUILD'||asset?.level!==5).map(([type,label,cost])=>{
  const reason=managementError(game,player,tile,type)||(!canManage(game,player)||(game.schemaVersion===1&&!['roll','end','jail','debt'].includes(game.phase))?'Selesaikan keputusan aktif dahulu.':game.phase==='debt'&&['BUILD','REDEEM'].includes(type)?'Lunasi utang dahulu.':game.phase==='auction'&&type==='BUILD'?'Selesaikan lelang sebelum membangun.':game.phase==='auction'&&game.auction.highest===player&&type==='REDEEM'&&game.players[player].cash-redemption(tile)<game.auction.amount?'Kas dicadangkan untuk tawaran tertinggi.':busy?'Tunggu tindakan selesai.':'');
  return <div className="manage-choice" key={type}><button className="secondary" disabled={!!reason} aria-describedby={`asset-${tile}-${type}`} onClick={()=>onAction(tile,type)}><span>{label}<small><NusaText text={cost}/></small></span><ChevronRight size={17}/></button><small id={`asset-${tile}-${type}`}><NusaText text={reason||(['BUILD','REDEEM'].includes(type)?`Saldo setelah ${type==='BUILD'?'bangun':'tebus'}: ${money(game.players[player].cash-(type==='BUILD'?property.build:game.schemaVersion===1?Math.ceil(property.mortgage*1.1):redemption(tile)))}`:'')} /></small></div>;
 })}</div>;
}

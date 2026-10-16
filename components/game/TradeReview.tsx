'use client';
import NusaText from './NusaText';
import {ArrowLeftRight,Coins,Landmark} from 'lucide-react';
import {interest,redemption} from '@/lib/game.mjs';
import {BOARD,money} from '@/lib/content.mjs';
export default function TradeReview({game,from,to,trade}:{game:any;from:number;to:number;trade:any}){
 const parts=[{id:from,ids:trade.give,cash:trade.giveCash,cards:trade.giveCards},{id:to,ids:trade.take,cash:trade.takeCash,cards:trade.takeCards}];
 const mortgages=[...trade.give,...trade.take].filter((id:number)=>game.assets[id]?.mortgaged);
 const property=(tile:number)=><span key={tile}><Landmark size={14}/>{BOARD[tile]?.name||'Properti berubah'}{game.assets[tile]?.mortgaged?' · digadai':''}</span>;
 return <div className="trade-review" aria-label="Ringkasan tawaran barter">
  <div className="trade-review-title"><ArrowLeftRight size={16}/> Ringkasan pertukaran</div>
  {parts.map(({id,ids,cash,cards})=><div key={id} className="trade-review-side"><b>{game.players[id]?.name||'Pemain'} memberikan</b>
   {ids.slice(0,3).map(property)}
   {ids.length>3&&<details className="trade-more-properties"><summary>{ids.length-3} properti lainnya</summary>{ids.slice(3).map(property)}</details>}
   {cash>0&&<span><Coins size={14}/><NusaText text={money(cash)}/></span>}
   {cards>0&&<span>{cards} kartu bebas penjara</span>}
   {!ids.length&&!cash&&!cards&&<small>Tanpa properti, uang, atau kartu</small>}
  </div>)}
  <p className="trade-review-note">Berpindah setelah penawaran diterima.</p>
  {mortgages.length>0&&<div className="trade-warning"><b>{mortgages.length} aset tergadai · bunga <NusaText text={money(mortgages.reduce((n:number,id:number)=>n+interest(id),0))}/></b><p>{game.schemaVersion===1?'Bunga dibayar saat barter disetujui.':'Penerima memilih tebus langsung pokok +10%, atau bayar bunga 10% sekarang.'} Tebus nanti dikenai pokok +10% lagi.</p><details><summary>Biaya per properti</summary>{mortgages.map((id:number)=><p key={id}>{BOARD[id].name}: bunga <NusaText text={money(interest(id))}/><NusaText text={game.schemaVersion===1?'':` · tebus ${money(redemption(id))}`}/></p>)}</details></div>}
 </div>;
}

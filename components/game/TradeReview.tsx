'use client';
import {ArrowLeftRight,Coins,Landmark} from 'lucide-react';
import {BOARD,money} from '@/lib/content.mjs';
export default function TradeReview({game,from,to,trade}:{game:any;from:number;to:number;trade:any}){
 const parts=[{id:from,ids:trade.give,cash:trade.giveCash,cards:trade.giveCards},{id:to,ids:trade.take,cash:trade.takeCash,cards:trade.takeCards}];
 return <div className="trade-review" aria-label="Ringkasan tawaran barter">
  <div className="trade-review-title"><ArrowLeftRight size={16}/> Ringkasan pertukaran</div>
  {parts.map(({id,ids,cash,cards})=><div key={id} className="trade-review-side"><b>{game.players[id]?.name||'Pemain'} memberikan</b>
   {ids.map((tile:number)=><span key={tile}><Landmark size={14}/>{BOARD[tile].name}{game.assets[tile]?.mortgaged?' · digadai':''}</span>)}
   {cash>0&&<span><Coins size={14}/>{money(cash)}</span>}
   {cards>0&&<span>{cards} kartu bebas penjara</span>}
   {!ids.length&&!cash&&!cards&&<small>Belum ada yang dipilih</small>}
  </div>)}
 </div>;
}

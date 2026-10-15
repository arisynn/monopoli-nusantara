'use client';
import NusaText from './NusaText';
import {ArrowRight,ChevronRight,Dice5,Play,Trophy} from 'lucide-react';
import InlineFeedback,{type Feedback} from './InlineFeedback';
import {BOARD,money} from '@/lib/content.mjs';

/** A bounded action area: long decisions open the full, existing turn panel. */
export default function MobileDock({s,feedback,actor,human,busy,rolling,paused,traveling,act,onDetails,onResume,onNew}:{s:any,feedback?:Feedback,actor:number,human:boolean,busy:boolean,rolling:boolean,paused:boolean,traveling?:{moveId:number,player:number,step:number,total:number}|null,act:any,onDetails:()=>void,onResume:()=>void,onNew:()=>void}){
 const who=s.players[actor],disabled=busy||!human||rolling||paused||!!traveling;
 let title='',subtitle='',label='Buka keputusan',type='';
 switch(s.phase){
  case 'starting':title='Siapa mulai dahulu?';subtitle=`Lempar awal · ${who.name} · pion belum berjalan`;label='Lempar penentu giliran';type='START_ROLL';break;
  case 'roll':title=s.extra?'Dadu kembar!':'Saatnya melangkah';subtitle=`Giliran ${who.name}`;label=s.extra?'Lempar lagi':'Lempar dadu';type='ROLL';break;
  case 'end':title=BOARD[s.players[s.turn].pos].name;subtitle=`${s.dice.join(' + ')} = ${s.dice[0]+s.dice[1]} · Giliran ${who.name}`;label='Akhiri giliran';type='END';break;
  case 'buy':title=BOARD[s.buy].name;subtitle=who.cash<BOARD[s.buy].price?`Kas kurang ${money(BOARD[s.buy].price-who.cash)} · pilih lelang`:`Belum dimiliki · ${money(BOARD[s.buy].price)}`;break;
  case 'card':title=s.card.title;subtitle=s.card.deck==='chance'?'Kartu Kesempatan':'Kartu Dana Umum';label='Baca kartu';break;
  case 'auction':title=s.auction.kind==='building'?'Lelang bangunan':BOARD[s.auction.tile].name;subtitle=`Tawaran tertinggi ${money(s.auction.amount)}`;label='Buka lelang';break;
  case 'jail':title='Singgah di penjara';subtitle=`Percobaan ke-${who.jail+1} · ${who.name}`;label='Pilih cara keluar';break;
  case 'debt':title=`Tagihan ${money(s.debt.amount)}`;subtitle=`Kekurangan ${money(Math.max(0,s.debt.amount-who.cash))}`;label='Atur pembayaran';break;
  case 'trade':title='Tawaran barter';subtitle=`${s.players[s.trade.from].name} → ${s.players[s.trade.to].name}`;label='Tinjau penawaran';break;
  case 'mortgage':title=BOARD[s.mortgageDecision.tile].name;subtitle='Pilih cara menerima aset tergadai';label='Tinjau pilihan';break;
  case 'buildOffer':title='Stok bangunan terbatas';subtitle=`${s.buildOffer.remaining} ${s.buildOffer.kind==='house'?'rumah':'hotel'} tersisa`;label='Pilih bangunan';break;
  case 'won':title=`${s.players[s.winner].name} menang!`;subtitle='Penguasa Nusantara';label='Main lagi';break;
 }
 if(rolling){title='Dadu bergulir…';subtitle='Menyiapkan langkah berikutnya';label='Tunggu hasil dadu'}
 if(traveling){title=`${s.players[traveling.player]?.name||'Pion'} sedang berjalan`;subtitle=`${traveling.step} dari ${traveling.total} petak`;label='Pion bergerak…'}
 return <section className="mobile-dock" aria-label="Aksi giliran">
  <div className="dock-heading"><span className="dock-emblem">{s.phase==='won'?<Trophy size={25}/>:<Dice5 size={25}/>}</span><div><div className={`dock-meta ${feedback?'has-feedback':''}`}><small><NusaText text={subtitle}/></small><InlineFeedback feedback={feedback||null}/></div><h2 title={title}><NusaText text={title}/></h2></div></div>
  {traveling&&<div className="travel-progress" role="progressbar" aria-label="Perjalanan pion" aria-valuemin={0} aria-valuemax={traveling.total} aria-valuenow={traveling.step}><span style={{width:`${Math.round(traveling.step/Math.max(1,traveling.total)*100)}%`}}/></div>}
  <div className="dock-actions">
   {rolling?<button className="secondary" disabled>Dadu bergulir…</button>:traveling?<button className="secondary" disabled>Pion menuju {BOARD[s.players[traveling.player].pos].name}…</button>:
    paused?<button className="primary" onClick={onResume}>Lanjutkan permainan<Play size={18}/></button>:
    s.phase==='won'?<button className="primary" onClick={onNew}>{label}<ArrowRight size={18}/></button>:
    !human&&s.phase!=='auction'?<button className="secondary" onClick={onDetails}>{who.controller==='bot'?'Bot sedang berpikir…':`Menunggu ${who.name}`}<ChevronRight size={18}/></button>:
    s.phase==='buy'?<><button className="primary" disabled={disabled||who.cash<BOARD[s.buy].price} onClick={()=>act('BUY')}>Beli · <NusaText text={money(BOARD[s.buy].price)}/></button><button className="secondary" disabled={disabled} onClick={()=>act('AUCTION')}>Lelang</button></>:
    <button className="primary" disabled={type?disabled:false} onClick={()=>type?act(type):onDetails()}>{rolling?'Dadu bergulir…':label}{type==='ROLL'||type==='START_ROLL'?<Dice5 size={19}/>:<ArrowRight size={18}/>}</button>}
  </div>
 </section>
}

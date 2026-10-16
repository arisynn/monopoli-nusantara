'use client';
import NusaText from './NusaText';
import {useRef,useState} from 'react';
import {ArrowRight,Building2} from 'lucide-react';
import {BOARD,money} from '@/lib/content.mjs';
import {changeTradeOpponent,tradeChoices,tradeDraftStatus} from '@/lib/compact-ui.mjs';
import type {PickerRequest} from './SelectionView';
import TradeReview from './TradeReview';
import MoneyInput from './MoneyInput';

/** A single composer; long property lists temporarily replace the shared dialog. */
export default function TradeWizard({game,from,trade,onChange,onSubmit,canSubmit,busy,onPick,mode='offer'}:{
 game:any;from:number;trade:any;onChange:(value:any)=>void;onSubmit:(value:any)=>unknown|Promise<unknown>;canSubmit:boolean;busy:boolean;onPick:(request:PickerRequest)=>void;mode?:'offer'|'counter';
}){
 const submitting=useRef(false),[sending,setSending]=useState(false);
 const opponents=game.players.filter((p:any)=>p.id!==from&&!p.out);
 const {hasValue,invalid,reason}=tradeDraftStatus(game,from,trade);
 const mortgages=[...trade.give,...trade.take].some((id:number)=>game.assets[id]?.mortgaged);
 function update(patch:any){onChange({...trade,...patch})}
 async function submit(){if(submitting.current||busy||!canSubmit||!hasValue||invalid)return;submitting.current=true;setSending(true);try{await onSubmit({to:trade.to,give:trade.give,take:trade.take,giveCash:trade.giveCash,takeCash:trade.takeCash,giveCards:trade.giveCards,takeCards:trade.takeCards})}finally{submitting.current=false;setSending(false)}}
 function side(give:boolean){
  const owner=give?from:trade.to,player=game.players[owner],key=give?'give':'take',cash=give?'giveCash':'takeCash',cards=give?'giveCards':'takeCards',chosen=trade[key] as number[];
  if(!player)return null;
  return <section className="trade-compose-side" aria-label={give?'Aset yang diberikan':'Aset yang diterima'}><h4>{give?'Kamu memberi':'Kamu menerima'}<span>{player.name}</span></h4>
   <button type="button" className="property-pick" onClick={()=>onPick({title:give?'Properti diberikan':'Properti diterima',items:tradeChoices(game,owner,chosen),selected:chosen,multiple:true,onChange:ids=>update({[key]:ids})})}><Building2 size={18}/><span><b>{chosen.length?`${chosen.length} properti`:'Pilih properti'}</b><small>{chosen.length?chosen.map(id=>BOARD[id]?.name||'Properti berubah').join(', '):'Boleh lebih dari satu'}</small></span><ArrowRight size={17}/></button>
   <div className="trade-compose-inputs"><label>Uang (Nusa)<MoneyInput label={`Nusa dari ${player.name}`} units={trade[cash]} max={player.cash} disabled={busy} onUnitsChange={value=>update({[cash]:value})}/><small>Maks. <NusaText text={money(player.cash)}/></small></label>
   <label>Kartu bebas<select aria-label={`Kartu bebas dari ${player.name}`} value={trade[cards]} onChange={e=>update({[cards]:Number(e.target.value)})}>{Array.from({length:Math.max(player.cards.length,trade[cards])+1},(_,n)=><option key={n} value={n} disabled={n>player.cards.length}>{n} kartu{n>player.cards.length?' · tidak tersedia':''}</option>)}</select><small>{player.cards.length} tersedia</small></label></div>
  </section>;
 }
 return <section className="trade-simple trade-composer" aria-label={mode==='counter'?'Tawaran balik':'Buat barter'}>
  <div className="trade-simple-head"><h3>{mode==='counter'?'Tawaran balik':'Buat barter'}</h3></div>
  {mode==='counter'?<p className="trade-parties">{game.players[from].name}<ArrowRight size={14}/>{game.players[trade.to]?.name}</p>:<label className="field-label">Lawan barter<select aria-label="Pilih lawan barter" value={trade.to} onChange={e=>onChange(changeTradeOpponent(trade,Number(e.target.value)))}>{!opponents.some((p:any)=>p.id===trade.to)&&<option value={trade.to}>Pilih lawan</option>}{opponents.map((p:any)=><option key={p.id} value={p.id}>{p.name} · {money(p.cash)}</option>)}</select></label>}
  <div className="trade-compose-sides">{side(true)}{side(false)}</div>
  <details className="trade-review-details" open={mortgages||undefined}><summary>Ringkasan{mortgages?' & biaya aset tergadai':''}</summary><TradeReview game={game} from={from} to={trade.to} trade={trade}/></details>
  {invalid&&<p className="trade-warning" role="alert">{reason}</p>}
  {!canSubmit&&<p className="trade-warning" role="status">Belum dapat mengirim pada fase/koneksi ini. Draf tetap tersimpan.</p>}
  <div className="trade-simple-footer"><button type="button" className="primary" disabled={!canSubmit||busy||sending||!hasValue||invalid||!opponents.length} onClick={submit}>{sending?'Mengirim…':mode==='counter'?'Kirim tawaran balik':'Ajukan barter'}<ArrowRight size={17}/></button></div>
 </section>;
}

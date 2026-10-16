'use client';
import NusaText from './NusaText';
import {useState} from 'react';
import {Search} from 'lucide-react';
import {financeRows} from '@/lib/finance.mjs';
import type {PublicLogEvent,PresentedPlayer} from '@/lib/presentation-types';
import {nusaText} from '@/lib/currency.mjs';

const labels:Record<string,string>={start:'Mulai',turn:'Giliran',dice:'Dadu',move:'Perjalanan',buy:'Pembelian',rent:'Sewa',money:'Transaksi',build:'Bangunan',trade:'Barter',auction:'Lelang',debt:'Utang',bankrupt:'Bangkrut',card:'Kartu',auctionResult:'Hasil lelang',jail:'Penjara',release:'Bebas penjara',info:'Info'};
const transactions=new Set(['buy','rent','money','build','trade','auction','auctionResult','debt','bankrupt']);
export default function HistoryPanel({events,players=[]}:{events:PublicLogEvent[];players?:PresentedPlayer[]}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('semua'),[expanded,setExpanded]=useState<number|null>(null);
 const rows=events.filter(e=>(filter==='semua'||transactions.has(e.type)||!!e.finance?.length)&&nusaText(e.text).toLocaleLowerCase('id').includes(query.trim().toLocaleLowerCase('id')));
 return <section className="history-panel" aria-label="Riwayat permainan">
  <div className="section-heading"><h2>Riwayat</h2><small>TERBARU DAHULU</small></div>
  <div className="history-controls"><label className="simple-search"><Search size={18}/><input type="search" aria-label="Cari riwayat" placeholder="Cari pemain, kota, atau peristiwa" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <select aria-label="Saring riwayat" value={filter} onChange={e=>setFilter(e.target.value)}><option value="semua">Semua</option><option value="transaksi">Transaksi</option></select></div>
  <ol className="history-timeline">{rows.map((event,index)=><li key={event.id}>
   {(index===0||rows[index-1].turn!==event.turn)&&<h3>Putaran {event.turn}</h3>}
   <button type="button" className={`history-entry ${expanded===event.id?'expanded':''}`} aria-expanded={expanded===event.id} onClick={()=>setExpanded(old=>old===event.id?null:event.id)}><span className="history-sequence" aria-label={`Peristiwa ${event.id}`}>#{event.id}</span><div><small>{labels[event.type]||'Peristiwa'}</small><p><NusaText text={nusaText(event.text)}/></p>{!!event.finance?.length&&<span className="history-finance-tags">{event.finance.map((t,i)=><span key={i}>{t.from===null?'Bank':players[t.from]?.name||'Pemain'} → {t.to===null?'Bank':players[t.to]?.name||'Pemain'}</span>)}</span>}</div></button>{expanded===event.id&&!!event.finance?.length&&<ul className="history-finance-detail">{financeRows(event,players).map(row=><li key={row.id} className={row.amount>0?'income':'expense'}><NusaText text={row.text}/></li>)}</ul>}
  </li>)}</ol>
  {!rows.length&&<p className="simple-empty">{events.length?'Tidak ada riwayat yang cocok. Coba kata lain.':'Belum ada peristiwa.'}</p>}
  <p className="simple-hint">Menampilkan {rows.length} dari {events.length} peristiwa yang tersimpan.</p>
 </section>;
}

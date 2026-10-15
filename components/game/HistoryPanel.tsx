'use client';
import {useState} from 'react';
import {Search} from 'lucide-react';

const labels:Record<string,string>={start:'Mulai',turn:'Giliran',dice:'Dadu',move:'Perjalanan',buy:'Pembelian',rent:'Sewa',money:'Transaksi',build:'Bangunan',trade:'Barter',auction:'Lelang',debt:'Utang',bankrupt:'Bangkrut',card:'Kartu',jail:'Penjara',info:'Info'};
const transactions=new Set(['buy','rent','money','build','trade','auction','debt','bankrupt']);
export default function HistoryPanel({events}:{events:{id:number;text:string;type:string;turn:number}[]}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('semua');
 const rows=events.filter(e=>(filter==='semua'||transactions.has(e.type))&&e.text.toLocaleLowerCase('id').includes(query.trim().toLocaleLowerCase('id')));
 return <section className="history-panel" aria-label="Riwayat permainan">
  <div className="section-heading"><h2>Riwayat</h2><small>TERBARU DAHULU</small></div>
  <label className="simple-search"><Search size={18}/><input type="search" aria-label="Cari riwayat" placeholder="Cari pemain, kota, atau peristiwa" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="simple-filters" aria-label="Saring riwayat">{[['semua','Semua'],['transaksi','Transaksi']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
  <ol className="history-timeline">{rows.map((event,index)=><li key={event.id}>
   {(index===0||rows[index-1].turn!==event.turn)&&<h3>Putaran {event.turn}</h3>}
   <div className="history-entry"><span className="history-sequence" aria-label={`Peristiwa ${event.id}`}>#{event.id}</span><div><small>{labels[event.type]||'Peristiwa'}</small><p>{event.text}</p></div></div>
  </li>)}</ol>
  {!rows.length&&<p className="simple-empty">{events.length?'Tidak ada riwayat yang cocok. Coba kata lain.':'Belum ada peristiwa.'}</p>}
  <p className="simple-hint">Menampilkan {rows.length} dari {events.length} peristiwa yang tersimpan.</p>
 </section>;
}

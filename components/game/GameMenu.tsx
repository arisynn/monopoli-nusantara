'use client';
import {Building2,Handshake,History,Users,Save,Settings2,BookOpen,Home,Pause,Play,ChevronRight,ShieldCheck} from 'lucide-react';
import {APP_VERSION} from '@/lib/version.mjs';
interface Props {busy?:boolean;online:boolean;paused:boolean;status:string;onOpen:(feature:string)=>void;onPause:()=>void;onHome:()=>void}
export default function GameMenu({busy=false,online,paused,status,onOpen,onPause,onHome}:Props){
 const items=[{id:'aset',label:'Aset',detail:'Bangun, gadai & kelola',Icon:Building2},{id:'barter',label:'Barter',detail:'Tukar properti & Nusa',Icon:Handshake},{id:'riwayat',label:'Riwayat',detail:'Setiap langkah & transaksi',Icon:History},
  ...(online?[{id:'room',label:'Room',detail:'Peserta, jeda & koneksi',Icon:Users}]:[]),{id:'saves',label:'Simpanan',detail:online?'Room tersimpan di server':'Cadangkan & lanjutkan',Icon:Save},{id:'settings',label:'Pengaturan',detail:'Suara, kamera & animasi',Icon:Settings2},{id:'rules',label:'Aturan',detail:'Panduan permainan',Icon:BookOpen}];
 return <section className="table-menu" aria-label="Menu permainan">
  <div className="sheet-intro"><small>MEJA PERMAINAN</small><h2>Semua yang kamu perlukan.</h2><p>Papan tetap menunggumu.</p></div>
  <div className="table-menu-grid">{items.map(({id,label,detail,Icon})=><button type="button" key={id} className="table-menu-item" onClick={()=>onOpen(id)}><Icon size={21}/><span><b>{label}</b><small>{detail}</small></span><ChevronRight size={15}/></button>)}</div>
  {!online&&<button className="secondary table-pause" onClick={onPause}>{paused?<Play size={17}/>:<Pause size={17}/>} {paused?'Lanjutkan permainan':'Jeda permainan'}</button>}
  <button className="text-link table-leave" disabled={busy} onClick={onHome}><Home size={16}/>Simpan & kembali ke menu</button>
  <div className="table-menu-footer"><span><ShieldCheck size={13}/>{status}</span><small>v{APP_VERSION}</small></div>
 </section>;
}

'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,Coins,Search,Users} from 'lucide-react';
import {BOARD,GROUPS,money} from '@/lib/content.mjs';
import {assets} from '@/lib/game.mjs';
import TradeReview from './TradeReview';

const headings=['Pilih lawan','Aset kamu','Aset lawan','Konfirmasi'];
const safeNumber=(value:string,max:number)=>Math.max(0,Math.min(max,Math.floor(Number(value)||0)));
export default function TradeWizard({game,from,trade,onChange,onSubmit,canSubmit,busy,mode='offer'}:{
 game:any;from:number;trade:any;onChange:(value:any)=>void;onSubmit:(value:any)=>void;canSubmit:boolean;busy:boolean;mode?:'offer'|'counter';
}){
 const [step,setStep]=useState(mode==='counter'?1:0);const [query,setQuery]=useState('');const [hint,setHint]=useState('');
 const opponents=game.players.filter((p:any)=>p.id!==from&&!p.out);
 const to=opponents.some((p:any)=>p.id===trade.to)?trade.to:opponents[0]?.id;
 const owner=step===1?from:to;
 const give=step===1;
 const chosen=trade[give?'give':'take'] as number[];
 const rows=assets(game,owner).filter((t:any)=>t.name.toLocaleLowerCase('id').includes(query.trim().toLocaleLowerCase('id')));
 const hasValue=trade.give.length+trade.take.length+trade.giveCash+trade.takeCash+trade.giveCards+trade.takeCards>0;
 const invalid=trade.giveCash>game.players[from].cash||trade.takeCash>(game.players[to]?.cash??0)||trade.giveCards>game.players[from].cards.length||trade.takeCards>(game.players[to]?.cards.length??0);
 useEffect(()=>{setQuery('');setHint('')},[step]);
 function update(patch:any){onChange({...trade,...patch});setHint('')}
 function chooseOpponent(id:number){if(id===to)return;onChange({...trade,to:id,take:[],takeCash:0,takeCards:0});setHint('')}
 function stepNext(){if(step===0&&!opponents.length){setHint('Belum ada lawan yang bisa diajak barter.');return}if(step===2&&!hasValue){setHint('Pilih setidaknya satu aset, uang, atau kartu sebelum melanjutkan.');return}setStep(v=>Math.min(3,v+1))}
 function selectAsset(id:number){const key=give?'give':'take';update({[key]:chosen.includes(id)?chosen.filter(n=>n!==id):[...chosen,id]})}
 const maxCash=game.players[owner]?.cash??0,maxCards=game.players[owner]?.cards.length??0;
 return <section className="trade-simple" aria-label={mode==='counter'?'Tawaran balik':'Buat barter'}>
  <div className="trade-simple-head"><h3>{mode==='counter'?'Tawaran balik':'Buat barter'}</h3><span>{step+1} / 4</span></div>
  <nav aria-label="Langkah barter" className="trade-steps">{headings.map((label,i)=><button key={label} type="button" aria-current={step===i?'step':undefined} className={i===step?'active':i<step?'done':''} onClick={()=>{if(i<=step&&(mode!=='counter'||i>0))setStep(i)}}><span>{i<step?<Check size={13}/>:i+1}</span><small>{label}</small></button>)}</nav>
  {step===0&&<><p className="simple-help">Pilih satu pemain untuk diajak bertukar properti, uang, atau kartu.</p><div className="trade-players">{opponents.map((p:any)=><button type="button" className={to===p.id?'active':''} aria-pressed={to===p.id} key={p.id} onClick={()=>chooseOpponent(p.id)}><Users size={18}/><span><b>{p.name}</b><small>{money(p.cash)}</small></span>{to===p.id&&<Check size={17}/>}</button>)}</div></>}
  {(step===1||step===2)&&<><div className="trade-step-caption"><b>{give?`Kamu memberi · ${game.players[from].name}`:`Kamu menerima · ${game.players[to]?.name}`}</b><small>Ketuk properti untuk memilih atau membatalkan pilihan.</small></div>
   <label className="simple-search"><Search size={16}/><input aria-label="Cari properti barter" type="search" placeholder="Cari properti..." value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="trade-property-list">{rows.map((t:any)=>{
    const developed=t.group>=0&&GROUPS[t.group].ids.some(id=>game.assets[id]?.level>0);
    const selected=chosen.includes(t.id);
    return <button type="button" key={t.id} aria-pressed={selected} className={selected?'chosen':''} disabled={developed&&!selected} title={developed?'Jual semua bangunan satu kelompok sebelum barter':''} onClick={()=>selectAsset(t.id)}>
     <i style={{background:t.color}}/><span><b>{t.name}</b><small>{developed?'Ada bangunan · tidak bisa ditukar':game.assets[t.id].mortgaged?'Digadai':money(t.price)}</small></span><span className="trade-checkbox">{selected&&<Check size={14}/>}</span>
    </button>})}</div>
   {!rows.length&&<p className="simple-empty">Tidak ada properti yang cocok. Kamu tetap bisa menukar uang atau kartu.</p>}
   <div className="trade-additions"><label><Coins size={15}/> Uang (maks. {money(maxCash)})<input type="number" inputMode="numeric" min={0} max={maxCash} step={100} value={trade[give?'giveCash':'takeCash']} onChange={e=>update({[give?'giveCash':'takeCash']:safeNumber(e.target.value,maxCash)})}/></label>
    <label>Kartu bebas penjara (maks. {maxCards})<input type="number" inputMode="numeric" min={0} max={maxCards} value={trade[give?'giveCards':'takeCards']} onChange={e=>update({[give?'giveCards':'takeCards']:safeNumber(e.target.value,maxCards)})}/></label></div>
   <p className="trade-selection">{chosen.length} properti dipilih · {money(trade[give?'giveCash':'takeCash'])} · {trade[give?'giveCards':'takeCards']} kartu</p>
  </>}
  {step===3&&<><p className="simple-help">Pastikan penawaran sudah sesuai. Pemain lain bisa menerima, menolak, atau mengajukan tawaran balik.</p><TradeReview game={game} from={from} to={to} trade={trade}/>{!hasValue&&<p className="simple-empty">Pilih sesuatu yang ingin ditukar terlebih dahulu.</p>}{invalid&&<p className="trade-warning">Uang atau kartu yang dipilih melebihi kepemilikan pemain.</p>}</>}
  {hint&&<p className="trade-warning" role="alert">{hint}</p>}
  <div className="trade-simple-footer">{(mode==='counter'?step>1:step>0)&&<button type="button" className="secondary" onClick={()=>setStep(v=>Math.max(mode==='counter'?1:0,v-1))}><ArrowLeft size={16}/>Kembali</button>}
   {step<3?<button type="button" className="primary" onClick={stepNext}>Lanjut<ArrowRight size={17}/></button>:<button type="button" className="primary" disabled={!canSubmit||busy||!hasValue||invalid||!opponents.length} onClick={()=>onSubmit({...trade,to})}>{mode==='counter'?'Kirim tawaran balik':'Ajukan barter'}<ArrowRight size={17}/></button>}
  </div>
 </section>;
}

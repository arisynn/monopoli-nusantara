'use client';
import {useMemo,useState} from 'react';
import {ChevronRight,Search} from 'lucide-react';
import {GROUPS,money} from '@/lib/content.mjs';
import {assets,canManage,managementError,worth,redemption} from '@/lib/game.mjs';

type Filter='semua'|'bangun'|'gadai'|'lengkap';
const filters:[Filter,string][]=[['semua','Semua'],['bangun','Bisa bangun'],['gadai','Digadai'],['lengkap','Set lengkap']];
export default function AssetManager({game,ownerId,controllerId,busy,onOwnerChange,onOpen,onAction,onAllTiles}:{
 game:any;ownerId:number;controllerId:number;busy:boolean;onOwnerChange:(id:number)=>void;onOpen:(id:number)=>void;onAction:(id:number,type:string)=>void;onAllTiles:()=>void;
}){
 const [query,setQuery]=useState('');const [filter,setFilter]=useState<Filter>('semua');
 const owned=assets(game,ownerId);
 const manageable=ownerId===controllerId&&canManage(game,controllerId)&&(game.schemaVersion!==1||['roll','end','jail','debt'].includes(game.phase))&&game.players[controllerId]?.controller==='human';
 const rows=useMemo(()=>owned.filter((t:any)=>{
  const prop=game.assets[t.id];const complete=t.group>=0&&GROUPS[t.group].ids.every(id=>game.assets[id]?.owner===ownerId);
  if(!t.name.toLocaleLowerCase('id').includes(query.trim().toLocaleLowerCase('id')))return false;
  if(filter==='gadai'&&!prop.mortgaged)return false;
  if(filter==='lengkap'&&!complete)return false;
  if(filter==='bangun'&&(['debt','auction'].includes(game.phase)||!manageable||ownerId!==controllerId||!!managementError(game,ownerId,t.id,'BUILD')))return false;
  return true;
 }),[owned,game,ownerId,controllerId,query,filter,manageable]);
 return <section className="asset-simple" aria-label="Kelola aset">
  <div className="section-heading"><h2>Kelola aset</h2></div>
  <label className="field-label">Aset pemain<select value={ownerId} onChange={e=>onOwnerChange(Number(e.target.value))}>{game.players.map((p:any)=><option value={p.id} key={p.id}>{p.name} · {money(p.cash)}</option>)}</select></label>

  <label className="simple-search"><Search size={16}/><input type="search" aria-label="Cari aset" placeholder="Cari kota atau properti..." value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="simple-filters" aria-label="Saring daftar aset">{filters.map(([key,label])=><button type="button" aria-pressed={filter===key} className={filter===key?'active':''} key={key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
  <div className="asset-simple-count">{rows.length} dari {owned.length} properti {manageable?'':'· hanya lihat'}</div>
  <div className="asset-simple-list">{rows.map((t:any)=>{
   const prop=game.assets[t.id],complete=t.group>=0&&GROUPS[t.group].ids.every(id=>game.assets[id]?.owner===ownerId);
   const type=game.phase==='debt'?(prop.level>0&&!managementError(game,ownerId,t.id,'SELL')?'SELL':!managementError(game,ownerId,t.id,'MORTGAGE')?'MORTGAGE':null):prop.mortgaged?(!managementError(game,ownerId,t.id,'REDEEM')&&!(game.phase==='auction'&&game.auction.highest===ownerId&&game.players[ownerId].cash-redemption(t.id)<game.auction.amount)?'REDEEM':null):(game.phase!=='auction'&&!managementError(game,ownerId,t.id,'BUILD')?'BUILD':null);
   const label=type==='BUILD'?(prop.level===4?'Hotel':`Rumah ${prop.level+1}`):type==='SELL'?'Jual bangunan':type==='MORTGAGE'?'Gadai':'Tebus';
   const cost=type==='BUILD'?t.build:type==='SELL'?t.build/2:type==='MORTGAGE'?t.mortgage:game.schemaVersion===1?Math.ceil(t.mortgage*1.1):redemption(t.id);
   const status=prop.mortgaged?'Digadai':prop.level===5?'Hotel':prop.level?`${prop.level} rumah`:complete?'Set lengkap':'Tanpa bangunan';
   return <div key={t.id} className="asset-simple-item"><span className="asset-color" style={{background:t.color}}/>
    <button className="asset-simple-detail" type="button" onClick={()=>onOpen(t.id)} aria-label={`Lihat pengelolaan ${t.name}`}><b>{t.name}</b><small>{t.group>=0?GROUPS[t.group].name:t.type==='station'?'Stasiun':'Utilitas'} · {status}{complete&&!prop.mortgaged&&prop.level>0?' · Set lengkap':''}</small></button>
    {manageable&&type?<button type="button" className="asset-simple-action" disabled={busy} onClick={()=>onAction(t.id,type)}><span>{label}<small>{['SELL','MORTGAGE'].includes(type)?'+':''}{money(cost)}</small></span></button>:<button type="button" className="asset-simple-more" onClick={()=>onOpen(t.id)} aria-label={`Detail ${t.name}`}><ChevronRight size={18}/></button>}
   </div>})}</div>
  {!rows.length&&<p className="simple-empty">{owned.length?'Tidak ada aset yang sesuai. Coba filter lain.':'Belum punya properti. Beli kota saat mendarat di sana.'}</p>}
  {!manageable&&<p className="simple-hint">{ownerId!==controllerId||game.players[ownerId]?.controller!=='human'?'Aset pemain ini hanya dapat dilihat.':'Selesaikan keputusan aktif sebelum mengelola aset.'}</p>}
  <details className="asset-secondary"><summary>Kekayaan & stok bank</summary><div className="asset-stats"><div><span>Nilai kekayaan</span><b>{money(worth(game,ownerId))}</b></div><div><span>Stok bank</span><b>{game.bank.houses} rumah · {game.bank.hotels} hotel</b></div></div></details>
  <button className="secondary" onClick={onAllTiles}>Lihat semua petak<ChevronRight size={17}/></button>
 </section>;
}

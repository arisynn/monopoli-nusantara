'use client';
import NusaText from './NusaText';
import {useState} from 'react';
import {Check,Search} from 'lucide-react';
import {filterChoices,toggleSelection} from '@/lib/compact-ui.mjs';
export type Choice={id:number;label:string;detail?:string;color?:string;disabled?:boolean};
export type PickerRequest={title:string;items:Choice[];selected:number[];multiple?:boolean;onChange:(ids:number[])=>void};
/** Replaces the current dialog view; never creates a second modal or scroll area. */
export default function SelectionView({title,items,selected,multiple=false,onChange,onDone}:{title:string;items:Choice[];selected:number[];multiple?:boolean;onChange:(ids:number[])=>void;onDone:(ids:number[])=>void}){
 const [query,setQuery]=useState(''),[selectedOnly,setSelectedOnly]=useState(false);
 const rows=filterChoices(items,query,selectedOnly,selected);
 function choose(item:Choice){if(item.disabled)return;const next=toggleSelection(selected,item.id,multiple);onChange(next);if(!multiple)onDone(next)}
 return <section className="selection-view" aria-label={title}>
  <div className="selection-tools"><h2>{title}</h2><label className="simple-search"><Search size={17}/><input type="search" aria-label={`Cari ${title.toLowerCase()}`} placeholder="Cari nama atau status…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   {multiple&&<div className="selection-count"><span role="status">{selected.length} dipilih</span><button type="button" aria-pressed={selectedOnly} onClick={()=>setSelectedOnly(v=>!v)}>{selectedOnly?'Lihat semua':'Lihat pilihan'}</button></div>}
  </div>
  <div className="selection-rows">{rows.map((item:Choice)=><button type="button" key={item.id} className={selected.includes(item.id)?'chosen':''} aria-pressed={selected.includes(item.id)} disabled={item.disabled} onClick={()=>choose(item)}><i style={{background:item.color||'var(--gold)'}}/><span><b>{item.label}</b>{item.detail&&<small><NusaText text={item.detail}/></small>}</span>{selected.includes(item.id)&&<Check size={18}/>}</button>)}</div>
  {!rows.length&&<p className="simple-empty">Tidak ada pilihan yang cocok.</p>}
  {multiple&&<footer className="selection-footer"><span>{selected.length} properti</span><button type="button" className="primary" onClick={()=>onDone(selected)}>Selesai<Check size={17}/></button></footer>}
 </section>;
}

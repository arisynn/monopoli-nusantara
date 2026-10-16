'use client';
import {Check} from 'lucide-react';
import {TOKENS} from '@/lib/pawns.mjs';
import {PawnArt} from './AssetArt';
/** Replaces the setup/dialog view, without another backdrop or hidden confirmation. */
export default function PawnPicker({selected,occupied={},swap=false,onSelect}:{selected:number;occupied?:Record<number,string>;swap?:boolean;onSelect:(id:number)=>void}){
 return <section className="pawn-picker"><h2>Pilih pion</h2><p className="fine">{swap?'Pion terpakai ditukar otomatis.':'Enam bentuk · warna pemain tetap sama.'}</p><div className="pawn-options">{TOKENS.map(token=><button type="button" key={token.id} disabled={!swap&&!!occupied[token.id]} aria-pressed={selected===token.id} onClick={()=>onSelect(token.id)}><PawnArt id={token.id}/><span>{token.name}</span>{selected===token.id&&<Check className="pawn-choice-check" size={16}/>} {occupied[token.id]&&<small>{occupied[token.id]}</small>}</button>)}</div></section>;
}

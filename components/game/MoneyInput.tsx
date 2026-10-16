'use client';
import {useEffect,useRef,useState} from 'react';
import {nusaInput,parseNusa} from '@/lib/currency.mjs';
/** Decimal text is UI-only; commands always receive exact integer base units. */
export default function MoneyInput({units,onUnitsChange,min=0,max=Number.MAX_SAFE_INTEGER,step=1,label,disabled=false}:{units:number;onUnitsChange:(units:number)=>void;min?:number;max?:number;step?:number;label:string;disabled?:boolean}){
 const [raw,setRaw]=useState(()=>nusaInput(units)),published=useRef(units);
 useEffect(()=>{if(!Object.is(units,published.current)){published.current=units;setRaw(nusaInput(units))}},[units]);
 const invalid=!Number.isSafeInteger(units)||units<min||units>max||(units-min)%step!==0;
 return <input type="number" inputMode="decimal" aria-label={label} aria-invalid={invalid||undefined} min={nusaInput(min)} max={nusaInput(max)} step={step/10} disabled={disabled} value={raw} onChange={e=>{setRaw(e.target.value);const value=parseNusa(e.target.value)??NaN;published.current=value;onUnitsChange(value)}}/>;
}

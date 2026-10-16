'use client';
import {History,ChevronRight} from 'lucide-react';
import NusaText from './NusaText';
import {nusaText} from '@/lib/currency.mjs';
import type {PublicLogEvent} from '@/lib/presentation-types';
export default function TableActivity({events,onOpen}:{events:PublicLogEvent[];onOpen:()=>void}){
 const event=events.find(e=>!e.audience||e.audience==='public');
 return <button type="button" className="table-activity" onClick={onOpen} aria-label="Buka riwayat aktivitas"><History size={15}/><span><NusaText text={event?nusaText(event.text):'Setiap langkah akan tercatat di sini.'}/></span><ChevronRight size={15}/></button>;
}

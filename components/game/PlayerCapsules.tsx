'use client';
import NusaText from './NusaText';
import {transactionDeltas,financeLabels} from '@/lib/finance.mjs';
import type {FinanceTransaction} from '@/lib/presentation-types';
import type {CSSProperties} from 'react';
import {Bot,LockKeyhole,Building2} from 'lucide-react';
import {PawnArt} from './AssetArt';
import {pawnFor} from '@/lib/pawns.mjs';
import {PAWNS,money} from '@/lib/content.mjs';
import {assets} from '@/lib/game.mjs';
import {playerColumns} from '@/lib/dice-timing.mjs';
export default function PlayerCapsules({state,actor,connections,transactions=[],onSelect}:{state:any;actor:number;connections?:any[];transactions?:(FinanceTransaction&{id:string})[];onSelect:(id:number)=>void}){
 return <div className="players-strip compact-capsules" style={{'--capsule-columns':playerColumns(state.players.length)} as CSSProperties} aria-label="Pemain">{state.players.map((p:any)=><button type="button" key={p.id} aria-current={p.id===actor?'true':undefined} aria-label={`${p.name}, ${money(p.cash)}${p.id===actor?', giliran aktif':''}${p.out?', bangkrut':p.inJail?', penjara':''}`} className={`player-card ${p.id===actor?'active':''} ${p.out?'eliminated':''}`} style={{'--player':PAWNS[p.id].color} as CSSProperties} onClick={()=>onSelect(p.id)}>{transactions.flatMap(t=>transactionDeltas(t).filter(d=>d.player===p.id).map(d=><span key={`${t.id}:${p.id}`} className={`capsule-transaction ${d.amount>0?'is-income':'is-expense'}`} title={financeLabels[t.kind]||'Transaksi'} aria-label={`${d.amount>0?'Masuk':'Keluar'} ${money(Math.abs(d.amount))}`}><NusaText text={`${d.amount>0?'+':'−'} ${money(Math.abs(d.amount))}`}/></span>))}<span className="hud-pawn" style={{borderColor:PAWNS[p.id].color}}><PawnArt id={pawnFor(p)}/><small style={{background:PAWNS[p.id].color}}>{p.id+1}</small></span><span className="player-details"><span className="player-name" title={p.name}><span className="capsule-name">{p.name}</span>{connections&&<i className={`connection-dot ${connections[p.id]?.connected?'is-online':'is-offline'}`} title={connections[p.id]?.connected?'Online':'Offline'} aria-label={connections[p.id]?.connected?'Online':'Offline'}/>} {p.controller==='bot'&&<Bot size={11}/>} {p.inJail&&!p.out&&<LockKeyhole size={11}/>} {p.out&&<small>Keluar</small>}</span><span className="capsule-cash"><strong title={money(p.cash)}><NusaText text={money(p.cash)}/></strong><span className="property-count"><Building2 size={11}/>{assets(state,p.id).length}</span></span></span></button>)}</div>;
}

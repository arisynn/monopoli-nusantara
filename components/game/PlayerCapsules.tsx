'use client';
import type {CSSProperties} from 'react';
import {Bot,LockKeyhole,Building2} from 'lucide-react';
import {PAWNS,money} from '@/lib/content.mjs';
import {assets} from '@/lib/game.mjs';
import {playerColumns} from '@/lib/dice-timing.mjs';
export default function PlayerCapsules({state,actor,onSelect}:{state:any;actor:number;onSelect:(id:number)=>void}){
 return <div className="players-strip compact-capsules" style={{'--capsule-columns':playerColumns(state.players.length)} as CSSProperties} aria-label="Pemain">{state.players.map((p:any)=><button type="button" key={p.id} aria-current={p.id===actor?'true':undefined} aria-label={`${p.name}, ${money(p.cash)}${p.id===actor?', giliran aktif':''}${p.out?', bangkrut':p.inJail?', penjara':''}`} className={`player-card ${p.id===actor?'active':''} ${p.out?'eliminated':''}`} style={{'--player':PAWNS[p.id].color} as CSSProperties} onClick={()=>onSelect(p.id)}><span className="hud-pawn" style={{background:PAWNS[p.id].color}}>{p.id+1}</span><span className="player-details"><span className="player-name" title={p.name}><span className="capsule-name">{p.name}</span>{p.controller==='bot'&&<Bot size={11}/>} {p.inJail&&!p.out&&<LockKeyhole size={11}/>} {p.out&&<small>Keluar</small>}</span><span className="capsule-cash"><strong>{money(p.cash)}</strong><span className="property-count"><Building2 size={11}/>{assets(state,p.id).length}</span></span></span></button>)}</div>;
}

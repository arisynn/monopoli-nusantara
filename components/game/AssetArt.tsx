'use client';
import {TOKENS,validPawn} from '@/lib/pawns.mjs';
export function PawnArt({id=0,className=''}:{id?:number,className?:string}){
 const token=TOKENS[validPawn(id)?id:0];
 return <img src={token.src} width={64} height={64} alt={token.name} draggable={false} decoding="async" className={`pawn-art ${className}`}/>;
}
export function RegionArt({group=0,className=''}:{group?:number,className?:string}){
 const g=Math.max(0,group);
 return <div aria-hidden="true" className={`region-art ${className}`} style={{backgroundPosition:`${g%4*100/3}% ${g>3?100:0}%`}}/>;
}
export function CardArt({deck='chance'}:{deck?:string}){return <img src={`/assets/board/${deck==='community'?'community':'chance'}.svg`} width={72} height={72} className={`deck-art ${deck}`} alt="" aria-hidden="true"/>}

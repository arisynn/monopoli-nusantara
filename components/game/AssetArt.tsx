'use client';
import {PAWNS} from '@/lib/content.mjs';
export function PawnArt({id=0,className=''}:{id?:number,className?:string}){
 const variant=id%4;
 return <span role="img" aria-label={PAWNS[id]?.name||'Pion'} className={`pawn-art ${className}`} style={{backgroundPosition:`${variant%2?100:0}% ${variant>1?100:0}%`,filter:id>=4?'hue-rotate(320deg) saturate(1.2)':undefined}}/>;
}
export function RegionArt({group=0,className=''}:{group?:number,className?:string}){
 const g=Math.max(0,group);
 return <div aria-hidden="true" className={`region-art ${className}`} style={{backgroundPosition:`${g%4*100/3}% ${g>3?100:0}%`}}/>;
}
export function CardArt({deck='chance'}:{deck?:string}){return <div className={`deck-art ${deck}`} aria-hidden="true"/>}

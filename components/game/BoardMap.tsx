import {memo} from 'react';
import {BOARD,PAWNS,money} from '@/lib/content.mjs';
import {pawnPlacement} from '@/lib/pawn-layout.mjs';
import {TOKENS,pawnFor} from '@/lib/pawns.mjs';
import {SvgNusaText} from './NusaText';
import {tileRect} from '@/lib/board-camera.mjs';

function tileArt(type:string,id=0){return `/assets/board/${type==='utility'?(id===12?'electric':'water'):type}.svg`}
function TileArt({type,id=0,size=58}:{type:string;id?:number;size?:number}){return <image href={tileArt(type,id)} x={-size/2} y={-size/2} width={size} height={size} preserveAspectRatio="xMidYMid meet"/>}
function DeckFace({deck}:{deck:'chance'|'community'}){
 const chance=deck==='chance';
 return <g><rect x="-87" y="-58" width="174" height="116" rx="9" fill={chance?'#f7e9c7':'#d9e8de'} stroke={chance?'#ad8541':'#568477'} strokeWidth="2"/><rect x="-81" y="-52" width="162" height="104" rx="5" fill="none" stroke={chance?'#ceb476':'#91b6a5'}/><g transform="translate(-41 0)"><TileArt type={deck} size={76}/></g><text x="35" y="-6" fontSize="10" fontWeight="bold" letterSpacing=".8">{chance?'KESEMPATAN':'DANA'}</text>{!chance&&<text x="35" y="9" fontSize="10" fontWeight="bold" letterSpacing=".8">UMUM</text>}<path d="M7 24H63" stroke={chance?'#b79647':'#639583'}/><text x="35" y="39" fontSize="7" letterSpacing="1">NUSANTARA</text></g>;
}
function lines(name:string){
 const wraps:Record<string,string[]>={YOGYAKARTA:['YOGYA-','KARTA'],BANYUWANGI:['BANYU-','WANGI'],BANJARMASIN:['BANJAR-','MASIN'],PENGHASILAN:['PENG-','HASILAN'],KESEMPATAN:['KESEM-','PATAN']};
 return name.toUpperCase().split(' ').flatMap(word=>wraps[word]||[word]);
}
export const BoardArtwork=memo(function BoardArtwork({state,selected}:{state:any,selected:number}){
 return <g fontFamily="Arial, sans-serif" fill="#173d3b">
  <rect width="1000" height="1000" fill="#dcebdd"/>
  <rect x="153" y="153" width="694" height="694" rx="2" fill="#eaf2e6" stroke="#96b4a4" strokeWidth="1.5"/>
  <g textAnchor="middle" pointerEvents="none">
   <path d="m500 265 16 29 31 7-31 7-16 29-16-29-31-7 31-7Z" fill="#699c89"/>
   <text x="500" y="398" fontSize="16" letterSpacing="7">MONOPOLI</text>
   <text x="500" y="462" fontFamily="Georgia, serif" fontWeight="bold" fontSize="62">NUSANTARA</text>
   <path d="M350 489H650" stroke="#93b29f"/>
   <text x="500" y="520" fontSize="13" letterSpacing="3">JELAJAHI · MILIKI · MENANGKAN</text>
   <g transform="translate(367 650) rotate(-9)"><DeckFace deck="community"/></g>
   <g transform="translate(633 650) rotate(9)"><DeckFace deck="chance"/></g>
   <text x="500" y="794" fontSize="11" letterSpacing="2" fill="#648473">40 PETAK · SATU PERJALANAN</text>
  </g>
  {BOARD.map(tile=>{
   const r=tileRect(tile.id),corner=tile.id%10===0,w=corner?140:80,h=140,a=state?.assets?.[tile.id],owner=a?.owner;
   const label=`${tile.id}. ${tile.name}${tile.price?', '+money(tile.price):''}${owner!=null?', milik '+state.players[owner]?.name:''}${a?.mortgaged?', digadaikan':''}${a?.level?', '+(a.level===5?'hotel':a.level+' rumah'):''}`;
   return <g key={tile.id} data-tile={tile.id} role="button" tabIndex={0} aria-label={label} className="map-tile" transform={`translate(${r.x+r.width/2} ${r.y+r.height/2}) rotate(${r.angle}) translate(${-w/2} -70)`}>
    <title>{label}</title><rect width={w} height={h} fill={corner?'#c7dfcc':'#e2eddd'} stroke="#24463f" strokeWidth="2"/>
    {tile.type==='city'&&<rect x="1" y="1" width={w-2} height="23" fill={tile.color} stroke="#24463f" strokeWidth="1.5"/>}
    {tile.type==='city'&&<g aria-hidden="true" opacity=".8"><defs><clipPath id={`region-${tile.id}`}><rect x="6" y="72" width="68" height="35" rx="3"/></clipPath></defs><g clipPath={`url(#region-${tile.id})`}><svg x="6" y="72" width="68" height="35" overflow="hidden" viewBox={`${(tile.group%4)*443.5} ${Math.floor(tile.group/4)*443.5+70} 443.5 285`} preserveAspectRatio="xMidYMid slice"><image href="/assets/region-atlas.webp" width="1774" height="887"/></svg></g></g>}
    {corner?<><text x="70" y="28" textAnchor="middle" fontSize="14" fontWeight="bold">{tile.name.toUpperCase()}</text><g transform="translate(70 60)" color={tile.type==='start'?'#b54736':'#284e44'}><TileArt type={tile.type} size={64}/></g><text x="70" y="128" textAnchor="middle" fontSize="10" fontWeight="bold"><SvgNusaText text={tile.id===0?'TERIMA '+money(2000):tile.id===10?'SINGGAH / DITAHAN':tile.id===20?'ISTIRAHAT':'LANGSUNG KE PENJARA'}/></text></>:<>
     <text x="40" y={tile.type==='city'?35:17} textAnchor="middle" fontSize="11.5" fontWeight="bold">{lines(tile.name).map((line,i)=><tspan key={i} x="40" dy={i?(tile.type==='city'?11:13):0} fontSize={line.length>8?10:11.5}>{line}</tspan>)}</text>
     {tile.type!=='city'&&<g transform="translate(40 69)"><TileArt type={tile.type} id={tile.id}/></g>}
     <text x="40" y="129" textAnchor="middle" fontSize={tile.price||tile.type==='tax'?11:8.5} fontWeight="bold"><SvgNusaText text={tile.price?money(tile.price):tile.type==='tax'?money(tile.tax):'AMBIL KARTU'}/></text>
    </>}
    {owner!=null&&<g><path d={`M3 118H${w-3}`} stroke={PAWNS[owner].color} strokeWidth="5"/><rect x="3" y="3" width="16" height="16" rx="3" fill="#173d3b"/><text x="11" y="15" fontSize="11" fill="#fff" textAnchor="middle" fontWeight="bold">{owner+1}</text></g>}
    {a?.level>0&&<g transform="translate(23 5)" fill={a.level===5?'#a63635':'#205a46'} stroke="#f4f4df" strokeWidth="1">{a.level===5?<><rect x="9" y="1" width="25" height="15"/><text x="21.5" y="13" stroke="none" fill="#fff" fontSize="10" textAnchor="middle">H</text></>:Array.from({length:a.level},(_,i)=><path key={i} transform={`translate(${i*12} 0)`} d="M0 6 5 1 10 6V15H0Z"/>)}</g>}
    {a?.mortgaged&&<g><path d={`M5 113 ${w-5} 28`} stroke="#6b4c68" strokeWidth="4" opacity=".6"/><rect x="5" y="100" width={w-10} height="14" rx="3" fill="#684861"/><text x={w/2} y="110" fontSize="9" fontWeight="bold" textAnchor="middle" fill="#fff">GADAI</text></g>}
    <rect className="tile-focus" x="4" y="4" width={w-8} height={h-8} fill="none" stroke={selected===tile.id?'#ae5629':'transparent'} strokeWidth="4" pointerEvents="none"/>
   </g>
  })}
  <rect x="1" y="1" width="998" height="998" fill="none" stroke="#24463f" strokeWidth="2" pointerEvents="none"/>
 </g>
});
export function BoardTokens({state}:{state:any}){
 return <g className="map-tokens" pointerEvents="none" fontFamily="Arial, sans-serif">{[...(state?.players||[])].sort((a:any,b:any)=>Number(a.id===state.turn)-Number(b.id===state.turn)).map((p:any)=>{
  if(p.out)return null;const point=pawnPlacement(state,p.id),token=TOKENS[pawnFor(p)],color=PAWNS[p.id].color;
  return <g key={p.id} data-pawn={p.id} data-token={token.id} transform={`translate(${point.x} ${point.y})`} role="img" aria-label={`${p.name}, ${token.name}, ${BOARD[p.pos].name}`}>
   <title>{p.name} · {token.name}</title>
   {p.id===state.turn&&<circle className="pawn-active-ring" r={point.size/2+2} fill="#fff5dccc" stroke={color} strokeWidth="2"/>}
   <g className={p.id===state.turn?'pawn-figure pawn-is-active':'pawn-figure'}>
    <ellipse cy={point.size*.39} rx={point.size*.44} ry={point.size*.13} fill={color} stroke="#173d46" strokeWidth="1"/>
    <image href={token.src} x={-point.size/2} y={-point.size/2} width={point.size} height={point.size} preserveAspectRatio="xMidYMid meet"/>
    <circle cx="0" cy={point.size*.3} r={point.size*.18} fill={color} stroke="#173d46" strokeWidth=".8"/>
    <text x="0" y={point.size*.3+point.size*.075} fontSize={point.size*.23} fontWeight="bold" fill="#173d46" textAnchor="middle">{p.id+1}</text>
   </g>
  </g>
 })}</g>
}

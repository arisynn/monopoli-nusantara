import {memo} from 'react';
import {BOARD,PAWNS,money} from '@/lib/content.mjs';
import {tileRect,tokenPoint} from '@/lib/board-camera.mjs';

function Icon({type,id=0}:{type:string,id?:number}){
 const common={fill:'none',stroke:'currentColor',strokeWidth:2.5,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
 return <g {...common}>{type==='station'?<><rect x="-13" y="-15" width="26" height="26" rx="5"/><path d="M-8-8H8V0H-8ZM-8 15l-5 5m21-5 5 5M-7 7h.1M7 7h.1"/></>:type==='utility'?(id===12?<path d="M3-20-12 3H0L-3 20 13-4H1Z"/>:<path d="M0-20C-3-13-14-2-14 7a14 14 0 0 0 28 0C14-2 3-13 0-20ZM-8 6q0 8 8 9"/>):type==='community'?<><rect x="-17" y="-9" width="34" height="25" rx="3"/><path d="M-17-1H17M-7-9v-8H7v8M0-5v9M-4 0H4"/></>:type==='chance'?<><path d="M-10-10c0-15 25-15 25 0 0 9-14 9-14 18"/><circle cx="1" cy="17" r="1.7" fill="currentColor"/></>:type==='tax'?<><path d="M0-20 17-8 0 18-17-8ZM-17-8H17M-7-8 0 18 7-8M-7-8 0-20 7-8"/></>:type==='jail'||type==='gojail'?<><rect x="-18" y="-18" width="36" height="36" rx="2"/><path d="M-10-18V18M0-18V18M10-18V18"/>{type==='gojail'&&<path d="M-23 0h46m-5-5 5 5-5 5" strokeWidth="4"/>}</>:type==='parking'?<><rect x="-20" y="-10" width="40" height="23" rx="5"/><path d="M-13-10-8-19H8l5 9M-12 2h.1M12 2h.1M-13 13v5M13 13v5"/></>:<path d="M22 0H-22m12-13L-23 0l13 13" strokeWidth="5"/>}</g>
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
   <g transform="translate(367 650) rotate(-12)"><rect x="-80" y="-53" width="160" height="106" rx="8" fill="#d7e8df" stroke="#639583" strokeWidth="2"/><g transform="translate(0 -10)" color="#427a68"><Icon type="community"/></g><text y="34" fontSize="12" fontWeight="bold" letterSpacing="1">DANA UMUM</text></g>
   <g transform="translate(633 650) rotate(12)"><rect x="-80" y="-53" width="160" height="106" rx="8" fill="#f2e5bc" stroke="#b79647" strokeWidth="2"/><g transform="translate(0 -10)" color="#94702a"><Icon type="chance"/></g><text y="34" fontSize="12" fontWeight="bold" letterSpacing="1">KESEMPATAN</text></g>
   <text x="500" y="794" fontSize="11" letterSpacing="2" fill="#648473">40 PETAK · SATU PERJALANAN</text>
  </g>
  {BOARD.map(tile=>{
   const r=tileRect(tile.id),corner=tile.id%10===0,w=corner?140:80,h=140,a=state?.assets?.[tile.id],owner=a?.owner;
   const label=`${tile.id}. ${tile.name}${tile.price?', '+money(tile.price):''}${owner!=null?', milik '+state.players[owner]?.name:''}${a?.mortgaged?', digadaikan':''}${a?.level?', '+(a.level===5?'hotel':a.level+' rumah'):''}`;
   return <g key={tile.id} data-tile={tile.id} role="button" tabIndex={0} aria-label={label} className="map-tile" transform={`translate(${r.x+r.width/2} ${r.y+r.height/2}) rotate(${r.angle}) translate(${-w/2} -70)`}>
    <title>{label}</title><rect width={w} height={h} fill={corner?'#c7dfcc':'#e2eddd'} stroke="#24463f" strokeWidth="2"/>
    {tile.type==='city'&&<rect x="1" y="1" width={w-2} height="23" fill={tile.color} stroke="#24463f" strokeWidth="1.5"/>}
    {corner?<><text x="70" y="28" textAnchor="middle" fontSize="14" fontWeight="bold">{tile.name.toUpperCase()}</text><g transform="translate(70 60)" color={tile.type==='start'?'#b54736':'#284e44'}><Icon type={tile.type}/></g><text x="70" y="128" textAnchor="middle" fontSize="10" fontWeight="bold">{tile.id===0?'TERIMA Rp2.000':tile.id===10?'SINGGAH / DITAHAN':tile.id===20?'ISTIRAHAT':'LANGSUNG KE PENJARA'}</text></>:<>
     <text x="40" y={tile.type==='city'?43:17} textAnchor="middle" fontSize="11.5" fontWeight="bold">{lines(tile.name).map((line,i)=><tspan key={i} x="40" dy={i?13:0} fontSize={line.length>8?10:11.5}>{line}</tspan>)}</text>
     {tile.type!=='city'&&<g transform="translate(40 62) scale(.72)"><Icon type={tile.type} id={tile.id}/></g>}
     <text x="40" y="129" textAnchor="middle" fontSize={tile.price||tile.type==='tax'?11:8.5} fontWeight="bold">{tile.price?money(tile.price):tile.type==='tax'?money(tile.tax):'AMBIL KARTU'}</text>
    </>}
    {owner!=null&&<g><path d={`M3 118H${w-3}`} stroke={PAWNS[owner].color} strokeWidth="5"/><rect x="3" y="3" width="16" height="16" rx="3" fill="#173d3b"/><text x="11" y="15" fontSize="11" fill="#fff" textAnchor="middle" fontWeight="bold">{owner+1}</text></g>}
    {a?.level>0&&<g transform="translate(23 5)" fill={a.level===5?'#a63635':'#205a46'} stroke="#f4f4df" strokeWidth="1">{a.level===5?<><rect x="9" y="1" width="25" height="15"/><text x="21.5" y="13" stroke="none" fill="#fff" fontSize="10" textAnchor="middle">H</text></>:Array.from({length:a.level},(_,i)=><path key={i} transform={`translate(${i*12} 0)`} d="M0 6 5 1 10 6V15H0Z"/>)}</g>}
    {a?.mortgaged&&<g><path d={`M5 113 ${w-5} 28`} stroke="#6b4c68" strokeWidth="4" opacity=".6"/><rect x="5" y="65" width={w-10} height="18" rx="3" fill="#684861"/><text x={w/2} y="78" fontSize="10" fontWeight="bold" textAnchor="middle" fill="#fff">GADAI</text></g>}
    <rect className="tile-focus" x="4" y="4" width={w-8} height={h-8} fill="none" stroke={selected===tile.id?'#ae5629':'transparent'} strokeWidth="4" pointerEvents="none"/>
   </g>
  })}
  <rect x="1" y="1" width="998" height="998" fill="none" stroke="#24463f" strokeWidth="2" pointerEvents="none"/>
 </g>
});
export function BoardTokens({state}:{state:any}){
 return <g className="map-tokens" pointerEvents="none" fontFamily="Arial, sans-serif">{state?.players?.map((p:any)=>{
  const point=tokenPoint(p.pos,p.id);if(p.out)return null;
  return <g key={p.id} data-pawn={p.id} transform={`translate(${point.x} ${point.y})`} aria-label={`${p.name}, ${BOARD[p.pos].name}`}>
   {p.id===state.turn&&<circle r="14" fill="#fff" stroke="#173d3b" strokeWidth="2"/>}
   <circle r="10" fill={PAWNS[p.id].color} stroke="#173d3b" strokeWidth="2"/><text y="4" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#132b2c">{p.id+1}</text>
  </g>
 })}</g>
}

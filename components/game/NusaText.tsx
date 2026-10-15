/** Font contains only the original Nusa monogram. If unavailable, the literal N remains. */
const parts=(text:string|number)=>String(text).split(/(\bN (?:-?\d+(?:[.,]\d+)*|—))/g);
const amount=(part:string)=>/^N (?:-?\d|—)/.test(part);
export default function NusaText({text}:{text:string|number}){
 return <span className="nusa-text">{parts(text).map((part,i)=>amount(part)?<span key={i} className="nusa-unit"><span className="nusa-symbol" role="img" aria-label="Nusa">N</span>{' '}{part.slice(2)}</span>:part)}</span>;
}
export function SvgNusaText({text}:{text:string}){
 return <>{parts(text).map((part,i)=>amount(part)?<tspan key={i}><tspan className="nusa-symbol">N</tspan>{' '}{part.slice(2)}</tspan>:part)}</>;
}

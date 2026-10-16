'use client';
import {Dice5} from 'lucide-react';
import DiceRollFx from './DiceRollFx';
interface SettledDice {id:string;dice:number[];kind:string}
export interface DiceTrayProps {stage:'hidden'|'rolling'|'result';dice:number[];kind?:string;rollKey:string;last?:SettledDice|null;fast?:boolean;reduced:boolean;paused?:boolean}
/** Fixed UI tray. The presentation queue owns reveal/movement timing. */
export default function DiceTray({stage,dice,kind='movement',rollKey,last,fast=false,reduced,paused=false}:DiceTrayProps){
 const current=stage!=='hidden',values=current?dice:last?.dice;
 const label=stage==='rolling'?'Mengundi':stage==='result'?kind==='opening'?'Lempar awal':kind==='utility'?'Utilitas':'Hasil dadu':last?'Terakhir':'Dua dadu';
 return <div className={`dice-tray ${stage==='rolling'?'is-active':''}`} data-dice-stage={stage} aria-label="Area dadu">
  <small className="dice-tray-label">{label}</small>
  {values?<DiceRollFx stage={stage==='rolling'?'rolling':'result'} dice={values} kind={current?kind:last?.kind} reduced={reduced} fast={fast} paused={paused} rollKey={current?rollKey:last!.id}/>:<div className="dice-tray-empty" aria-label="Siap melempar dua dadu"><Dice5 size={25}/><Dice5 size={25}/></div>}
 </div>;
}

'use client';
import type {CSSProperties} from 'react';
import {diceTiming} from '@/lib/dice-timing.mjs';
const dots:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const orientations:Record<number,string>={1:'rotateX(-14deg) rotateY(18deg)',2:'rotateX(-14deg) rotateY(-72deg)',3:'rotateX(-104deg) rotateY(0deg)',4:'rotateX(76deg) rotateY(0deg)',5:'rotateX(-14deg) rotateY(108deg)',6:'rotateX(-14deg) rotateY(198deg)'};
/** Controlled by the shared presentation queue. Rolling geometry never depends on the result. */
export default function DiceRollFx({stage,dice,reduced,fast=false,rollKey,kind='movement',paused=false}:{stage:'hidden'|'rolling'|'result';dice:number[];reduced:boolean;fast?:boolean;rollKey:string;kind?:string;paused?:boolean}){
 if(stage==='hidden')return null;
 const rolling=stage==='rolling',timing=diceTiming({fast,reduced});
 return <div key={rollKey.replace(/:\d+$/,'')} className={`dice-cinematic tray-dice-effect ${rolling?'is-rolling':'is-settled'} ${reduced?'no-motion':''} ${paused?'is-held':''}`} style={{'--dice-roll':`${timing.roll}ms`} as CSSProperties} role="status" aria-live="polite" aria-label={rolling?'Dua dadu bergulir':`${kind==='utility'?'Dadu sewa utilitas: ':''}${dice.join(' + ')} = ${dice[0]+dice[1]}`}>
  <div className="dice-visual" aria-hidden="true"><div className="board-dice-pair">{[0,1].map(i=><div key={i} className={`die-scene die-scene-${i}`}><div className={`board-die board-die-${i}`} style={!rolling?{transform:orientations[dice[i]]||orientations[1]}:undefined}>{[1,2,3,4,5,6].map(value=><div key={value} className={`die-face die-face-${value}`}>{Array.from({length:9},(_,n)=><i key={n} className={dots[value].includes(n)?'on':''}/>)}</div>)}</div></div>)}</div>
  <span className="dice-result">{rolling?'Dadu bergulir…':`${kind==='utility'?'Sewa · ':''}${dice.join(' + ')} = ${dice[0]+dice[1]}`}</span></div>
 </div>;
}

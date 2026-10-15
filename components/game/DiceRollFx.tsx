'use client';
import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {diceTiming} from '@/lib/dice-timing.mjs';
/** Decorative only: faces always use the authoritative dice, never random numbers. */
export default function DiceRollFx({rolling,dice,reduced,fast=false}:{rolling:boolean;dice:number[];reduced:boolean;fast?:boolean}){
 const [visible,setVisible]=useState(false),wasRolling=useRef(false),timing=diceTiming({fast,reduced});
 useEffect(()=>{
  if(rolling){wasRolling.current=true;setVisible(true);return}
  if(!wasRolling.current)return;
  const timeout=setTimeout(()=>{wasRolling.current=false;setVisible(false)},timing.settle);
  return()=>clearTimeout(timeout);
 },[rolling,timing.settle]);
 if(!visible)return null;
 const dots:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
 return <div className={`board-dice-effect ${rolling?'is-rolling':'is-settled'} ${reduced?'no-motion':''}`} style={{'--dice-roll':`${timing.roll}ms`} as CSSProperties} aria-hidden="true"><div className="dice-visual"><div className="board-dice-pair">{[0,1].map(i=><div key={i} className={`board-die board-die-${i}`}>{Array.from({length:9},(_,n)=><i key={n} className={dots[dice[i]||1]?.includes(n)?'on':''}/>)}</div>)}</div>{!rolling&&<span className="dice-result">{dice.join(' + ')} = {dice[0]+dice[1]}</span>}</div></div>;
}

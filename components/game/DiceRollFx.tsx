'use client';
import {useEffect,useRef,useState} from 'react';

/** Purely decorative dice animation: never creates or modifies game outcomes. */
export default function DiceRollFx({rolling,dice,reduced}:{rolling:boolean,dice:number[],reduced:boolean}){
 const [visible,setVisible]=useState(false);
 const wasRolling=useRef(false);
 useEffect(()=>{
  if(rolling){wasRolling.current=true;setVisible(true);return;}
  if(!wasRolling.current)return;
  wasRolling.current=false;
  const timeout=window.setTimeout(()=>setVisible(false),reduced?150:200);
  return()=>window.clearTimeout(timeout);
 },[rolling,reduced]);
 if(!visible)return null;
 const dots:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
 return <div className={`board-dice-effect ${rolling?'is-rolling':'is-settled'} ${reduced?'no-motion':''}`} aria-hidden="true">
  <div className="board-dice-pair">{[0,1].map(i=><div key={i} className={`board-die board-die-${i}`}>
   {Array.from({length:9},(_,n)=><i key={n} className={dots[rolling?(i?5:2):(dice[i]||1)]?.includes(n)?'on':''}/>)}
  </div>)}</div>
 </div>;
}

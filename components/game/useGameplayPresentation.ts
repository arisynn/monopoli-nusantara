'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import {collectPresentation} from '@/lib/gameplay-presentation.mjs';

type Event={id:string;title:string;text:string;type:string};
type Notice={id:number;text:string};
export default function useGameplayPresentation(game:any,enabled:boolean,epoch:number,blocked:boolean,fast:boolean){
 const cursor=useRef<any>(null),session=useRef({enabled:false,epoch});
 const [events,setEvents]=useState<Event[]>([]),[notices,setNotices]=useState<Notice[]>([]);
 const [notice,setNotice]=useState<Notice|null>(null);
 useEffect(()=>{
  const baseline=!enabled||!session.current.enabled||epoch!==session.current.epoch||cursor.current?.match!==game?.matchId;
  const result=collectPresentation(cursor.current,game,{baseline});
  cursor.current=result.cursor;session.current={enabled,epoch};
  if(baseline){setEvents([]);setNotices([]);setNotice(null);return}
  if(result.events.length)setEvents(old=>[...old,...result.events].slice(-12));
  if(result.notices.length){
   // Summarize a single transition in one toast, with the full detail in History.
   const list=result.notices,meaningful=list.filter((e:Notice)=>!gameplayNoise(e.text));
   const chosen=meaningful.length?meaningful:list;
   setNotices(old=>[...old,{id:list.at(-1)!.id,text:chosen.map((e:Notice)=>e.text).join(' ')}].slice(-8));
  }
 },[game,enabled,epoch]);
 useEffect(()=>{
  if(blocked||events.length||notice||!notices.length)return;
  setNotice(notices[0]);setNotices(old=>old.slice(1));
 },[blocked,events.length,notice,notices]);
 useEffect(()=>{if(!notice||blocked||events.length)return;const timer=setTimeout(()=>setNotice(null),fast?3000:4500);return()=>clearTimeout(timer)},[notice,fast,blocked,events.length]);
 const dismissEvent=useCallback(()=>setEvents(old=>old.slice(1)),[]);
 return {event:events[0]||null,notice:blocked||events.length?null:notice,dismissEvent};
}
function gameplayNoise(text:string){return /^Giliran |kedaluwarsa|dapat menagih/.test(text)}

'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import {collectPresentation} from '@/lib/gameplay-presentation.mjs';
import {summarizeNotices} from '@/lib/quick-notice.mjs';

type Event={id:string;title:string;text:string;type:string};
type Notice={id:number;text:string;detail:boolean;kind:string;duration:number};
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
  const next=summarizeNotices(result.notices);
  if(next){setNotices(old=>[...old.filter(item=>item.kind!=='turn'),next].slice(-8));setNotice(current=>current?.kind==='turn'?null:current)}
 },[game,enabled,epoch]);
 useEffect(()=>{
  if(blocked||events.length||notice||!notices.length)return;
  setNotice(notices[0]);setNotices(old=>old.slice(1));
 },[blocked,events.length,notice,notices]);
 useEffect(()=>{if(!notice||blocked||events.length)return;const timer=setTimeout(()=>setNotice(null),fast?Math.min(2400,notice.duration):notice.duration);return()=>clearTimeout(timer)},[notice,fast,blocked,events.length]);
 const dismissEvent=useCallback(()=>setEvents(old=>old.slice(1)),[]);
 return {event:events[0]||null,notice:blocked||events.length?null:notice,dismissEvent};
}

'use client';
import {useEffect,useLayoutEffect,useRef,useState,useCallback,useMemo} from 'react';
import {ingestTimeline,advanceTimeline,presentedState,liveCardDecision,stepDuration} from '@/lib/presentation-timeline.mjs';
import type {PresentedGame,TimelineModel} from '@/lib/presentation-types';
export default function useGameplayPresentation(game:PresentedGame|null,enabled:boolean,epoch:number,options:{fast:boolean;reduced:boolean;paused:boolean;blocked:boolean;seat:number|null}){
 const [hidden,setHidden]=useState(false),active=enabled&&!hidden;
 const [notice,setNotice]=useState<{text:string}|null>(null);
 const [model,setModel]=useState<TimelineModel|null>(null),[step,setStep]=useState(0);
 const projection=ingestTimeline(model,game,{enabled:active,epoch,reset:options.paused}),head=projection?.queue[0]||null;
 const latest=useRef({game,enabled:active,epoch,paused:options.paused});latest.current={game,enabled:active,epoch,paused:options.paused};
 useLayoutEffect(()=>{setModel(current=>ingestTimeline(current,game,{enabled:active,epoch,reset:options.paused}))},[game,active,epoch,options.paused]);
 useEffect(()=>{if(!active||options.paused){setNotice(null);return}if(!projection?.notice)return;setNotice(projection.notice);const timer=setTimeout(()=>setNotice(null),3200);return()=>clearTimeout(timer)},[projection?.notice?.id,active,epoch,options.paused]);
 const complete=useCallback((id:string)=>setModel(current=>{const c=latest.current;return advanceTimeline(ingestTimeline(current,c.game,{enabled:c.enabled,epoch:c.epoch,reset:c.paused}),id)}),[]);
 const interactive=!options.paused&&!!head?.event&&liveCardDecision(head.event,game,options.seat);
 const timer=useRef({id:'',remaining:0});
 useEffect(()=>{
  if(!head)return;
  if(timer.current.id!==head.id){timer.current={id:head.id,remaining:stepDuration(head,options)+(head.kind==='pawnMoving'&&!head.move?.jump&&!options.reduced?1000:0)};setStep(0)}
  if(options.paused||options.blocked||head.kind==='eventRevealing'&&interactive)return;
  const started=performance.now(),duration=timer.current.remaining,id=head.id;
  const timeout=setTimeout(()=>complete(id),duration);
  return()=>{clearTimeout(timeout);if(timer.current.id===id)timer.current.remaining=Math.max(0,timer.current.remaining-(performance.now()-started))};
 },[head?.id,head?.kind,interactive,options.fast,options.reduced,options.paused,options.blocked,complete]);
 useEffect(()=>{const wake=()=>{setHidden(document.hidden);if(document.hidden)setModel(current=>ingestTimeline(current,latest.current.game,{enabled:latest.current.enabled,epoch:latest.current.epoch,reset:true}))};wake();document.addEventListener('visibilitychange',wake);return()=>document.removeEventListener('visibilitychange',wake)},[]);
 const state=useMemo(()=>presentedState(projection),[projection]);
 const event=head?.event||null,motion=head?.kind==='pawnMoving'?head.move:null;
 return {paused:options.paused,state,phase:head?.kind||'idle',busy:!!head,stepId:head?.id||'',dice:head?.dice||null,diceKind:head?.diceKind||'movement',event,canAcknowledge:interactive,
  notice:options.blocked?null:notice,transactions:head?.finance?[{id:head.id,...head.finance}]:[],motion,
  traveling:motion?{moveId:motion.id,player:motion.player,total:motion.path.length,step}:null,
  completeMove:(moveId:number)=>{if(motion?.id===moveId&&head)complete(head.id)},onMoveStep:(_moveId:number,value:number)=>setStep(value),
  dismissEvent:()=>{if(event&&head)complete(head.id)},skip:()=>{const c=latest.current;setModel(current=>ingestTimeline(current,c.game,{enabled:c.enabled,epoch:c.epoch,reset:true}))}};
}

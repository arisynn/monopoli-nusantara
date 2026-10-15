'use client';
import {useEffect,useLayoutEffect,useRef} from 'react';
import {BoardArtwork,BoardTokens} from './BoardMap';
import DiceRollFx from './DiceRollFx';
import {diceTiming} from '@/lib/dice-timing.mjs';
import {pawnPoint} from '@/lib/pawn-layout.mjs';
import {pawnRoute,samplePawnRoute,pawnMotionScale} from '@/lib/pawn-animation.mjs';
import {BoardGesture,fitCamera,closeCamera,centerCamera,resizeCamera,zoomCamera,panCamera,worldPoint,hitTile,tileCenter,scaleLimits,keepPointVisible} from '@/lib/board-camera.mjs';

type Props={state:any,selected:number,onSelect:(id:number)=>void,view?:string,cameraKey?:number,reduced?:boolean,speed?:boolean,rolling?:boolean,moveIdToAnimate?:number|null,onMoveComplete?:(moveId:number)=>void,onMoveStep?:(moveId:number,step:number)=>void,onCameraModeChange?:(mode:string)=>void};
export default function Board({state,selected,onSelect,view='follow',cameraKey=0,reduced=false,speed=false,rolling=false,moveIdToAnimate=null,onMoveComplete,onMoveStep,onCameraModeChange}:Props){
 const host=useRef<HTMLDivElement>(null),world=useRef<SVGGElement>(null),runtime=useRef<any>(null);
 const props=useRef({state,onSelect,view,cameraKey,reduced,speed,rolling,moveIdToAnimate,onMoveComplete,onMoveStep,onCameraModeChange});props.current={state,onSelect,view,cameraKey,reduced,speed,rolling,moveIdToAnimate,onMoveComplete,onMoveStep,onCameraModeChange};
 useEffect(()=>{
  const root=host.current!;let camera=fitCamera(root.clientWidth,root.clientHeight),frame=0,launchTimer:ReturnType<typeof setTimeout>|null=null,animation:any=null,disposed=false;
  let match=props.current.state?.matchId,moveId=props.current.moveIdToAnimate===props.current.state?.lastMove?.id?null:props.current.state?.lastMove?.id;
  const gesture=new BoardGesture();let currentPoint=activePoint(),currentScale=1,previousMode:string|undefined;
  function activePoint(){const s=props.current.state,p=s?.players[s.turn];return p?pawnPoint(props.current.state,p.id):tileCenter(0)}
  function apply(){
   if(disposed)return;
   world.current?.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
   const isFollowing=gesture.following&&props.current.view==='follow';
   const isZoomed=camera.scale>scaleLimits(camera.width,camera.height).min*1.05;
   const mode=isFollowing?'follow':isZoomed?'explore':'overview';
   if(previousMode!==mode){previousMode=mode;props.current.onCameraModeChange?.(mode)}
  }
  function positionPawn(id:number,point:{x:number,y:number},scale=1){root.querySelector(`[data-pawn="${id}"]`)?.setAttribute('transform',`translate(${point.x} ${point.y}) scale(${scale})`)}
  function stopAnimation(){
   if(launchTimer!==null){clearTimeout(launchTimer);launchTimer=null}
   cancelAnimationFrame(frame);frame=0;
   if(animation){const p=props.current.state?.players[animation.player];if(p)positionPawn(p.id,pawnPoint(props.current.state,p.id));animation=null}
   currentPoint=activePoint();currentScale=1;
  }
  // Smooth trailing view: unlike centering every frame, this visibly moves the pawn.
  function follow(point=currentPoint){if(gesture.following&&props.current.view==='follow')camera=keepPointVisible(camera,point)}
  function finishAnimation(){
   const a=animation;if(!a)return;
   animation=null;if(launchTimer!==null){clearTimeout(launchTimer);launchTimer=null}
   cancelAnimationFrame(frame);frame=0;
   const p=props.current.state?.players[a.player];if(p)positionPawn(a.player,pawnPoint(props.current.state,a.player));
   currentPoint=activePoint();currentScale=1;follow();apply();
   props.current.onMoveComplete?.(a.id);
  }
  function tick(time:number){
   frame=0;if(!animation||disposed)return;
   if(document.hidden){finishAnimation();return}
   const a=animation,point=samplePawnRoute(a.points,time-a.start,a.step);
   if(!point){finishAnimation();return}
   currentPoint=point;currentScale=pawnMotionScale(a.move,a.state,(time-a.start)/a.step);positionPawn(a.player,point,currentScale);follow();apply();
   if(point.step!==a.lastStep){a.lastStep=point.step;props.current.onMoveStep?.(a.id,point.step)}
   if(point.done)finishAnimation();else frame=requestAnimationFrame(tick);
  }
  function setView(){
   gesture.clear();gesture.resume();currentPoint=animation?currentPoint:activePoint();
   camera=props.current.view==='follow'?closeCamera(root.clientWidth,root.clientHeight,currentPoint):fitCamera(root.clientWidth,root.clientHeight);apply();
  }
  function update(){
   const s=props.current.state,m=s?.lastMove,newMatch=s?.matchId!==match;
   if(newMatch){stopAnimation();match=s?.matchId;moveId=m?.id===props.current.moveIdToAnimate?null:m?.id;setView();if(moveId!==null)return}
   if(m&&m.id!==moveId){
    stopAnimation();moveId=m.id;
    const points=pawnRoute(m,s);
    if(m.id===props.current.moveIdToAnimate&&points.length>=2&&!props.current.reduced&&!document.hidden){
     animation={id:m.id,player:m.player,points,move:m,state:s,start:0,step:Math.min(props.current.speed?115:225,(props.current.speed?1300:2600)/(points.length-1)),lastStep:-1};
     currentPoint=points[0];currentScale=pawnMotionScale(m,s,0);positionPawn(m.player,currentPoint,currentScale);
     // Show the settled dice first; otherwise a short move happens behind the dice.
     const launch=()=>{
      launchTimer=null;if(disposed||!animation||animation.id!==m.id)return;
      animation.start=performance.now();frame=requestAnimationFrame(tick);
     };
     if(!props.current.rolling)launchTimer=setTimeout(launch,diceTiming({fast:props.current.speed,reduced:props.current.reduced}).settle+20);else animation.launch=launch;
    }else{
     props.current.onMoveComplete?.(m.id);
    }
   }
   if(animation?.launch&&!props.current.rolling){const launch=animation.launch;delete animation.launch;launchTimer=setTimeout(launch,diceTiming({fast:props.current.speed,reduced:props.current.reduced}).settle+20)}
   if(animation&&props.current.moveIdToAnimate!==animation.id){stopAnimation()}
   if(props.current.reduced&&animation){const id=animation.id;stopAnimation();props.current.onMoveComplete?.(id)}
   if(animation)positionPawn(animation.player,currentPoint,currentScale);else{currentPoint=activePoint();currentScale=1}follow();apply();
  }
  const local=(e:{clientX:number,clientY:number})=>{const r=root.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}};
  const isControl=(e:Event)=>!!(e.target as Element)?.closest('[data-map-control]');
  function down(e:PointerEvent){if(isControl(e)||e.button!==0||!e.isPrimary&&e.pointerType==='mouse')return;root.focus({preventScroll:true});root.setPointerCapture(e.pointerId);gesture.begin(e.pointerId,local(e));if(gesture.points.size>1)apply();root.classList.add('dragging')}
  function move(e:PointerEvent){if(!gesture.points.has(e.pointerId))return;camera=gesture.move(e.pointerId,local(e),camera);apply()}
  function up(e:PointerEvent){
   if(!gesture.points.has(e.pointerId))return;
   // A final pointerup can arrive without the last pointermove.
   if(e.type==='pointerup')camera=gesture.move(e.pointerId,local(e),camera);const tap=gesture.end(e.pointerId,e.type!=='pointerup');
   if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);if(!gesture.points.size)root.classList.remove('dragging');apply();
   if(tap){const id=hitTile(worldPoint(camera,tap));if(id!==null)props.current.onSelect(id)}
  }
  function wheel(e:WheelEvent){if(isControl(e))return;e.preventDefault();gesture.explore();camera=zoomCamera(camera,Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.004),local(e));apply()}
  function zoom(factor:number){gesture.explore();camera=zoomCamera(camera,factor);apply()}
  function key(e:KeyboardEvent){
   if(isControl(e))return;const tile=(e.target as Element).closest('[data-tile]');
   if(tile&&(e.key==='Enter'||e.key===' ')){e.preventDefault();props.current.onSelect(Number(tile.getAttribute('data-tile')));return}
   const direction:Record<string,[number,number]>={ArrowLeft:[64,0],ArrowRight:[-64,0],ArrowUp:[0,64],ArrowDown:[0,-64]};
   if(direction[e.key]){e.preventDefault();gesture.explore();camera=panCamera(camera,...direction[e.key]);apply()}
   else if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.25)}else if(e.key==='-'){e.preventDefault();zoom(.8)}
  }
  function focusTile(e:FocusEvent){const element=e.target as Element;if(!element.matches('[data-tile]:focus-visible'))return;const point=tileCenter(Number(element.getAttribute('data-tile')));gesture.explore();camera=centerCamera(camera,point);apply()}
  const observer=new ResizeObserver(()=>{if(!root.clientWidth||!root.clientHeight)return;camera=props.current.view==='overview'&&gesture.following?fitCamera(root.clientWidth,root.clientHeight):resizeCamera(camera,root.clientWidth,root.clientHeight);follow();apply()});observer.observe(root);
  function visibility(){if(document.hidden){gesture.clear();root.classList.remove('dragging');if(animation)finishAnimation();else stopAnimation()}else {currentPoint=activePoint();follow();apply()}}
  root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',up);root.addEventListener('lostpointercapture',up);root.addEventListener('wheel',wheel,{passive:false});root.addEventListener('keydown',key);root.addEventListener('focusin',focusTile);document.addEventListener('visibilitychange',visibility);
  runtime.current={update,setView,zoom,jump(point:{x:number,y:number}){gesture.explore();camera=centerCamera(camera,point);apply()}};setView();update();
  return()=>{disposed=true;stopAnimation();gesture.clear();observer.disconnect();root.removeEventListener('pointerdown',down);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',up);root.removeEventListener('lostpointercapture',up);root.removeEventListener('wheel',wheel);root.removeEventListener('keydown',key);root.removeEventListener('focusin',focusTile);document.removeEventListener('visibilitychange',visibility);runtime.current=null};
 },[]);
 useLayoutEffect(()=>runtime.current?.update(),[state,reduced,speed,rolling,moveIdToAnimate]);
 useEffect(()=>runtime.current?.setView(),[view,cameraKey]);
 return <div className="board-2d" ref={host} tabIndex={0} role="region" aria-label="Papan 2D Nusantara, 40 petak. Geser untuk menjelajah, cubit dua jari atau gulir untuk zoom. Tombol panah untuk menggeser. Tab untuk memilih petak.">
  <svg className="board-vector" width="100%" height="100%" aria-label="Peta permainan"><g ref={world}><BoardArtwork state={state} selected={selected}/><BoardTokens state={state}/></g></svg>
  <DiceRollFx rolling={rolling} dice={state?.dice||[1,1]} reduced={reduced} fast={speed}/>

 </div>
}

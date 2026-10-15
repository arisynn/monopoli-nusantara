'use client';
import {useEffect,useRef,useState} from 'react';
import {Plus,Minus,Navigation,Hand} from 'lucide-react';
import {BOARD,PAWNS} from '@/lib/content.mjs';
import {BoardArtwork,BoardTokens} from './BoardMap';
import {BoardGesture,fitCamera,closeCamera,centerCamera,resizeCamera,zoomCamera,panCamera,worldPoint,hitTile,tokenPoint,tileCenter,visibleWorld,scaleLimits} from '@/lib/board-camera.mjs';

type Props={state:any,selected:number,onSelect:(id:number)=>void,view?:string,cameraKey?:number,reduced?:boolean,speed?:boolean,onCameraModeChange?:(mode:string)=>void};
export default function Board({state,selected,onSelect,view='follow',cameraKey=0,reduced=false,speed=false,onCameraModeChange}:Props){
 const host=useRef<HTMLDivElement>(null),world=useRef<SVGGElement>(null),miniWindow=useRef<SVGRectElement>(null),runtime=useRef<any>(null);
 const props=useRef({state,onSelect,view,cameraKey,reduced,speed,onCameraModeChange});props.current={state,onSelect,view,cameraKey,reduced,speed,onCameraModeChange};
 const [following,setFollowing]=useState(view==='follow'),[zoomed,setZoomed]=useState(view==='follow');
 useEffect(()=>{
  const root=host.current!;let camera=fitCamera(root.clientWidth,root.clientHeight),frame=0,animation:any=null,disposed=false;
  let match=props.current.state?.matchId,moveId=props.current.state?.lastMove?.id;
  const gesture=new BoardGesture();let currentPoint=activePoint(),previousFollowing:boolean|undefined,previousZoomed:boolean|undefined,previousMode:string|undefined;
  function activePoint(){const s=props.current.state,p=s?.players[s.turn];return p?tokenPoint(p.pos,p.id):tileCenter(0)}
  function apply(){
   if(disposed)return;
   world.current?.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
   const rect=visibleWorld(camera);for(const key of ['x','y','width','height'] as const)miniWindow.current?.setAttribute(key,String(rect[key]));
   const isFollowing=gesture.following&&props.current.view==='follow';
   const isZoomed=camera.scale>scaleLimits(camera.width,camera.height).min*1.05;
   const mode=isFollowing?'follow':isZoomed?'explore':'overview';
   if(previousFollowing!==isFollowing){previousFollowing=isFollowing;setFollowing(isFollowing)}
   if(previousZoomed!==isZoomed){previousZoomed=isZoomed;setZoomed(isZoomed)}
   if(previousMode!==mode){previousMode=mode;props.current.onCameraModeChange?.(mode)}
  }
  function positionPawn(id:number,point:{x:number,y:number}){root.querySelector(`[data-pawn="${id}"]`)?.setAttribute('transform',`translate(${point.x} ${point.y})`)}
  function stopAnimation(){cancelAnimationFrame(frame);frame=0;if(animation){const p=props.current.state?.players[animation.player];if(p)positionPawn(p.id,tokenPoint(p.pos,p.id));animation=null}currentPoint=activePoint()}
  function follow(point=currentPoint){if(gesture.following&&props.current.view==='follow')camera=centerCamera(camera,point)}
  function tick(time:number){
   frame=0;if(!animation||disposed||document.hidden)return;
   const a=animation,elapsed=(time-a.start)/a.step,index=Math.min(Math.floor(elapsed),a.points.length-2),t=Math.min(1,elapsed-index),smooth=t*t*(3-2*t),from=a.points[index],to=a.points[index+1];
   currentPoint={x:from.x+(to.x-from.x)*smooth,y:from.y+(to.y-from.y)*smooth};positionPawn(a.player,currentPoint);follow();apply();
   if(elapsed>=a.points.length-1){animation=null;currentPoint=activePoint();follow();apply()}else frame=requestAnimationFrame(tick);
  }
  function setView(){
   gesture.clear();gesture.resume();currentPoint=animation?currentPoint:activePoint();
   camera=props.current.view==='follow'?closeCamera(root.clientWidth,root.clientHeight,currentPoint):fitCamera(root.clientWidth,root.clientHeight);apply();
  }
  function update(){
   const s=props.current.state,m=s?.lastMove,newMatch=s?.matchId!==match;
   if(newMatch){stopAnimation();match=s?.matchId;moveId=m?.id;setView();return}
   if(m&&m.id!==moveId){
    stopAnimation();moveId=m.id;currentPoint=activePoint();
    if(!props.current.reduced&&!document.hidden&&!m.jump&&m.path?.length){
     const ids=[m.from??m.path[0],...m.path],points=ids.map((id:number)=>tokenPoint(id,m.player));
     animation={player:m.player,points,start:performance.now(),step:props.current.speed?65:150};currentPoint=points[0];positionPawn(m.player,currentPoint);frame=requestAnimationFrame(tick);
    }
   }
   if(props.current.reduced&&animation)stopAnimation();
   if(!animation)currentPoint=activePoint();follow();apply();
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
  function visibility(){if(document.hidden){gesture.clear();root.classList.remove('dragging');stopAnimation()}else {currentPoint=activePoint();follow();apply()}}
  root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',up);root.addEventListener('lostpointercapture',up);root.addEventListener('wheel',wheel,{passive:false});root.addEventListener('keydown',key);root.addEventListener('focusin',focusTile);document.addEventListener('visibilitychange',visibility);
  runtime.current={update,setView,zoom,jump(point:{x:number,y:number}){gesture.explore();camera=centerCamera(camera,point);apply()}};setView();
  return()=>{disposed=true;stopAnimation();gesture.clear();observer.disconnect();root.removeEventListener('pointerdown',down);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',up);root.removeEventListener('lostpointercapture',up);root.removeEventListener('wheel',wheel);root.removeEventListener('keydown',key);root.removeEventListener('focusin',focusTile);document.removeEventListener('visibilitychange',visibility);runtime.current=null};
 },[]);
 useEffect(()=>runtime.current?.update(),[state,reduced,speed]);
 useEffect(()=>runtime.current?.setView(),[view,cameraKey]);
 return <div className="board-2d" ref={host} tabIndex={0} role="region" aria-label="Papan 2D Nusantara, 40 petak. Geser untuk menjelajah, cubit atau gunakan tombol untuk zoom. Tombol panah untuk menggeser. Tab untuk memilih petak.">
  <svg className="board-vector" width="100%" height="100%" aria-label="Peta permainan"><g ref={world}><BoardArtwork state={state} selected={selected}/><BoardTokens state={state}/></g></svg>
  <div className="map-status" aria-live="polite">{following?<Navigation size={12}/>:zoomed?<Hand size={12}/>:null}<span>{following?'Mengikuti pion':zoomed?'Jelajah bebas':'Seluruh papan'}</span></div>
  <button type="button" data-map-control className={`map-minimap ${zoomed?'':'is-hidden'}`} tabIndex={zoomed?0:-1} aria-hidden={!zoomed} aria-label="Peta kecil. Ketuk lokasi untuk menggeser papan." onClick={e=>{const r=e.currentTarget.getBoundingClientRect();const point=e.detail===0?{x:500,y:500}:{x:(e.clientX-r.left)/r.width*1000,y:(e.clientY-r.top)/r.height*1000};runtime.current?.jump(point)}}>
   <svg viewBox="0 0 1000 1000" aria-hidden="true"><rect width="1000" height="1000" fill="#cee2cd"/><rect x="140" y="140" width="720" height="720" fill="#95b8a5"/>{state?.players?.filter((p:any)=>!p.out).map((p:any)=>{const c=tileCenter(p.pos);return <circle key={p.id} cx={c.x} cy={c.y} r="38" fill={PAWNS[p.id].color} stroke="#183d39" strokeWidth="14"/>})}<rect ref={miniWindow} fill="#ffffff30" stroke="#fff" strokeWidth="26"/></svg>
  </button>
  <div className="map-zoom" data-map-control><button type="button" aria-label="Perbesar papan" onClick={()=>runtime.current?.zoom(1.25)}><Plus size={18}/></button><button type="button" aria-label="Perkecil papan" onClick={()=>runtime.current?.zoom(.8)}><Minus size={18}/></button></div>
  <span className="map-hint">Geser · cubit untuk zoom · ketuk petak</span>
 </div>
}

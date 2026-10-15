'use client';
import {useEffect} from 'react';

/** Follows browser chrome and the keyboard; never disables pinch-to-zoom. */
export function useGameViewport(active:boolean){
 useEffect(()=>{
  if(!active)return;
  const root=document.documentElement,viewport=window.visualViewport,media=window.matchMedia('(max-width: 800px)');
  const update=()=>{
   root.classList.toggle('portrait-game',media.matches);
   // At page zoom > 1 keep the layout stable so magnification stays usable.
   if(!viewport||viewport.scale===1)root.style.setProperty('--game-height',`${Math.round(viewport?.height||window.innerHeight)}px`);
  };
  update();window.addEventListener('resize',update);viewport?.addEventListener('resize',update);media.addEventListener('change',update);
  return()=>{root.classList.remove('portrait-game');root.style.removeProperty('--game-height');window.removeEventListener('resize',update);viewport?.removeEventListener('resize',update);media.removeEventListener('change',update)};
 },[active]);
}

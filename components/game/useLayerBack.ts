'use client';
import {useEffect,useLayoutEffect,useRef} from 'react';
import {createLayerNavigation} from '@/lib/layer-navigation.mjs';
/** Android/browser Back closes the current UI view before leaving the game. */
export default function useLayerBack(active:boolean,onBack:()=>void){
 const current=useRef(onBack),navigation=useRef<ReturnType<typeof createLayerNavigation>|null>(null);
 current.current=onBack;
 useEffect(()=>{
  const controller=createLayerNavigation(window.history,()=>current.current());navigation.current=controller;
  const pop=()=>controller.pop();window.addEventListener('popstate',pop);controller.sync(active);
  return()=>{window.removeEventListener('popstate',pop);controller.dispose();navigation.current=null};
 // Current state and callback are updated without remounting the listener.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useLayoutEffect(()=>{navigation.current?.sync(active)},[active]);
}

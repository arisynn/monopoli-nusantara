'use client';
import {useEffect} from 'react';

/** A single focus boundary for dialogs, including setup and phone panels. */
export default function useDialogFocus(key:string|null,selector:string,onClose:()=>void){
 useEffect(()=>{
  if(!key)return;
  const dialog=document.querySelector<HTMLElement>(selector);
  if(!dialog)return;
  const previous=document.activeElement as HTMLElement|null;
  const items=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')).filter(el=>el.getClientRects().length);
  (items()[0]||dialog).focus({preventScroll:true});
  const handler=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose();return}
   if(event.key!=='Tab')return;
   const all=items(),first=all[0],last=all.at(-1);
   if(!first){event.preventDefault();return}
   if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last?.focus()}
   else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus()}
  };
  document.addEventListener('keydown',handler,true);
  return()=>{document.removeEventListener('keydown',handler,true);if(previous?.isConnected)previous.focus({preventScroll:true})};
 // The caller supplies a boundary key; changing content must not reset focus.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,selector]);
}

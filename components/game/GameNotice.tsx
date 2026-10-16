'use client';
import NusaText from './NusaText';
import {Check,CircleAlert,WifiOff,X} from 'lucide-react';
/** Content-sized feedback. No backdrop, focus trap, economic effects or turn lock. */
export default function GameNotice({message,tone='info',actionLabel,onAction,onDismiss}:{message:string;tone?:'info'|'error'|'connection';actionLabel?:string;onAction?:()=>void;onDismiss?:()=>void}){
 const Icon=tone==='error'?CircleAlert:tone==='connection'?WifiOff:Check;
 return <aside className={`game-notice notice-${tone}`} role={tone==='error'?'alert':'status'} aria-atomic="true">
  <Icon size={16} aria-hidden="true"/><span className="game-notice-message" title={message}><NusaText text={message}/></span>
  {(onAction||onDismiss)&&<span className="game-notice-actions">{onAction&&<button type="button" onClick={onAction}>{actionLabel}</button>}{onDismiss&&<button type="button" onClick={onDismiss} aria-label="Tutup notifikasi"><X size={16}/></button>}</span>}
 </aside>;
}

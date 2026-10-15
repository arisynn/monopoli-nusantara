'use client';
import {useEffect,useState,useRef,useCallback} from 'react';
import {projectAuction,dismissAuctionResult,auctionIdentity} from '@/lib/auction-presentation.mjs';
/** Project the latest snapshot during render, so live -> result has no empty frame. */
export default function useAuctionPresentation(game:any,enabled:boolean,epoch:number){
 const [model,setModel]=useState<any>(null);
 const projection=projectAuction(model,game,enabled,epoch),latest=useRef({game,enabled,epoch});latest.current={game,enabled,epoch};
 useEffect(()=>{setModel((current:any)=>projectAuction(current,game,enabled,epoch))},[game,enabled,epoch]);
 const result=projection.results[0]||null;
 const dismiss=useCallback((id:string)=>setModel((current:any)=>{const context=latest.current;return dismissAuctionResult(projectAuction(current,context.game,context.enabled,context.epoch),id)}),[]);

 return {live:enabled&&game?.phase==='auction',key:auctionIdentity(game),result,dismissResult:()=>{if(result)dismiss(result.id)}};
}

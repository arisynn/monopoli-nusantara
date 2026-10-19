import {advanceTimeline,stepDuration,liveCardDecision} from './presentation-timeline.mjs';
import {decisionActor} from './game.mjs';

export function humanDecisionReady(s,seat){
 if(!s||s.players[seat]?.controller!=='human'||s.players[seat].out)return false;
 if(s.phase==='auction')return s.auction.participants.includes(seat)&&s.auction.highest!==seat;
 if(s.phase==='buildOffer')return s.buildOffer.pending.includes(seat);
 return s.phase!=='won'&&(decisionActor(s)===seat||s.rentClaims?.some(c=>c.to===seat&&['roll','end','jail','buy','card'].includes(s.phase)));
}
export function presentationLoad(model,options={}){
 const queue=model?.queue||[],versions=new Set(queue.map(s=>s.source?.version).filter(Number.isInteger));
 return {depth:queue.length,versions:versions.size,estimatedMs:queue.reduce((n,s)=>n+stepDuration(s,options),0)};
}
// Fold every confirmed step through the normal reducer: payments/assets are
// applied exactly once, snapshots reconcile the final state, logs are untouched.
export function settleConfirmed(model){
 let next=model,count=0;
 while(next?.queue.length){const id=next.queue[0].id;next=advanceTimeline(next,id);count++;}
 return {model:next,count};
}
// Online snapshots may arrive ahead of the board. Keep every step in order:
// a live decision or a click must never teleport a pawn to its destination.
export function adaptOnlineTimeline(model,state,{now=0,receivedAt=now,...options}={}){
 if(!model)return model;
 const load=presentationLoad(model,options),age=Math.max(0,now-receivedAt);
 const overloaded=load.versions>=2||load.depth>=20||age>1800;
 if(!overloaded)return {...model,onlineMode:'normal',onlineLoad:load};
 // Shorten future decorative pauses during a burst, never the active step or
 // movement. The renderer keeps ownership of a walk until its last frame.
 const queue=model.queue.map((step,index)=>{
  if(index===0||['pawnMoving','tileArrival'].includes(step.kind))return step;
  const cap={diceRolling:350,diceResult:120,financialSettlement:250,eventRevealing:1200}[step.kind];
  return cap===undefined?step:{...step,durationMs:Math.min(stepDuration(step,options),cap)};
 });
 return {...model,queue,onlineMode:queue.length?'catching-up':'caught-up',onlineLoad:load,
  catchup:{count:0,economicCount:0,reason:'backlog',at:now}};
}
// Noninteractive events and money use the shared notification queue after the
// timeline. A lightweight head still blocks all subsequent decision popups.
export const onlineInteractiveHead=(head,state,seat)=>!head?null:
 head.event&&liveCardDecision(head.event,state,seat)?head:{id:head.id,kind:head.kind};

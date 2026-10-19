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
export function adaptOnlineTimeline(model,state,{seat,now=0,receivedAt=now,force=false,...options}={}){
 if(!model)return model;
 const load=presentationLoad(model,options),age=Math.max(0,now-receivedAt);
 const ready=humanDecisionReady(state,seat)||state?.phase==='won';
 const overloaded=load.versions>=2||load.depth>=20||age>1800;
 if(!force&&!ready&&!overloaded)return {...model,onlineMode:'normal',onlineLoad:load};
 // Only compact confirmed history. The current human decision is represented by
 // the authoritative snapshot and still requires an explicit human command.
 let next=model,count=0;
 if(force||ready){const interactive=model.queue.find(h=>h.event&&liveCardDecision(h.event,state,seat));const folded=settleConfirmed(model);next={...folded.model,...(interactive?{queue:[interactive]}:{})};count=folded.count;}
 else {
  const latest=Math.max(...model.queue.map(s=>s.source?.version).filter(Number.isInteger));
  while(next.queue.length&&(!Number.isInteger(next.queue[0].source?.version)||next.queue[0].source.version<latest)){next=advanceTimeline(next,next.queue[0].id);count++;}
  const total=next.queue.reduce((n,s)=>n+stepDuration(s,options),0),scale=Math.min(1,700/Math.max(1,total));
  next={...next,queue:next.queue.map(s=>({...s,durationMs:stepDuration(s,options)*scale}))};
 }
 const remaining=new Set(next.queue.map(h=>h.id));const economicCount=model.queue.filter(h=>h.finance&&!remaining.has(h.id)).length;
 return {...next,onlineMode:next.queue.length?'catching-up':'caught-up',onlineLoad:load,catchup:{count,economicCount,reason:force?'input':ready?'human-decision':'backlog',at:now}};
}
export const onlineInteractiveHead=(head,state,seat)=>head?.event&&liveCardDecision(head.event,state,seat)?head:null;

import {command,decisionActor} from '../game.mjs';
import {chooseSmartBot} from '../bot/strategy.mjs';
import {reconcile,gameplayHeld} from './online-room.mjs';
import {secureRandom} from './online-service.mjs';
export function botActor(s){
 if(!s||s.phase==='won')return null;
 const bot=id=>s.players[id]?.controller==='bot'&&!s.players[id].out;
 if(s.phase==='auction'){
  const a=s.auction;return a.participants.find(id=>bot(id)&&id!==a.highest&&!a.passed.includes(id))??null;
 }
 if(s.phase==='buildOffer')return s.buildOffer.pending.find(bot)??null;
 const claim=s.rentClaims?.find(c=>bot(c.to)&&['roll','end','jail','buy','card'].includes(s.phase));
 if(claim)return claim.to;
 const actor=decisionActor(s);return bot(actor)?actor:null;
}
/** Bounded worker; all durable continuation/recovery is owned by DB jobs + pg_net/cron. */
export async function runBotWorker({store,decide,clock=Date.now,rng=secureRandom,maxSteps=4,maxMs=12000}){
 const start=clock();let committed=0,claimed=0,discarded=0;
 while(claimed<maxSteps&&clock()-start<maxMs){
  const owner=crypto.randomUUID(),job=await store.claimBot(owner);if(!job)break;claimed++;
  try{
   const row=await store.get(job.code);if(!row){await store.releaseBot(job.code,owner,'waiting');continue;}
   const room=row.data,before=JSON.stringify(room);reconcile(room,clock());
   if(before!==JSON.stringify(room)){const saved=await store.commit(row,room,{notify:true});if(!saved.ok){await store.releaseBot(job.code,owner,'scheduled');continue;}row.revision=saved.revision;}
   if(room.status!=='playing'||gameplayHeld(room,clock())){await store.releaseBot(job.code,owner,room.status==='playing'?'blocked':'waiting');continue;}
   const actor=botActor(room.state);if(actor===null){await store.releaseBot(job.code,owner,'waiting');continue;}
   const version=room.state.version,matchId=room.state.matchId;
   const decision=decide?await decide(room.state,actor):{action:chooseSmartBot(room.state,actor),status:'local',comment:null};
   // Provider work never holds a DB transaction. Re-read the authoritative room afterwards.
   const fresh=await store.get(job.code);if(!fresh){await store.releaseBot(job.code,owner,'waiting');continue;}
   const unchanged=JSON.stringify(fresh.data);reconcile(fresh.data,clock());
   if(unchanged!==JSON.stringify(fresh.data)){const saved=await store.commit(fresh,fresh.data,{notify:true});if(!saved.ok){await store.releaseBot(job.code,owner,'scheduled');continue;}fresh.revision=saved.revision;}
   if(fresh.data.status!=='playing'||gameplayHeld(fresh.data,clock())||fresh.data.state.version!==version||fresh.data.state.matchId!==matchId||botActor(fresh.data.state)!==actor){discarded++;await store.releaseBot(job.code,owner,'scheduled');continue;}
   const action=decision.action;if(!action)throw Error('planner');
   const {actionId,...intent}=action;
   fresh.data.state=command(fresh.data.state,actor,{...intent,id:`bot:${matchId}:${version}`,expectedVersion:version},rng);
   fresh.data.state.aiStatus=decision.status||'local';fresh.data.state.aiComment=null;
   if(fresh.data.state.phase==='won')fresh.data.status='finished';
   if(fresh.data.vote?.status==='open'&&fresh.data.vote.eligible.some(i=>fresh.data.state.players[i].out))fresh.data.vote.status='cancelled';
   const result=await store.commit(fresh,fresh.data,{type:'BOT_ACTION',botLease:owner,botWork:{actor,sourceVersion:version,matchId,actionType:intent.type},notify:true});
   if(result.ok)committed++;else{discarded++;await store.releaseBot(job.code,owner,'scheduled');}
  }catch{await store.releaseBot(job.code,owner,'scheduled','decision_failed');}
 }
 if(claimed>=maxSteps)await store.wakeBots();
 return {claimed,committed,discarded};
}
export async function workerAuthorized(provided,expected){
 if(typeof expected!=='string'||expected.length<32||typeof provided!=='string')return false;
 const hash=s=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
 const [a,b]=await Promise.all([hash(provided),hash(expected)]);const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}

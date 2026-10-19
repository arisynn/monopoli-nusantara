import {FastTermuxStore,TermuxStore} from './termux-store.mjs';
import {createGame} from '../../lib/game.mjs';
import {digest} from '../../lib/server/online-service.mjs';
import {MODEL_MANIFEST_ID,WORKER_PROTOCOL} from '../../lib/bot/model-manifest.mjs';
export async function speedFixture({fast=true,delayMs=0}={}){
 const now=Date.now(),clock=()=>now,store=new (fast?FastTermuxStore:TermuxStore)(clock),token='d'.repeat(64),workerId='00000000-0000-4000-8000-000000000003';
 store.workers.set(workerId,{id:workerId,hash:await digest(token),max_slots:2,slots:2,heartbeat:now});
 const state=createGame({players:[{name:'A',controller:'human'},{name:'B',controller:'human'},{name:'Nusa',controller:'bot',botPersona:'nusa'}],startingRoll:false},()=>.2);state.turn=2;
 const code='ABCDEFGH',room={code,status:'playing',capacity:6,host:0,state,seats:state.players.map((p,i)=>({...p,userId:i<2?'user-'+i:null,connections:i<2?{browser:now}:{}}))};
 store.rooms.set(code,{code,revision:0,data:room});store.jobs.set(code,{code,version:0,status:'scheduled',due:now-25,owner:null,until:0,attempts:0});
 const calls=[],wrapped=new Proxy(store,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return async(...args)=>{calls.push(String(key));if(delayMs)await new Promise(r=>setTimeout(r,delayMs));return value.apply(target,args);};}});
 const body=(op,data={})=>({op,protocol:WORKER_PROTOCOL,manifest:MODEL_MANIFEST_ID,...data});
 return {store,wrapped,token,workerId,room,code,clock,calls,body};
}

import {writeFile} from 'node:fs/promises';
import {createGame} from '../lib/game.mjs';
import {createOnlineService} from '../lib/server/online-service.mjs';
import {MemoryOnlineStore} from '../tests/helpers/online-store.mjs';
import {percentile} from '../lib/online-performance.mjs';
const rows=[];
for(const players of [2,3,4,5,6])for(const batch of [false,true])for(let trial=0;trial<2;trial++){
 const now=Date.now(),store=new MemoryOnlineStore(),service=createOnlineService({store});
 const state=createGame({players:Array.from({length:players},(_,i)=>({name:`P${i}`,controller:'human'})),startingRoll:false},()=>.2);
 for(const id of [1,3])state.assets[id].owner=0;
 const room={code:'ABCDEFGH',status:'playing',host:0,capacity:players,state,seats:state.players.map((p,i)=>({...p,userId:`user-${i}`,memberId:crypto.randomUUID(),connections:{browser:now}}))};
 store.rooms.set(room.code,{code:room.code,revision:0,data:room});
 let requests=0,computeMs=0;const start=performance.now();
 for(let index=0;index<(batch?1:6);index++){
  await new Promise(r=>setTimeout(r,180));requests++;
  const id=crypto.randomUUID(),current=store.rooms.get(room.code).data.state;
  const action=batch?{type:'BUILD_BATCH',group:0,count:6}:{type:'BUILD',tile:index%2?3:1};
  const cpu=performance.now();await service.execute({type:'ACTION',code:room.code,clientId:'benchmark-client',requestId:id,action:{...action,id,expectedVersion:current.version}},'user-0');computeMs+=performance.now()-cpu;
 }
 const final=store.rooms.get(room.code).data.state;
 if(final.players[0].cash!==12000||final.assets[1].level!==3||final.assets[3].level!==3)throw Error('Economic mismatch');
 rows.push({players,batch,trial,requests,commits:store.notifications.length,responseMs:performance.now()-start,computeMs});
}
const summarize=batch=>Object.fromEntries(['responseMs','computeMs','requests','commits'].map(key=>{const values=rows.filter(r=>r.batch===batch).map(r=>r[key]);return [key,{p50:percentile(values,.5),p95:percentile(values,.95)}];}));
const report={generatedAt:new Date().toISOString(),rows,before:summarize(false),after:summarize(true),limits:['Local authoritative service with memory store and controlled 180 ms delay per request.','Before uses the old six sequential official BUILD requests without extra animation waiting; after uses one atomic batch.','Not production Vercel/Supabase/Android latency; no held game traffic, model or RNG changes.']};
await writeFile('docs/audits/BUILD_BATCH_BENCHMARK.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({before:report.before,after:report.after},null,2));

// Opt-in STAGING integration. Creates persistent QA rooms; never deletes existing data.
import assert from 'node:assert/strict';
import {createSupabaseStore,supabaseConfig} from '../lib/server/supabase-store.mjs';
import {createOnlineService} from '../lib/server/online-service.mjs';
import {subscribeRoom} from '../lib/online-client.mjs';
if(process.env.MN_ALLOW_LIVE_TESTS!=='staging')throw Error('Set MN_ALLOW_LIVE_TESTS=staging only for an isolated staging project. No live tests ran.');
const config=supabaseConfig(process.env);assert(config,'Configure server Supabase variables in the staging environment.');
const store=createSupabaseStore(config),service=createOnlineService({store});
const supplied=JSON.parse(process.env.MN_TEST_ACCESS_TOKENS||'[]'),identities=[];
async function authRequest(path,token,body){
 const r=await fetch(config.url+'/auth/v1/'+path,{method:body?'POST':'GET',headers:{apikey:config.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert(r.ok,'Staging Auth failed; verify providers/rate limits or provision test identities.');return r.json();
}
for(let i=0;i<7;i++){
 let token=supplied[i];if(!token)token=(await authRequest('signup',null,{data:{qa:true}})).access_token;
 assert(token,'Test identity must have a valid session.');const user=await authRequest('user',token);identities.push({id:user.id,token});
}
const intent=(i,type,data={})=>({type,requestId:data.action?.id||crypto.randomUUID(),clientId:`staging-connection-${i}`,...data});
const call=(i,type,data={})=>service.execute(intent(i,type,data),identities[i].id),rooms=[];
async function clientRest(i,path,body){return fetch(`${config.url}/rest/v1/${path}`,{method:body?'POST':'GET',headers:{apikey:config.key,Authorization:'Bearer '+identities[i].token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})}
for(const n of [2,3,6]){
 const created=await call(0,'CREATE',{capacity:n,name:`QA ${n} players`}),code=created.code;rooms.push(code);
 for(let i=1;i<n;i++)await call(i,'JOIN',{code,name:`QA player ${i}`});
 for(let i=0;i<n;i++)await call(i,'READY',{code,ready:true});
 await call(0,'START',{code});
 const member=await clientRest(0,`mn_room_updates?code=eq.${code}&select=code,revision`);assert(member.ok);assert.equal((await member.json()).length,1);
 const outsider=await clientRest(6,`mn_room_updates?code=eq.${code}&select=code,revision`);assert(outsider.ok);assert.deepEqual(await outsider.json(),[]);
 assert(!(await clientRest(0,'mn_rooms?select=data&limit=1')).ok,'Browser must not select private snapshots');
 assert(!(await clientRest(0,'rpc/mn_commit_room',{p_code:code,p_expected_revision:0,p_data:{}})).ok,'Browser must not execute service commit');
 await assert.rejects(service.read(code,identities[6].id));
 // Deterministic fixture restricted to this newly-created QA room.
 const row=await store.get(code);row.data.state.phase='buy';row.data.state.buy=1;row.data.state.turn=0;
 assert((await store.commit(row,row.data,{notify:true})).ok);
 const version=row.data.state.version,id=crypto.randomUUID(),b=intent(0,'ACTION',{code,action:{id,type:'BUY',expectedVersion:version}});
 const other=intent(0,'ACTION',{code,action:{id:crypto.randomUUID(),type:'BUY',expectedVersion:version}});
 const race=await Promise.allSettled([service.execute(b,identities[0].id),service.execute(other,identities[0].id)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 const winner=race[0].status==='fulfilled'?b:other;await service.execute(winner,identities[0].id);
 const after=await store.get(code);assert.equal(after.data.state.players[0].cash,14400);assert.equal(after.data.state.assets[1].owner,0);
 const commits=await Promise.all([store.commit(after,after.data,{notify:true}),store.commit(after,after.data,{notify:true})]);assert.equal(commits.filter(r=>r.ok).length,1);
 await call(0,'PAUSE_REQUEST',{code});let view=await service.read(code,identities[0].id);
 for(let i=1;i<Math.floor(n/2)+1;i++)await call(i,'VOTE',{code,voteId:view.vote.id,agree:true});
 view=await service.read(code,identities[0].id);assert.equal(view.status,'paused');const snapshot=JSON.stringify((await store.get(code)).data.state);
 for(let i=0;i<n;i++)await call(i,'RESUME_READY',{code,cycle:view.pause.cycle,ready:true});
 assert.equal((await service.read(code,identities[0].id)).status,'playing');assert.equal(JSON.stringify((await store.get(code)).data.state),snapshot);
 const expired=await store.get(code);for(const s of expired.data.seats)s.connections={expired:Date.now()-90001};assert((await store.commit(expired,expired.data,{notify:true})).ok);
 const recovered=await call(0,'HEARTBEAT',{code});assert.equal(recovered.status,'paused');assert.equal(recovered.pause.reason,'disconnect');
 console.log(`PASS real Supabase: ${n} players, RLS, service-only writes, CAS, idempotency, pause/resume, offline recovery`);
}
await new Promise((resolve,reject)=>{
 let joined=false,callbacks=0,stop;
 const timer=setTimeout(()=>{stop?.();reject(Error('Realtime event did not arrive; check publication, Auth and RLS.'))},15000);
 stop=subscribeRoom(config,rooms[0],async()=>identities[0].token,()=>{
  if(++callbacks<2)return; // First callback only recovers the snapshot on channel join.
  clearTimeout(timer);stop();resolve();
 },ready=>{
  if(!ready||joined)return;joined=true;
  setTimeout(async()=>{try{const row=await store.get(rooms[0]);assert((await store.commit(row,row.data,{notify:true})).ok)}catch(e){clearTimeout(timer);stop();reject(e)}},100);
 });
});
console.log('PASS real Realtime revision event. Persistent staging QA rooms:',rooms.join(', '));

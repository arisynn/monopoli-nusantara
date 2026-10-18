// Cache safe diagnostics only; never cache authorization or a live lease.
let cached=null,until=0,pending=null,identity=null;
export async function workerCapabilities(store,key='default'){
 if(identity===key&&cached&&Date.now()<until)return cached;
 if(identity===key&&pending)return pending;
 identity=key;
 pending=store.onlineCapabilities().then(value=>{cached=value;until=Date.now()+5000;return value;}).finally(()=>{pending=null;});
 return pending;
}
export function publicWorkerStatus(c){
 return {provider:c?.workerProvider||'edge',status:c?.workerProvider==='termux'?(c.workerAlive?(c.availableSlots>0?'ready':'busy'):'offline'):'configured'};
}
const rooms=new Map();
export async function roomWorkerStatus(store,code,key='default'){
 const c=await workerCapabilities(store,key);
 if(c.workerProvider!=='termux')return publicWorkerStatus(c);
 const id=`${key}:${code}`,old=rooms.get(id);if(old&&old.until>Date.now())return old.value;
 const value=await store.workerRpc('mn_worker_room_status',{p_code:code});
 if(rooms.size>=64)rooms.delete(rooms.keys().next().value);
 rooms.set(id,{until:Date.now()+5000,value});return value;
}

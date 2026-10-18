import {Worker} from 'node:worker_threads';
export class ComputePool{
 constructor(slots){this.slots=Array.from({length:slots},()=>({worker:null,pending:null}));this.closed=false;}
 async compute(input,timeout=15000){
  const slot=this.slots.find(s=>!s.pending);if(!slot||this.closed)throw Error('Slot komputasi penuh.');
  slot.worker ||= new Worker(new URL('./compute.mjs',import.meta.url));
  return new Promise((resolve,reject)=>{
   const worker=slot.worker,id=crypto.randomUUID();let timer;
   const finish=(error,result)=>{clearTimeout(timer);worker.removeListener('message',message);worker.removeListener('error',failed);worker.removeListener('exit',exited);slot.pending=null;error?reject(error):resolve(result);};
   const failed=()=>{slot.worker=null;void worker.terminate();finish(Error('Thread model berhenti.'));};
   const exited=()=>{if(slot.pending)failed();};
   const message=m=>{if(m.id!==id)return;m.error?finish(Error(m.error)):finish(null,m.plan);};
   slot.pending={reject:()=>finish(Error('Worker dihentikan.'))};
   worker.on('message',message);worker.once('error',failed);worker.once('exit',exited);
   timer=setTimeout(failed,timeout);worker.postMessage({id,...input});
  });
 }
 async close(){this.closed=true;for(const s of this.slots){s.pending?.reject();if(s.worker)await s.worker.terminate();s.worker=null;}}
}

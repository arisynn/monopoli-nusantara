const KEY='nusantara-save-v1';
let clock=0;
const writes=new Map<string,Promise<void>>();
export const SAVE_SLOTS=['slot-1','slot-2','slot-3','slot-4','slot-5'] as const;

function write(key:string,input:any){
 const value={...structuredClone(input),persistedAt:clock=Math.max(Date.now(),clock+1)};
 const promise=(writes.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{
  let stored=false;
  try{localStorage.setItem(key==='latest'?KEY:KEY+':'+key,JSON.stringify(value));stored=true}catch{}
  let db:IDBDatabase|undefined;
  try{db=await open();const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(value,key);await new Promise<void>((ok,bad)=>{tx.oncomplete=()=>ok();tx.onerror=()=>bad(tx.error);tx.onabort=()=>bad(tx.error)});stored=true}catch{}finally{db?.close()}
  if(!stored)throw Error('Penyimpanan perangkat tidak tersedia.');
 });writes.set(key,promise);promise.finally(()=>{if(writes.get(key)===promise)writes.delete(key)}).catch(()=>{});return promise;
}
async function read(key:string){
 await writes.get(key)?.catch(()=>{});let local:any=null;
 try{const raw=localStorage.getItem(key==='latest'?KEY:KEY+':'+key);if(raw)local=JSON.parse(raw)}catch{}
 let db:IDBDatabase|undefined;
 try{db=await open();const indexed=await new Promise<any>((ok,bad)=>{const req=db!.transaction('saves').objectStore('saves').get(key);req.onsuccess=()=>ok(req.result);req.onerror=()=>bad(req.error)});return indexed&&(!local||(indexed.persistedAt||0)>(local.persistedAt||0))?indexed:local}catch{return local}finally{db?.close()}
}
export const saveGame=(value:any)=>write('latest',value);
export const loadGame=()=>read('latest');
export function saveSlot(id:string,value:any,label:string){if(!(SAVE_SLOTS as readonly string[]).includes(id))throw Error('Slot tidak dikenal.');if(value.room||!value.state)throw Error('Slot hanya untuk permainan lokal.');return write(id,{state:value.state,room:null,label:label.trim().slice(0,48)||'Perjalanan tersimpan'})}
export const savePrevious=(state:any)=>write('previous',{state,room:null,label:'Permainan sebelumnya'});
export async function listSaves(){return Promise.all(['previous',...SAVE_SLOTS].map(async id=>({id,...(await read(id))})))}
export function clearSlot(id:string){if(!(['previous',...SAVE_SLOTS] as string[]).includes(id))throw Error('Slot tidak dikenal.');return write(id,{state:null,room:null,label:null})}
function open(){return new Promise<IDBDatabase>((ok,bad)=>{let settled=false;const timer=setTimeout(()=>{settled=true;bad(Error('Penyimpanan tidak merespons.'))},3500);let r:IDBOpenDBRequest;try{r=indexedDB.open('monopoli-nusantara',1)}catch(error){clearTimeout(timer);bad(error);return}r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('saves'))r.result.createObjectStore('saves')};r.onsuccess=()=>{clearTimeout(timer);if(settled)r.result.close();else{settled=true;ok(r.result)}};r.onerror=()=>{clearTimeout(timer);if(!settled){settled=true;bad(r.error)}}})}

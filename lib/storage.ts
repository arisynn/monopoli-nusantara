const KEY='nusantara-save-v1';

export async function saveGame(value:any){
  value={...value,persistedAt:Date.now()};
  let stored=false;
  try{localStorage.setItem(KEY,JSON.stringify(value));stored=true}catch{}
  let db:IDBDatabase|undefined;
  try{
    db=await open();
    const tx=db.transaction('saves','readwrite');
    tx.objectStore('saves').put(value,'latest');
    await new Promise<void>((ok,bad)=>{tx.oncomplete=()=>ok();tx.onerror=()=>bad(tx.error);tx.onabort=()=>bad(tx.error)});
    stored=true;
  }catch{}finally{db?.close()}
  if(!stored)throw Error('Penyimpanan perangkat tidak tersedia.');
}

export async function loadGame(){
  let local:any=null;
  try{const raw=localStorage.getItem(KEY);if(raw)local=JSON.parse(raw)}catch{}
  let db:IDBDatabase|undefined;
  try{
    db=await open();
    const indexed=await new Promise<any>((ok,bad)=>{
      const req=db!.transaction('saves').objectStore('saves').get('latest');
      req.onsuccess=()=>ok(req.result);req.onerror=()=>bad(req.error);
    });
    return indexed&&(!local||(indexed.persistedAt||0)>(local.persistedAt||0))?indexed:local;
  }catch{return local}finally{db?.close()}
}

function open(){return new Promise<IDBDatabase>((ok,bad)=>{
  const r=indexedDB.open('monopoli-nusantara',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('saves');
  r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);
})}

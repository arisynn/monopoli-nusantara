import test from 'node:test';
import assert from 'node:assert/strict';
import {saveGame,loadGame,saveSlot,listSaves,clearSlot,savePrevious} from '../lib/storage.ts';

function storage(t,{local=null,indexed=null,failLocal=false,failIndexed=false}={}){
  const originals={localStorage:globalThis.localStorage,indexedDB:globalThis.indexedDB};
  const localMap=new Map([['nusantara-save-v1',local]]),indexedMap=new Map([['latest',indexed]]);
  const memory={get local(){return localMap.get('nusantara-save-v1')},get indexed(){return indexedMap.get('latest')},localMap,indexedMap};
  globalThis.localStorage={
    getItem:key=>localMap.get(key)??null,
    setItem:(_key,value)=>{if(failLocal)throw Error('Quota exceeded');localMap.set(_key,value)}
  };
  globalThis.indexedDB={open(){
    const request={};
    queueMicrotask(()=>{
      if(failIndexed){request.error=Error('Unavailable');request.onerror();return}
      request.result={close(){},transaction(){
        const tx={objectStore(){return {
          put(value,key){indexedMap.set(key,structuredClone(value));queueMicrotask(()=>tx.oncomplete())},
          get(key){const req={};queueMicrotask(()=>{req.result=structuredClone(indexedMap.get(key));req.onsuccess()});return req}
        }}};
        return tx;
      }};
      request.onsuccess();
    });
    return request;
  }};
  t.after(()=>{globalThis.localStorage=originals.localStorage;globalThis.indexedDB=originals.indexedDB});
  return memory;
}

test('autosave survives localStorage quota failure using IndexedDB',async t=>{
  const memory=storage(t,{failLocal:true});
  await saveGame({state:{version:4}});
  assert.equal(memory.indexed.state.version,4);
  assert.equal((await loadGame()).state.version,4);
});
test('load chooses newer IndexedDB save over a stale localStorage copy',async t=>{
  storage(t,{local:JSON.stringify({state:{version:2},persistedAt:1}),indexed:{state:{version:8},persistedAt:5}});
  assert.equal((await loadGame()).state.version,8);
});
test('corrupt localStorage falls back to the intact IndexedDB save',async t=>{
  storage(t,{local:'{broken',indexed:{state:{version:9}}});
  assert.equal((await loadGame()).state.version,9);
});
test('autosave reports failure only if both storage backends fail',async t=>{
  storage(t,{failLocal:true,failIndexed:true});
  await assert.rejects(saveGame({state:{version:1}}),/tidak tersedia/);
});


test('five slots and previous archive stay independent from autosave',async t=>{
 storage(t);await saveGame({state:{version:90}});await savePrevious({version:80});
 for(let i=1;i<=5;i++)await saveSlot(`slot-${i}`,{state:{version:i}},`Meja ${i}`);
 const slots=await listSaves();assert.deepEqual(slots.map(s=>s.state.version),[80,1,2,3,4,5]);assert.equal((await loadGame()).state.version,90);
});
test('deletion tombstone prevents a stale backend from resurrecting a slot',async t=>{
 const memory=storage(t);await saveSlot('slot-2',{state:{version:2}},'Dua');const old=memory.indexedMap.get('slot-2');await clearSlot('slot-2');memory.indexedMap.set('slot-2',old);assert.equal((await listSaves()).find(v=>v.id==='slot-2').state,null);
});
test('queued writes preserve last requested save and reject online manual slots',async t=>{
 storage(t);await Promise.all(Array.from({length:10},(_,version)=>saveSlot('slot-1',{state:{version}},'Meja')));assert.equal((await listSaves()).find(v=>v.id==='slot-1').state.version,9);assert.throws(()=>saveSlot('slot-2',{room:{token:'private'},state:{}},'Room'),/lokal/);assert.throws(()=>clearSlot('latest'),/dikenal/);
});

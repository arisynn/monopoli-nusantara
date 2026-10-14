import test from 'node:test';
import assert from 'node:assert/strict';
import {saveGame,loadGame} from '../lib/storage.ts';

function storage(t,{local=null,indexed=null,failLocal=false,failIndexed=false}={}){
  const originals={localStorage:globalThis.localStorage,indexedDB:globalThis.indexedDB};
  const memory={local,indexed};
  globalThis.localStorage={
    getItem:()=>memory.local,
    setItem:(_key,value)=>{if(failLocal)throw Error('Quota exceeded');memory.local=value}
  };
  globalThis.indexedDB={open(){
    const request={};
    queueMicrotask(()=>{
      if(failIndexed){request.error=Error('Unavailable');request.onerror();return}
      request.result={close(){},transaction(){
        const tx={objectStore(){return {
          put(value){memory.indexed=structuredClone(value);queueMicrotask(()=>tx.oncomplete())},
          get(){const req={};queueMicrotask(()=>{req.result=structuredClone(memory.indexed);req.onsuccess()});return req}
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

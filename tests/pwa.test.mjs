import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPwa} from '../frontend/pwa.mjs';
const fixture=()=>{
  const win=new EventTarget(),worker=new EventTarget();let reloads=0;
  Object.assign(win,{isSecureContext:true,matchMedia:()=>({matches:false}),location:{reload:()=>reloads++}});
  const sent=[],registration=new EventTarget();registration.waiting={postMessage:m=>sent.push(m)};
  Object.assign(worker,{controller:{},register:async()=>registration});
  const nav={serviceWorker:worker,onLine:true};let safe=true;
  const pwa=createPwa({window:win,navigator:nav,canUpdate:()=>safe,onChange:()=>{}});
  return {win,worker,nav,pwa,sent,reloads:()=>reloads,setSafe:v=>safe=v};
};
test('PWA consumes installation gesture once, handles cancellation and installed state',async()=>{
  const f=fixture();let prompts=0;const event=new Event('beforeinstallprompt',{cancelable:true});
  Object.assign(event,{prompt:async()=>prompts++,userChoice:Promise.resolve({outcome:'dismissed'})});f.win.dispatchEvent(event);
  assert(event.defaultPrevented);assert(f.pwa.state.installable);await f.pwa.install();assert.equal(prompts,1);assert(!f.pwa.state.installable);
  await f.pwa.install();assert.equal(prompts,1);assert.match(f.pwa.state.message,/Safari/);
  f.win.dispatchEvent(new Event('appinstalled'));assert(f.pwa.state.installed);
});
test('PWA refuses update/reload while gameplay is active and gives every tab a safety vote',async()=>{
  const f=fixture();await f.pwa.start();assert(f.pwa.state.updateAvailable);
  f.setSafe(false);f.pwa.update();assert.equal(f.sent.length,0);
  const replies=[],message=new Event('message');Object.assign(message,{data:{type:'CAN_ACTIVATE'},ports:[{postMessage:m=>replies.push(m)}]});f.worker.dispatchEvent(message);
  assert.deepEqual(replies,[{safe:false}]);f.worker.dispatchEvent(new Event('controllerchange'));assert.equal(f.reloads(),0);
  f.setSafe(true);f.pwa.update();assert.deepEqual(f.sent,[{type:'ACTIVATE_UPDATE'}]);
  f.worker.dispatchEvent(new Event('controllerchange'));assert.equal(f.reloads(),1);
});
test('PWA reflects network changes and manifest icons have correct PNG dimensions',()=>{
  const f=fixture();f.nav.onLine=false;f.win.dispatchEvent(new Event('offline'));assert(f.pwa.state.offline);
  f.nav.onLine=true;f.win.dispatchEvent(new Event('online'));assert(!f.pwa.state.offline);
  const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');
  assert(manifest.icons.some(i=>i.purpose==='maskable'));
  for(const icon of manifest.icons){const png=readFileSync(new URL('../public'+icon.src,import.meta.url));const [w,h]=icon.sizes.split('x').map(Number);assert.equal(png.readUInt32BE(16),w);assert.equal(png.readUInt32BE(20),h);}
});

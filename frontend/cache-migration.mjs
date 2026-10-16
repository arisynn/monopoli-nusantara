/** Retire only the old Nusantara UI worker/cache, never saves or another app's worker. */
export async function retireLegacyUI({serviceWorker,caches,origin}){
 if(!caches)return;const names=await caches.keys(),old=names.filter(k=>/^nusantara-v\d+$/.test(k));
 if(old.length&&serviceWorker){for(const registration of await serviceWorker.getRegistrations()){const active=registration.active||registration.waiting;if(!active)continue;const worker=new URL(active.scriptURL);if(worker.origin===origin&&worker.pathname==='/sw.js'&&new URL(registration.scope).pathname==='/')await registration.unregister();}}
 await Promise.all(old.map(k=>caches.delete(k)));
}

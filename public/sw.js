// UI/assets cache only. IndexedDB, localStorage and authenticated API state are never cleared.
const CACHE='nusantara-v450';
const allowed=url=>url.origin===self.location.origin&&!/^\/(api(?:\/|$)|signin|signout|callback)/.test(url.pathname);
const cacheable=response=>response.ok&&!response.redirected&&!/no-store|private/i.test(response.headers.get('Cache-Control')||'');
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.add('/favicon.svg')));self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>/^nusantara-v/.test(key)&&key!==CACHE).map(key=>caches.delete(key))))])));
self.addEventListener('message',event=>{
 if(event.data?.type!=='WARM')return;
 event.waitUntil(caches.open(CACHE).then(async cache=>{for(const path of ['/','/assets/nusa-symbol.woff',...['pinisi','komodo','becak','cenderawasih','angklung','rumah-gadang'].map(p=>`/assets/tokens/${p}.svg`),...['chance','community','start','jail','gojail','parking','station','tax','water','electric'].map(p=>`/assets/board/${p}.svg`),'/assets/region-atlas.webp',...(Array.isArray(event.data.urls)?event.data.urls.slice(0,150):[])]){try{const url=new URL(path,self.location.origin);if(!allowed(url))continue;const response=await fetch(url.href,{credentials:'same-origin'});if(cacheable(response))await cache.put(url.href,response)}catch{}}}));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||!allowed(url))return;
 const asset=/\.(js|css|woff2?|svg|png|webp)$/.test(url.pathname),navigation=request.mode==='navigate';
 if(!asset&&!navigation)return;
 const immutable=/\/_next\/static\//.test(url.pathname)||/[-.][a-fA-F0-9]{8,}\.(js|css)$/.test(url.pathname);
 const network=async()=>{const response=await fetch(request);if(cacheable(response)){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(navigation?'/':request,copy)).catch(()=>{}))}return response};
 const cached=async()=>{try{return await(await caches.open(CACHE)).match(navigation?'/':request)}catch{return undefined}};
 event.respondWith(immutable?cached().then(r=>r||network()):network().catch(async()=>await cached()||new Response('Offline — buka kembali setelah koneksi pulih.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}})));
});

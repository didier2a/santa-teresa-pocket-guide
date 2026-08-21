const CACHE='santa-teresa-v3';
const CORE=['./','./index.html','./styles.css','./v3.css','./manifest.webmanifest','./data/trip.json','./js/app.js','./assets/icons/icon.svg','./assets/photos/guide-map.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r;}).catch(()=>caches.match('./index.html'))));
    return;
  }
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});

const CACHE='santa-teresa-v5-1';
const MAP_CACHE='santa-teresa-map-v5-1';
const CORE=[
  './','./index.html','./styles.css','./v3.css','./v4b.css','./v5.css','./manifest.webmanifest',
  './data/trip.json','./js/app.js','./js/schedule-engine.js','./js/trip-config.js','./assets/icons/icon.svg',
  './assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/photos/guide-map.svg','./assets/photos/modesto.svg'
];
const LEAFLET=[
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

async function cacheExternal(cache,url,mode='cors'){
  try{
    const request=new Request(url,{mode,credentials:'omit'});
    const response=await fetch(request);
    if(response && (response.ok || response.type==='opaque'))await cache.put(request,response.clone());
  }catch{}
}
async function warmExternal(){
  const cache=await caches.open(CACHE);
  await Promise.allSettled(LEAFLET.map(url=>cacheExternal(cache,url,'cors')));
  const photos=[
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Santa_Teresa_di_Gallura%2C_piazza_Vittorio_Emanuele_I.jpg?width=960',
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Rena_Bianca_Beach%2C_Santa_Teresa_Gallura.jpg?width=960',
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Torre_di_Longonsardo%2C_Santa_Teresa_di_Gallura.jpg?width=960',
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Capo_Testa.JPG?width=960',
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Santa_Teresa_Gallura_-_Capo_Testa_%2826%29.JPG?width=960',
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Valle_della_Luna_in_Gallura%2C_Sardegna.jpg?width=960',
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Lu_Brandali.jpg?width=960',
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/Capo_di_testa.jpg?width=960'
  ];
  await Promise.allSettled(photos.map(url=>cacheExternal(cache,url,'no-cors')));
}
async function trimCache(name,maxEntries){
  const cache=await caches.open(name),keys=await cache.keys();
  while(keys.length>maxEntries){await cache.delete(keys.shift());}
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(CORE);
    await warmExternal();
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>![CACHE,MAP_CACHE].includes(k)).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin===location.origin){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),hit=await cache.match(event.request);
      if(hit)return hit;
      try{
        const response=await fetch(event.request);
        if(response.ok)await cache.put(event.request,response.clone());
        return response;
      }catch{
        if(event.request.mode==='navigate')return cache.match('./index.html');
        return new Response('',{status:504,statusText:'Offline'});
      }
    })());
    return;
  }
  if(url.hostname==='unpkg.com'||url.hostname.includes('wikimedia.org')||url.hostname.includes('wikimediausercontent.com')){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),hit=await cache.match(event.request,{ignoreSearch:false});
      if(hit)return hit;
      try{const response=await fetch(event.request);if(response)await cache.put(event.request,response.clone());return response}catch{return new Response('',{status:504,statusText:'Offline'})}
    })());
    return;
  }
  if(url.hostname.endsWith('tile.openstreetmap.org')){
    event.respondWith((async()=>{
      const cache=await caches.open(MAP_CACHE),hit=await cache.match(event.request);
      if(hit)return hit;
      try{const response=await fetch(event.request);if(response.ok){await cache.put(event.request,response.clone());void trimCache(MAP_CACHE,180)}return response}catch{return new Response('',{status:504,statusText:'Offline'})}
    })());
  }
});

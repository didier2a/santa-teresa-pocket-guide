(()=>{
  const PACK_KEY='pg152-offline-pack';
  const MAP_KEY='pg152-offline-map';
  const META_KEY='pg152-offline-meta';

  function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function bounds(places){const pts=places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));if(!pts.length)return null;return{minLat:Math.min(...pts.map(p=>p.lat)),maxLat:Math.max(...pts.map(p=>p.lat)),minLng:Math.min(...pts.map(p=>p.lng)),maxLng:Math.max(...pts.map(p=>p.lng))}}
  function makeSvg(pack){
    const places=(pack?.places||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
    const b=bounds(places);if(!b)return'';
    const w=900,h=560,pad=64,dx=Math.max(.0001,b.maxLng-b.minLng),dy=Math.max(.0001,b.maxLat-b.minLat);
    const xy=p=>({x:pad+(p.lng-b.minLng)/dx*(w-pad*2),y:h-pad-(p.lat-b.minLat)/dy*(h-pad*2)});
    const pts=places.map(xy);
    const line=pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const nodes=places.map((p,i)=>{const q=pts[i];return`<g><circle cx="${q.x}" cy="${q.y}" r="13" fill="#d8b45f" stroke="#06171b" stroke-width="5"/><text x="${q.x+20}" y="${q.y+5}" fill="#f5f7f4" font-size="22" font-family="system-ui,sans-serif">${esc(p.name)}</text></g>`}).join('');
    return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Carte hors ligne du parcours"><rect width="100%" height="100%" rx="28" fill="#0b2429"/><polyline points="${line}" fill="none" stroke="#69c9b5" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="12 10"/>${nodes}<text x="${pad}" y="42" fill="#a9bbb7" font-size="20" font-family="system-ui,sans-serif">PocketGuide 1.5.2 · carte schématique hors ligne</text></svg>`;
  }

  async function cacheAssets(pack){
    if(!('caches'in window))return 0;
    const cache=await caches.open('pocketguide-v152-route-download');
    const urls=['./pocketguide-15.html','./v15.css','./manifest.webmanifest','./data/v2-config.json','./js/pocketguide-v1-5.js','./js/pocketguide-v1-5-proactive.js','./js/planner-voice-v151.js','./js/platform-v152.js','./js/offline-v152.js','./js/ar-core.js','./js/route-runtime.js','./js/route-library.js','./engine/routepack.js'];
    for(const p of pack?.places||[]){if(/^https:\/\//.test(p.heroImage||''))urls.push(p.heroImage)}
    let ok=0;
    await Promise.allSettled(urls.map(async url=>{try{const r=await fetch(url,{cache:'no-cache',mode:url.startsWith('http')?'cors':'same-origin'});if(r.ok){await cache.put(url,r.clone());ok++}}catch{}}));
    return ok;
  }

  async function downloadCurrentRoute(){
    const app=window.__POCKETGUIDE_15__,pack=app?.pack;if(!pack)throw new Error('Parcours indisponible');
    const svg=makeSvg(pack);localStorage.setItem(PACK_KEY,JSON.stringify(pack));localStorage.setItem(MAP_KEY,svg);localStorage.setItem(META_KEY,JSON.stringify({id:pack.id,title:pack.title,downloadedAt:new Date().toISOString()}));
    const assets=await cacheAssets(pack);
    return{pack,svg,assets};
  }

  function offlinePanel(){
    let box=document.querySelector('#offlineRouteMap');
    if(box)return box;
    const map=document.querySelector('#map');if(!map)return null;
    box=document.createElement('div');box.id='offlineRouteMap';box.hidden=true;box.style.marginTop='10px';box.style.border='1px solid #24474d';box.style.borderRadius='20px';box.style.overflow='hidden';box.style.background='#0b2429';
    map.parentNode.insertBefore(box,map.nextSibling);return box;
  }

  function renderOfflineMap(force=false){
    const box=offlinePanel();if(!box)return;
    const svg=localStorage.getItem(MAP_KEY)||'';
    const should=force||!navigator.onLine;
    box.hidden=!(should&&svg);
    if(should&&svg)box.innerHTML=svg;
    const map=document.querySelector('#map');if(map)map.style.display=should&&svg?'none':'';
  }

  function injectButton(){
    const panel=document.querySelector('[data-panel="route"] .panel-head');if(!panel||document.querySelector('#downloadOfflineBtn'))return;
    const btn=document.createElement('button');btn.id='downloadOfflineBtn';btn.type='button';btn.className='ghost';btn.textContent='↓ Télécharger hors ligne';panel.append(btn);
    const status=document.createElement('p');status.id='offlineDownloadStatus';status.className='microcopy';status.style.margin='8px 0 0';panel.parentNode.insertBefore(status,panel.nextSibling);
    btn.addEventListener('click',async()=>{
      btn.disabled=true;status.textContent='Préparation du parcours hors ligne…';
      try{const r=await downloadCurrentRoute();status.textContent=`Parcours disponible hors ligne · ${r.assets} ressource(s) mise(s) en cache.`;renderOfflineMap(!navigator.onLine)}catch(e){status.textContent=`Téléchargement hors ligne impossible : ${e.message||e}`}finally{btn.disabled=false}
    });
    try{const meta=JSON.parse(localStorage.getItem(META_KEY)||'null');if(meta)status.textContent=`Hors ligne prêt : ${meta.title}` }catch{}
  }

  function boot(){injectButton();renderOfflineMap();window.addEventListener('offline',()=>renderOfflineMap(true));window.addEventListener('online',()=>renderOfflineMap(false));}
  window.__POCKETGUIDE_OFFLINE__={downloadCurrentRoute,renderOfflineMap,makeSvg,keys:{PACK_KEY,MAP_KEY,META_KEY}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

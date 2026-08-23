(()=>{
  const nativeFetch=window.fetch.bind(window);
  const nativeStorage={
    getItem:Storage.prototype.getItem,
    setItem:Storage.prototype.setItem,
    removeItem:Storage.prototype.removeItem
  };
  let resolved=null;
  let storageScoped=false;

  if(window.L?.map&&!window.L.map.__pocketGuideWrapped){
    const nativeMap=window.L.map.bind(window.L);
    const wrapped=(...args)=>{
      const instance=nativeMap(...args);
      window.__POCKETGUIDE_LEAFLET_MAP__=instance;
      return instance;
    };
    wrapped.__pocketGuideWrapped=true;
    window.L.map=wrapped;
  }

  function scopeStorage(routeId){
    if(storageScoped)return;
    storageScoped=true;
    const mapKey=key=>typeof key==='string'&&key.startsWith('st-')?`pg:${routeId}:${key}`:key;
    Storage.prototype.getItem=function(key){return nativeStorage.getItem.call(this,this===localStorage?mapKey(key):key)};
    Storage.prototype.setItem=function(key,value){return nativeStorage.setItem.call(this,this===localStorage?mapKey(key):key,value)};
    Storage.prototype.removeItem=function(key){return nativeStorage.removeItem.call(this,this===localStorage?mapKey(key):key)};
  }

  function setText(selector,text){const el=document.querySelector(selector);if(el)el.textContent=text}
  function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}

  function routePointsForDay(pack,date){
    const byId=Object.fromEntries((pack.places||[]).map(p=>[p.id,p]));
    const day=(pack.days||[]).find(d=>d.date===date)||(pack.days||[])[0];
    return (day?.events||[]).map(e=>byId[e.placeId]).filter(p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  }

  function markerPopup(place){
    const image=place.heroImage?`<img src="${esc(place.heroImage)}" alt="" style="display:block;width:100%;height:110px;object-fit:cover;border-radius:10px;margin:0 0 8px">`:'';
    const attribution=place.imageAttribution?.source?`<small style="display:block;opacity:.65;margin-top:5px">Photo · ${esc(place.imageAttribution.source)}${place.imageAttribution.author?` · ${esc(place.imageAttribution.author)}`:''}</small>`:'';
    return `<div style="min-width:190px;max-width:250px">${image}<strong>${esc(place.icon||'📍')} ${esc(place.name)}</strong><p style="margin:.4em 0">${esc(place.description||place.note||'')}</p>${attribution}</div>`;
  }

  function repairGenericMap(runtime){
    const {pack}=runtime;
    if(!window.L)return;
    let tries=0;
    const apply=()=>{
      const map=window.__POCKETGUIDE_LEAFLET_MAP__;
      if(!map){if(tries++<100)setTimeout(apply,75);return}
      const places=(pack.places||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
      if(!places.length)return;
      map.invalidateSize?.();
      const bounds=window.L.latLngBounds(places.map(p=>[p.lat,p.lng]));
      if(bounds.isValid())map.fitBounds(bounds.pad(.18),{maxZoom:16});

      window.__POCKETGUIDE_GENERIC_MARKERS__?.remove?.();
      const markerLayer=window.L.layerGroup().addTo(map);
      for(const place of places){
        const marker=window.L.circleMarker([place.lat,place.lng],{radius:9,weight:3,opacity:.95,fillOpacity:.82});
        marker.bindPopup(markerPopup(place),{maxWidth:270});
        marker.bindTooltip(place.name,{direction:'top',offset:[0,-7]});
        marker.addTo(markerLayer);
      }
      window.__POCKETGUIDE_GENERIC_MARKERS__=markerLayer;

      const selected=document.querySelector('#daySwitch .is-active')?.dataset.day||pack.days?.[0]?.date;
      const points=routePointsForDay(pack,selected);
      window.__POCKETGUIDE_GENERIC_ROUTE__?.remove?.();
      if(points.length>1){
        window.__POCKETGUIDE_GENERIC_ROUTE__=window.L.polyline(points.map(p=>[p.lat,p.lng]),{weight:4,opacity:.72,dashArray:'10,7'}).addTo(map);
      }
      document.documentElement.dataset.mapRoutePack='ready';
    };
    apply();
    document.querySelector('#daySwitch')?.addEventListener('click',()=>setTimeout(apply,80));
  }

  function mediaCard(media){
    const credit=[media.author,media.license].filter(Boolean).join(' · ');
    return `<figure style="margin:0;min-width:145px;max-width:190px;scroll-snap-align:start"><img src="${esc(media.url)}" alt="" loading="lazy" decoding="async" style="width:100%;height:120px;object-fit:cover;border-radius:12px;display:block"><figcaption style="font-size:.72rem;line-height:1.25;margin-top:5px;opacity:.72">${esc(media.source||'Wikimedia Commons')}${credit?` · ${esc(credit)}`:''}</figcaption></figure>`;
  }

  function installMediaGallery(runtime){
    const host=document.querySelector('#dialogContent');if(!host)return;
    const render=()=>{
      if(host.querySelector('.pg-media-gallery'))return;
      const content=(host.textContent||'').toLocaleLowerCase('fr-FR');
      const place=(runtime.pack.places||[]).find(p=>p?.name&&content.includes(String(p.name).toLocaleLowerCase('fr-FR')));
      if(!place)return;
      const media=(Array.isArray(place.media)?place.media:[]).filter(m=>m?.url);
      if(!media.length&&place.heroImage)media.push({url:place.heroImage,source:place.imageAttribution?.source||'Photo du lieu',author:place.imageAttribution?.author||'',license:place.imageAttribution?.license||''});
      if(!media.length)return;
      const section=document.createElement('section');
      section.className='pg-media-gallery';
      section.innerHTML=`<h4 style="margin:18px 0 8px">Photos du lieu</h4><div style="display:flex;gap:10px;overflow:auto;padding-bottom:8px;scroll-snap-type:x mandatory">${media.map(mediaCard).join('')}</div>`;
      host.append(section);
    };
    new MutationObserver(()=>setTimeout(render,0)).observe(host,{childList:true,subtree:true,characterData:true});
    document.querySelector('#placeDialog')?.addEventListener('toggle',render);
  }

  async function installRouteControls(runtime){
    const actions=document.querySelector('.topbar__actions');if(!actions||document.querySelector('#pgRouteLibrary'))return;
    const libraryLink=document.createElement('a');
    libraryLink.id='pgRouteLibrary';
    libraryLink.href='studio-148.html#library';
    libraryLink.textContent='Mes itinéraires';
    libraryLink.style.cssText='text-decoration:none;border-radius:999px;padding:9px 12px;background:#e7eceb;color:#103f4a;font:800 .78rem system-ui,sans-serif';
    const save=document.createElement('button');
    save.id='pgSaveRoute';save.type='button';save.textContent='💾';save.title='Sauvegarder cet itinéraire';save.className='icon-btn';
    save.onclick=async()=>{
      try{const lib=await import('./route-library.js');lib.saveRoutePack(runtime.pack,{source:'engine-1.4.8'});save.textContent='✓';setTimeout(()=>save.textContent='💾',1800)}catch{save.textContent='!';setTimeout(()=>save.textContent='💾',1800)}
    };
    actions.prepend(libraryLink);actions.prepend(save);
  }

  function markEngineRuntime(runtime){
    const {pack,route}=runtime;
    setText('#today .hero__meta > div:nth-child(3) span','V1.4.8');
    setText('#today .hero__meta > div:nth-child(3) small','RoutePack média');
    const hero=document.querySelector('#today .hero__content');
    if(hero&&!document.querySelector('#engineRuntimeBadge')){
      const badge=document.createElement('div');
      badge.id='engineRuntimeBadge';badge.setAttribute('role','status');badge.textContent=`POCKETGUIDE V1.4.8 · ${route.id}`;
      badge.style.cssText='display:inline-flex;align-items:center;max-width:100%;margin:0 0 14px;padding:8px 12px;border-radius:999px;background:#103f4a;color:#fff;font:800 .72rem/1.1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;box-shadow:0 8px 24px rgba(6,23,28,.18)';
      hero.prepend(badge);
    }
    const arStatus=document.querySelector('#arXRStatus');if(arStatus)arStatus.title='Moteur AR terrain exécuté dans PocketGuide V1.4.8';
    document.documentElement.dataset.engineVersion='1.4.8';document.documentElement.dataset.routePackVersion=pack.schemaVersion;
  }

  function decorateGeneric(runtime){
    const {pack,data}=runtime;
    const heroKicker=document.querySelector('#today .hero__content > .kicker');
    if(heroKicker)heroKicker.textContent=[pack.start&&pack.end?`${pack.start} → ${pack.end}`:pack.days?.[0]?.date,pack.timezone].filter(Boolean).join(' · ');
    setText('#today .hero__meta > div:nth-child(2) span',String(pack.travelers||1));
    const map=document.querySelector('#map');if(map)map.setAttribute('aria-label',`Carte dynamique du parcours ${pack.title}`);
    const offlineTab=document.querySelector('#tabOffline'),offlinePanel=document.querySelector('#offlineMapPanel');if(offlineTab)offlineTab.hidden=true;if(offlinePanel)offlinePanel.hidden=true;
    const music=document.querySelector('#music');if(!(data.playlist||[]).length){if(music)music.hidden=true}else{setText('#music h2','Playlist du parcours');setText('#music .music-note',`${data.playlist.length} titre${data.playlist.length>1?'s':''}`)}
    const travel=document.querySelector('#travel .practical-grid');
    if(travel)travel.innerHTML=`<article class="info-card info-card--accent"><span class="info-icon">🧭</span><div><h3>Parcours chargé</h3><p>${esc(pack.title)}</p><span class="info-status">RoutePack ${esc(pack.schemaVersion)} · V1.4.8</span></div></article><article class="info-card"><span class="info-icon">🗺️</span><div><h3>Carte dynamique</h3><p>OpenStreetMap + GPS + ${(pack.places||[]).length} repères</p></div></article><article class="info-card"><span class="info-icon">📷</span><div><h3>Photos</h3><p>${(pack.places||[]).filter(p=>p.heroImage).length}/${(pack.places||[]).length} lieux illustrés</p></div></article><article class="info-card"><span class="info-icon">💾</span><div><h3>Sauvegarde</h3><p>Disponible dans Mes itinéraires</p></div></article>`;
    const contact=document.querySelector('#travel .contact-strip');if(contact)contact.hidden=true;
    repairGenericMap(runtime);installMediaGallery(runtime);void installRouteControls(runtime);
  }

  function decorate(runtime){
    const {pack,route}=runtime;
    document.documentElement.dataset.pocketGuideEngine='1.4.8';document.documentElement.dataset.routeId=route.id;
    document.title=`${pack.title} · PocketGuide V1.4.8`;
    const brand=document.querySelector('.brand');if(brand){const strong=brand.querySelector('strong'),small=brand.querySelector('small'),mark=brand.querySelector('.brand__mark');if(strong)strong.textContent=pack.title;if(small)small.textContent='PocketGuide · V1.4.8';if(mark)mark.textContent=(pack.title.match(/[A-Za-zÀ-ÿ0-9]/g)||['P','G']).slice(0,2).join('').toUpperCase()}
    const arStage=document.querySelector('#arStage');if(arStage)arStage.setAttribute('aria-label',`Réalité augmentée · ${pack.title}`);
    const share=document.querySelector('#shareTrip');if(share)share.title=`Partager ${pack.title}`;
    markEngineRuntime(runtime);
    if(route.id!=='santa-teresa')decorateGeneric(runtime);else void installRouteControls(runtime);
    window.dispatchEvent(new CustomEvent('pocketguiderouteloaded',{detail:{id:route.id,title:pack.title}}));
  }

  const ready=(async()=>{
    const mod=await import('./route-runtime.js');
    const runtime=await mod.loadPocketGuideRoute({fetchImpl:nativeFetch,locationLike:window.location});
    resolved=runtime;scopeStorage(runtime.route.id);window.__POCKETGUIDE_ROUTE__=runtime;
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>decorate(runtime),{once:true});else decorate(runtime);
    return runtime;
  })();

  window.__POCKETGUIDE_ROUTE_READY__=ready;
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:input?.url||'';let pathname='';try{pathname=new URL(url,location.href).pathname}catch{}
    if(pathname.endsWith('/data/trip.json')||url==='./data/trip.json'){
      const runtime=resolved||await ready;const body=JSON.stringify(runtime.data);
      return new Response(body,{status:200,headers:{'Content-Type':'application/json','X-PocketGuide-Route':runtime.route.id}});
    }
    return nativeFetch(input,init);
  };
})();

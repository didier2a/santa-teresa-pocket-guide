(()=>{
  const nativeFetch=window.fetch.bind(window);
  const nativeStorage={
    getItem:Storage.prototype.getItem,
    setItem:Storage.prototype.setItem,
    removeItem:Storage.prototype.removeItem
  };
  let resolved=null;
  let storageScoped=false;

  function scopeStorage(routeId){
    if(storageScoped)return;
    storageScoped=true;
    const mapKey=key=>typeof key==='string'&&key.startsWith('st-')?`pg:${routeId}:${key}`:key;
    Storage.prototype.getItem=function(key){return nativeStorage.getItem.call(this,this===localStorage?mapKey(key):key)};
    Storage.prototype.setItem=function(key,value){return nativeStorage.setItem.call(this,this===localStorage?mapKey(key):key,value)};
    Storage.prototype.removeItem=function(key){return nativeStorage.removeItem.call(this,this===localStorage?mapKey(key):key)};
  }

  function setText(selector,text){const el=document.querySelector(selector);if(el)el.textContent=text}

  function markEngineRuntime(runtime){
    const {pack,route}=runtime;
    setText('#today .hero__meta > div:nth-child(3) span','Engine V1.1');
    setText('#today .hero__meta > div:nth-child(3) small','RoutePack V1');
    const hero=document.querySelector('#today .hero__content');
    if(hero&&!document.querySelector('#engineRuntimeBadge')){
      const badge=document.createElement('div');
      badge.id='engineRuntimeBadge';
      badge.setAttribute('role','status');
      badge.textContent=`POCKETGUIDE ENGINE V1.1 · ${route.id}`;
      badge.style.cssText='display:inline-flex;align-items:center;max-width:100%;margin:0 0 14px;padding:8px 12px;border-radius:999px;background:#103f4a;color:#fff;font:800 .72rem/1.1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;box-shadow:0 8px 24px rgba(6,23,28,.18)';
      hero.prepend(badge);
    }
    const arStatus=document.querySelector('#arXRStatus');
    if(arStatus)arStatus.title='Moteur AR terrain V6.0.8 exécuté dans PocketGuide Engine V1.1';
    document.documentElement.dataset.engineVersion='1.1';
    document.documentElement.dataset.routePackVersion=pack.schemaVersion;
  }

  function decorateGeneric(runtime){
    const {pack,data}=runtime;
    const heroKicker=document.querySelector('#today .hero__content > .kicker');
    if(heroKicker)heroKicker.textContent=[pack.start&&pack.end?`${pack.start} → ${pack.end}`:pack.days?.[0]?.date,pack.timezone].filter(Boolean).join(' · ');
    setText('#today .hero__meta > div:nth-child(2) span',String(pack.travelers||1));
    const map=document.querySelector('#map');if(map)map.setAttribute('aria-label',`Carte du parcours ${pack.title}`);
    const offlineTab=document.querySelector('#tabOffline');
    const offlinePanel=document.querySelector('#offlineMapPanel');
    if(offlineTab)offlineTab.hidden=true;
    if(offlinePanel)offlinePanel.hidden=true;
    const music=document.querySelector('#music');
    if(!(data.playlist||[]).length){if(music)music.hidden=true}else{
      setText('#music h2','Playlist du parcours');
      setText('#music .music-note',`${data.playlist.length} titre${data.playlist.length>1?'s':''}`);
    }
    const travel=document.querySelector('#travel .practical-grid');
    if(travel)travel.innerHTML=`<article class="info-card info-card--accent"><span class="info-icon">🧭</span><div><h3>Parcours chargé</h3><p>${pack.title}</p><span class="info-status">RoutePack ${pack.schemaVersion} validé</span></div></article><article class="info-card"><span class="info-icon">🕒</span><div><h3>Fuseau horaire</h3><p>${pack.timezone}</p></div></article><article class="info-card"><span class="info-icon">👥</span><div><h3>Voyageurs</h3><p>${pack.travelers||1}</p></div></article><article class="info-card"><span class="info-icon">📍</span><div><h3>Repères</h3><p>${(pack.places||[]).length} lieu${(pack.places||[]).length>1?'x':''} · ${(pack.days||[]).length} jour${(pack.days||[]).length>1?'s':''}</p></div></article>`;
    const contact=document.querySelector('#travel .contact-strip');if(contact)contact.hidden=true;
  }

  function decorate(runtime){
    const {pack,route}=runtime;
    document.documentElement.dataset.pocketGuideEngine='1.1';
    document.documentElement.dataset.routeId=route.id;
    document.title=`${pack.title} · PocketGuide Engine V1.1`;
    const brand=document.querySelector('.brand');
    if(brand){
      const strong=brand.querySelector('strong');
      const small=brand.querySelector('small');
      const mark=brand.querySelector('.brand__mark');
      if(strong)strong.textContent=pack.title;
      if(small)small.textContent='PocketGuide Engine · V1.1';
      if(mark)mark.textContent=(pack.title.match(/[A-Za-zÀ-ÿ0-9]/g)||['P','G']).slice(0,2).join('').toUpperCase();
    }
    const arStage=document.querySelector('#arStage');
    if(arStage)arStage.setAttribute('aria-label',`Réalité augmentée · ${pack.title}`);
    const share=document.querySelector('#shareTrip');
    if(share)share.title=`Partager ${pack.title}`;
    markEngineRuntime(runtime);
    if(route.id!=='santa-teresa')decorateGeneric(runtime);
    window.dispatchEvent(new CustomEvent('pocketguiderouteloaded',{detail:{id:route.id,title:pack.title}}));
  }

  const ready=(async()=>{
    const mod=await import('./route-runtime.js');
    const runtime=await mod.loadPocketGuideRoute({fetchImpl:nativeFetch,locationLike:window.location});
    resolved=runtime;
    scopeStorage(runtime.route.id);
    window.__POCKETGUIDE_ROUTE__=runtime;
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>decorate(runtime),{once:true});
    else decorate(runtime);
    return runtime;
  })();

  window.__POCKETGUIDE_ROUTE_READY__=ready;
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:input?.url||'';
    let pathname='';
    try{pathname=new URL(url,location.href).pathname}catch{}
    if(pathname.endsWith('/data/trip.json')||url==='./data/trip.json'){
      const runtime=resolved||await ready;
      const body=JSON.stringify(runtime.data);
      return new Response(body,{status:200,headers:{'Content-Type':'application/json','X-PocketGuide-Route':runtime.route.id}});
    }
    return nativeFetch(input,init);
  };
})();

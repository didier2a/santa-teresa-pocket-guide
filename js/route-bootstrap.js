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

  function decorate(runtime){
    const {pack,route}=runtime;
    document.documentElement.dataset.pocketGuideEngine='1.1';
    document.documentElement.dataset.routeId=route.id;
    document.title=`${pack.title} · PocketGuide`;
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

const ACTIVE_ROUTE_KEY='pg4-active-route-v1';
const OFFLINE_CACHE='pocketguide-v4-route-assets-v1';

export class OfflineAdapter{
  constructor({storage=globalThis.localStorage,cacheStorage=globalThis.caches}={}){this.storage=storage;this.cacheStorage=cacheStorage;}
  async prepare(pack,{signal}={}){
    if(!pack?.id)throw new Error('RoutePack hors ligne absent');
    this.storage?.setItem?.(ACTIVE_ROUTE_KEY,JSON.stringify({pack,preparedAt:new Date().toISOString()}));
    const urls=(pack.places||[]).flatMap(place=>[place.heroImage,...(place.media||[]).map(item=>item.url)]).filter(url=>/^https?:/i.test(url));let cached=0;
    if(this.cacheStorage?.open){
      const cache=await this.cacheStorage.open(OFFLINE_CACHE);
      for(const url of [...new Set(urls)]){if(signal?.aborted)throw signal.reason;try{const response=await fetch(url,{signal,mode:'cors'});if(response.ok){await cache.put(url,response.clone());cached+=1}}catch{}}
    }
    return{routeId:pack.id,stored:true,assetsRequested:urls.length,assetsCached:cached,degraded:cached<urls.length};
  }
  restore(){try{return JSON.parse(this.storage?.getItem?.(ACTIVE_ROUTE_KEY)||'null')?.pack||null}catch{return null}}
}

export {ACTIVE_ROUTE_KEY,OFFLINE_CACHE};


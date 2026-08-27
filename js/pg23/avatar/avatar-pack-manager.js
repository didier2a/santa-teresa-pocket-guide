import {eventBus} from '../../pg16/core/event-bus.js';

const PREFIX='pocketguide-local-avatar-v';
const INSTALLED_KEY='pocketguide.avatar.pack.v1';
const absolute=url=>new URL(url,globalThis.document?.baseURI||globalThis.location?.href||'http://localhost/').href;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function digest(response){
  if(!globalThis.crypto?.subtle)return'';
  const buffer=await response.clone().arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buffer);
  return[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export class AvatarPackManager{
  constructor({fetchImpl=globalThis.fetch,cacheStorage=globalThis.caches,storage=globalThis.localStorage,bus=eventBus,timeoutMs=18000,retries=1,concurrency=4}={}){this.fetchImpl=typeof fetchImpl==='function'?fetchImpl.bind(globalThis):null;this.cacheStorage=cacheStorage;this.storage=storage;this.bus=bus;this.timeoutMs=timeoutMs;this.retries=retries;this.concurrency=concurrency;}
  async fetchWithRetry(url,{cache='no-store'}={}){
    let lastError;
    for(let attempt=0;attempt<=this.retries;attempt+=1){
      const controller=typeof AbortController==='function'?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),this.timeoutMs):0;
      try{const response=await this.fetchImpl(url,{cache,signal:controller?.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response;}
      catch(error){lastError=error;if(attempt<this.retries)await pause(300*(attempt+1));}
      finally{if(timer)clearTimeout(timer);}
    }
    throw new Error(`Téléchargement impossible : ${url} (${String(lastError?.message||lastError)})`);
  }
  async readManifest(url){const response=await this.fetchWithRetry(url);return response.json();}
  async capacity(requiredBytes){
    const estimate=await globalThis.navigator?.storage?.estimate?.().catch?.(()=>null),available=estimate&&Number.isFinite(estimate.quota)?Math.max(0,estimate.quota-(estimate.usage||0)):null;
    return{requiredBytes,availableBytes:available,ok:available==null||available>=requiredBytes*1.35};
  }
  async verifiedResponse(asset,url,target){
    let response=await target.match(url);
    if(!response)response=await this.fetchWithRetry(url);
    if(asset.sha256){const actual=await digest(response);if(actual!==asset.sha256){await target.delete(url);response=await this.fetchWithRetry(url);const retried=await digest(response);if(retried!==asset.sha256)throw new Error(`Empreinte avatar invalide : ${asset.url}`);}}
    return response;
  }
  async install(manifestUrl,{onProgress}={}){
    if(!this.fetchImpl||!this.cacheStorage)return{installed:false,reason:'cache-unavailable'};
    const manifest=await this.readManifest(manifestUrl);
    if(!manifest.ready||!manifest.model?.available)return{installed:false,reason:'model-pending',manifest};
    const assets=[...(manifest.assets||[]),manifest.model].filter(item=>item?.url),requiredBytes=assets.reduce((sum,item)=>sum+(Number(item.bytes)||0),0),capacity=await this.capacity(requiredBytes);
    if(!capacity.ok)return{installed:false,reason:'storage-insufficient',capacity,manifest};
    await globalThis.navigator?.storage?.persist?.().catch?.(()=>false);
    const cacheName=String(manifest.cacheName||`${PREFIX}${manifest.version}`),stagingName=`${cacheName}-staging`,target=await this.cacheStorage.open(cacheName),staging=await this.cacheStorage.open(stagingName);
    let cursor=0,completed=0;
    try{
      const worker=async()=>{while(true){const position=cursor++;if(position>=assets.length)return;const asset=assets[position],url=absolute(asset.url),response=await this.verifiedResponse(asset,url,target);await staging.put(url,response.clone());completed+=1;const progress={index:completed,total:assets.length,url:asset.url,bytes:Number(asset.bytes)||0};onProgress?.(progress);this.bus.emit('pg23.avatar.pack.progress',progress);}};
      const results=await Promise.allSettled(Array.from({length:Math.min(this.concurrency,assets.length)},worker)),failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
      const keys=await staging.keys();for(const request of keys){const response=await staging.match(request);if(response)await target.put(request,response);}
      this.storage?.setItem?.(INSTALLED_KEY,JSON.stringify({version:String(manifest.version),cacheName,installedAt:new Date().toISOString()}));
      await this.cacheStorage.delete(stagingName);for(const key of await this.cacheStorage.keys())if(key.startsWith(PREFIX)&&key!==cacheName)await this.cacheStorage.delete(key);
      const result={installed:true,manifest,cacheName,capacity};this.bus.emit('pg23.avatar.pack.ready',result);return result;
    }catch(error){await this.cacheStorage.delete(stagingName);this.bus.emit('pg23.avatar.pack.failed',{message:String(error?.message||error)});return{installed:false,reason:'download-failed',error,manifest};}
  }
  installed(){try{return JSON.parse(this.storage?.getItem?.(INSTALLED_KEY)||'null');}catch{return null;}}
}

export const avatarPackManager=new AvatarPackManager();

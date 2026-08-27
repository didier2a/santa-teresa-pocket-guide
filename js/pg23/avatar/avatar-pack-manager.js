import {eventBus} from '../../pg16/core/event-bus.js';

const PREFIX='pocketguide-local-avatar-v';
const INSTALLED_KEY='pocketguide.avatar.pack.v1';
const absolute=url=>new URL(url,globalThis.document?.baseURI||globalThis.location?.href||'http://localhost/').href;

async function digest(response){
  if(!globalThis.crypto?.subtle)return'';
  const buffer=await response.clone().arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buffer);
  return[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export class AvatarPackManager{
  constructor({fetchImpl=globalThis.fetch,cacheStorage=globalThis.caches,storage=globalThis.localStorage,bus=eventBus}={}){this.fetchImpl=fetchImpl;this.cacheStorage=cacheStorage;this.storage=storage;this.bus=bus;}
  async readManifest(url){const response=await this.fetchImpl(url,{cache:'no-store'});if(!response.ok)throw new Error(`Manifeste avatar indisponible (${response.status})`);return response.json();}
  async capacity(requiredBytes){
    const estimate=await globalThis.navigator?.storage?.estimate?.().catch?.(()=>null),available=estimate&&Number.isFinite(estimate.quota)?Math.max(0,estimate.quota-(estimate.usage||0)):null;
    return{requiredBytes,availableBytes:available,ok:available==null||available>=requiredBytes*1.35};
  }
  async install(manifestUrl,{onProgress}={}){
    if(!this.fetchImpl||!this.cacheStorage)return{installed:false,reason:'cache-unavailable'};
    const manifest=await this.readManifest(manifestUrl);
    if(!manifest.ready||!manifest.model?.available)return{installed:false,reason:'model-pending',manifest};
    const assets=[...(manifest.assets||[]),manifest.model].filter(item=>item?.url),requiredBytes=assets.reduce((sum,item)=>sum+(Number(item.bytes)||0),0),capacity=await this.capacity(requiredBytes);
    if(!capacity.ok)return{installed:false,reason:'storage-insufficient',capacity,manifest};
    await globalThis.navigator?.storage?.persist?.().catch?.(()=>false);
    const cacheName=String(manifest.cacheName||`${PREFIX}${manifest.version}`),stagingName=`${cacheName}-staging`,staging=await this.cacheStorage.open(stagingName);
    try{
      for(let index=0;index<assets.length;index+=1){const asset=assets[index],url=absolute(asset.url),response=await this.fetchImpl(url,{cache:'no-store'});if(!response.ok)throw new Error(`Asset avatar indisponible (${response.status}) : ${asset.url}`);if(asset.sha256){const actual=await digest(response);if(actual!==asset.sha256)throw new Error(`Empreinte avatar invalide : ${asset.url}`);}await staging.put(url,response.clone());const progress={index:index+1,total:assets.length,url:asset.url,bytes:Number(asset.bytes)||0};onProgress?.(progress);this.bus.emit('pg23.avatar.pack.progress',progress);}
      const target=await this.cacheStorage.open(cacheName),keys=await staging.keys();for(const request of keys){const response=await staging.match(request);if(response)await target.put(request,response);}
      this.storage?.setItem?.(INSTALLED_KEY,JSON.stringify({version:String(manifest.version),cacheName,installedAt:new Date().toISOString()}));
      await this.cacheStorage.delete(stagingName);for(const key of await this.cacheStorage.keys())if(key.startsWith(PREFIX)&&key!==cacheName)await this.cacheStorage.delete(key);
      const result={installed:true,manifest,cacheName,capacity};this.bus.emit('pg23.avatar.pack.ready',result);return result;
    }catch(error){await this.cacheStorage.delete(stagingName);this.bus.emit('pg23.avatar.pack.failed',{message:String(error?.message||error)});return{installed:false,reason:'download-failed',error,manifest};}
  }
  installed(){try{return JSON.parse(this.storage?.getItem?.(INSTALLED_KEY)||'null');}catch{return null;}}
}

export const avatarPackManager=new AvatarPackManager();

import {deleteSavedRoute,listSavedRoutes,loadSavedRoute,saveRoutePack} from '../../route-library.js';
import {validateRoutePack} from '../../../engine/routepack.js';

const ACTIVE_ROUTE_KEY='pg4-active-route-v1';
const LEGACY_PACK_KEY='pg152-offline-pack';
const OFFLINE_MAP_KEY='pg4-offline-map-v152';
const OFFLINE_META_KEY='pg4-offline-meta-v152';
const OFFLINE_CACHE='pocketguide-v4-route-assets-v152';
const APP_ASSETS=['./pocketguide-v4.html','./pocketguide-v4.css','./manifest-v4.webmanifest','./service-worker.js','./js/pg4/bootstrap/app.js','./js/pg4/adapters/offline-adapter.js','./js/pg4/adapters/terrain-adapter.js','./js/pg4/adapters/route-state-adapter.js','./js/companion-sdk/companion-web-sdk.js','./js/ar-core.js','./js/route-library.js','./engine/routepack.js'];

function escapeXml(value=''){return String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
function bounds(places){const points=places.filter(place=>Number.isFinite(place.lat)&&Number.isFinite(place.lng));if(!points.length)return null;return{minLat:Math.min(...points.map(place=>place.lat)),maxLat:Math.max(...points.map(place=>place.lat)),minLng:Math.min(...points.map(place=>place.lng)),maxLng:Math.max(...points.map(place=>place.lng))};}
function makeSvg(pack){
  const places=(pack?.places||[]).filter(place=>Number.isFinite(place.lat)&&Number.isFinite(place.lng)),box=bounds(places);if(!box)return'';
  const width=900,height=560,padding=64,dx=Math.max(.0001,box.maxLng-box.minLng),dy=Math.max(.0001,box.maxLat-box.minLat),xy=place=>({x:padding+(place.lng-box.minLng)/dx*(width-padding*2),y:height-padding-(place.lat-box.minLat)/dy*(height-padding*2)}),points=places.map(xy),line=points.map(point=>`${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),nodes=places.map((place,index)=>{const point=points[index];return`<g><circle cx="${point.x}" cy="${point.y}" r="13" fill="#eacb82" stroke="#041316" stroke-width="5"/><text x="${point.x+20}" y="${point.y+5}" fill="#f5f5ee" font-size="22" font-family="system-ui,sans-serif">${escapeXml(place.name)}</text></g>`;}).join('');
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Carte hors ligne du parcours"><rect width="100%" height="100%" rx="28" fill="#0b2429"/><polyline points="${line}" fill="none" stroke="#79dccf" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="12 10"/>${nodes}<text x="${padding}" y="42" fill="#a9bbb7" font-size="20" font-family="system-ui,sans-serif">PocketGuide V4 · base terrain 1.5.2</text></svg>`;
}

export class OfflineAdapter{
  constructor({storage=globalThis.localStorage,cacheStorage=globalThis.caches}={}){this.storage=storage;this.cacheStorage=cacheStorage;}
  async prepare(pack,{signal}={}){
    if(!pack?.id)throw new Error('RoutePack hors ligne absent');
    this.storage?.setItem?.(ACTIVE_ROUTE_KEY,JSON.stringify({pack,preparedAt:new Date().toISOString()}));
    this.storage?.setItem?.(LEGACY_PACK_KEY,JSON.stringify(pack));this.storage?.setItem?.(OFFLINE_MAP_KEY,makeSvg(pack));this.storage?.setItem?.(OFFLINE_META_KEY,JSON.stringify({id:pack.id,title:pack.title,downloadedAt:new Date().toISOString()}));saveRoutePack(pack,{source:'pocketguide-v4-offline',storage:this.storage});
    const media=(pack.places||[]).flatMap(place=>[place.heroImage,...(place.media||[]).map(item=>item.url)]).filter(url=>/^https?:/i.test(url)),urls=[...APP_ASSETS,...media];let cached=0;
    if(this.cacheStorage?.open){
      const cache=await this.cacheStorage.open(OFFLINE_CACHE);
      for(const url of [...new Set(urls)]){if(signal?.aborted)throw signal.reason;try{const response=await fetch(url,{signal,mode:url.startsWith('http')?'cors':'same-origin'});if(response.ok){await cache.put(url,response.clone());cached+=1}}catch{}}
    }
    return{routeId:pack.id,stored:true,assetsRequested:urls.length,assetsCached:cached,degraded:cached<APP_ASSETS.length,map:makeSvg(pack)};
  }
  restore(){try{return JSON.parse(this.storage?.getItem?.(ACTIVE_ROUTE_KEY)||'null')?.pack||JSON.parse(this.storage?.getItem?.(LEGACY_PACK_KEY)||'null')||null}catch{return null}}
  list(){return listSavedRoutes(this.storage);}
  openSaved(id){const pack=loadSavedRoute(id,this.storage);if(!pack)throw new Error('Parcours enregistré introuvable');return pack;}
  deleteSaved(id){return deleteSavedRoute(id,this.storage);}
  importPack(raw){const pack=typeof raw==='string'?JSON.parse(raw):raw,report=validateRoutePack(pack);if(!report.valid)throw new Error(`RoutePack invalide : ${report.errors.map(item=>item.code).join(', ')}`);saveRoutePack(pack,{source:'pocketguide-v4-import',storage:this.storage});return{pack,report};}
  exportPack(pack){if(!pack)throw new Error('Aucun parcours à exporter');return{filename:`${String(pack.id||'pocketguide-route').replace(/[^a-z0-9-]/gi,'-')}.json`,mimeType:'application/json',text:JSON.stringify(pack,null,2)};}
  offlineMap(){return this.storage?.getItem?.(OFFLINE_MAP_KEY)||'';}
}

export {ACTIVE_ROUTE_KEY,APP_ASSETS,LEGACY_PACK_KEY,OFFLINE_CACHE,OFFLINE_MAP_KEY,OFFLINE_META_KEY,makeSvg};

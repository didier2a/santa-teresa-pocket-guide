import {loadRoutePack} from '../engine/routepack.js';

const ROUTE_ID=/^[a-z0-9][a-z0-9-]{2,63}$/;

function normalizePlace(place={}){
  const p={...place};
  p.icon=p.icon||'📍';
  p.note=p.note||p.description||'';
  p.description=p.description||p.note||'';
  p.repere=p.repere||p.arCue||'';
  p.arCue=p.arCue||p.repere||'';
  p.historyShort=p.historyShort||'';
  p.historyLong=p.historyLong||'';
  p.heroImage=p.heroImage||'';
  p.walkingUrl=p.walkingUrl||`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
  p.waze=p.waze||`https://www.waze.com/ul?ll=${p.lat}%2C${p.lng}&navigate=yes`;
  return p;
}

export function routePackToAppData(pack,raw=null,{legacy=false}={}){
  if(legacy&&raw?.trip&&Array.isArray(raw.days)&&Array.isArray(raw.places))return raw;
  const places=(pack.places||[]).map(normalizePlace);
  return {
    trip:{title:pack.title,subtitle:pack.subtitle||'',version:`Engine ${pack.schemaVersion}`,start:pack.start||pack.days?.[0]?.date,end:pack.end||pack.days?.at(-1)?.date,timezone:pack.timezone,travelers:pack.travelers||1,routeId:pack.id},
    days:(pack.days||[]).map(day=>({...day,events:(day.events||[]).map(event=>({...event}))})),
    places,
    discover:(pack.discover||places.slice(0,6).map(p=>({placeId:p.id,title:p.name,icon:p.icon,text:p.description||p.note||'',image:p.heroImage}))),
    playlist:pack.playlist||[],checklist:pack.checklist||[],practical:pack.practical||{},offline:pack.offline||{},meta:pack.meta||{}
  };
}

export function requestedRouteId(locationLike=globalThis.location){try{const value=new URL(locationLike.href).searchParams.get('route');return value&&ROUTE_ID.test(value)?value:null}catch{return null}}

function b64urlEncode(text){const bytes=new TextEncoder().encode(text);let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function b64urlDecode(value){const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((value.length+3)%4);const bin=atob(padded);const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes)}
export function encodeSharedPack(pack){return b64urlEncode(JSON.stringify(pack))}
export function decodeSharedPack(value){if(!value||value.length>24000)throw new Error('RoutePack partagé trop volumineux');return JSON.parse(b64urlDecode(value))}
export function sharedPackFromLocation(locationLike=globalThis.location){try{const value=new URL(locationLike.href).searchParams.get('pack');return value?decodeSharedPack(value):null}catch{return null}}

export async function loadRouteRegistry({fetchImpl=fetch}={}){const response=await fetchImpl('./data/routes.json',{cache:'no-store'});if(!response.ok)throw new Error(`Registre de parcours indisponible (${response.status})`);const registry=await response.json();if(!registry||registry.schemaVersion!=='1.0'||!Array.isArray(registry.routes))throw new Error('Registre de parcours invalide');return registry}

export async function loadPocketGuideRoute({fetchImpl=fetch,locationLike=globalThis.location}={}){
  const shared=sharedPackFromLocation(locationLike);
  if(shared){
    const {pack,report}=await loadRoutePack(shared,{fetchImpl,allowLegacy:false});
    return {route:{id:pack.id,title:pack.title,format:'routepack',shared:true,enabled:true},registry:null,pack,report,data:routePackToAppData(pack),requested:true,shared:true};
  }
  const registry=await loadRouteRegistry({fetchImpl});
  const requested=requestedRouteId(locationLike);const id=requested||registry.defaultRoute;const route=registry.routes.find(r=>r.id===id&&r.enabled!==false);
  if(!route){const error=new Error(`Parcours inconnu : ${id}`);error.code='ROUTE_NOT_FOUND';error.routeId=id;throw error}
  if(!route.source||typeof route.source!=='string')throw new Error(`Source absente pour le parcours ${route.id}`);
  const rawResponse=await fetchImpl(route.source,{cache:'no-store'});if(!rawResponse.ok)throw new Error(`Parcours ${route.id} indisponible (${rawResponse.status})`);const raw=await rawResponse.json();
  const {pack,report}=await loadRoutePack(raw,{fetchImpl,allowLegacy:route.format!=='routepack'});if(pack.id!==route.id&&route.format==='routepack')throw new Error(`Le RoutePack ${pack.id} ne correspond pas au registre ${route.id}`);
  return {route,registry,pack,report,data:routePackToAppData(pack,raw,{legacy:route.format!=='routepack'}),requested:Boolean(requested),shared:false};
}

export function routeShareUrl(routeId,locationLike=globalThis.location){const url=new URL(locationLike.href);url.searchParams.delete('pack');url.searchParams.set('route',routeId);url.hash='';return url.toString()}
export function packShareUrl(pack,locationLike=globalThis.location){const url=new URL(locationLike.href);url.pathname=url.pathname.replace(/[^/]*$/,'engine.html');url.search='';url.searchParams.set('pack',encodeSharedPack(pack));url.hash='';return url.toString()}

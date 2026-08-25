import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {itineraryStore} from '../storage/itinerary-store.js';

function clone(value){return typeof globalThis.structuredClone==='function'?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));}
function now(){return new Date().toISOString();}
function routeEvents(pack){return (pack?.days||[]).flatMap(day=>day.events||[]);}
function routeFingerprint(pack){return JSON.stringify(pack||null);}
function safeId(value='itineraire'){return String(value||'itineraire').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'itineraire';}
function statusFromRoute(route){if(!route?.currentEventId&&route?.completedEventIds?.length)return'completed';if(route?.completedEventIds?.length||route?.skippedEventIds?.length)return'in_progress';return'planned';}
function progressFromRoute(route){return {currentEventId:route?.currentEventId||null,nextEventId:route?.nextEventId||null,completedEventIds:[...(route?.completedEventIds||[])],skippedEventIds:[...(route?.skippedEventIds||[])],remainingMinutes:route?.remainingMinutes??null};}
function coverFromPack(pack){return (pack?.places||[]).find(place=>place?.heroImage)?.heroImage||'';}

export function itineraryRecordFromRoute(route,{existing=null,reason='autosave'}={}){
  if(!route?.pack?.id||!route.pack.title)throw new Error('Aucun RoutePack valide à sauvegarder.');
  const timestamp=now(),fingerprint=routeFingerprint(route.pack),changed=Boolean(existing&&existing.routeFingerprint!==fingerprint);
  return {
    id:route.activeId||route.pack.id,
    label:existing?.label||route.title||route.pack.title,
    title:route.pack.title,
    status:statusFromRoute(route),
    archivedAt:existing?.archivedAt||null,
    createdAt:existing?.createdAt||timestamp,
    updatedAt:timestamp,
    lastOpenedAt:existing?.lastOpenedAt||timestamp,
    savedReason:reason,
    revision:existing?Math.max(1,Number(existing.revision)||1)+(changed?1:0):1,
    routeFingerprint:fingerprint,
    routePack:clone(route.pack),
    progress:progressFromRoute(route),
    stats:{poiCount:routeEvents(route.pack).length,placeCount:route.pack.places?.length||0,mediaCount:existing?.stats?.mediaCount||0},
    cover:changed?coverFromPack(route.pack):(existing?.cover||coverFromPack(route.pack)),
    source:existing?.source||'pocketguide-v18-local'
  };
}

export class ItineraryManager{
  constructor({store=itineraryStore,debounceMs=180}={}){this.store=store;this.debounceMs=debounceMs;this.timer=null;this.started=false;this.unsubs=[];this.pendingReason=null;this.onStatus=null;}
  currentId(){return pocketGuideState.select('route.activeId')||pocketGuideState.select('route.pack.id')||null;}
  status(type,detail={}){const payload={type,at:now(),...detail};eventBus.emit('itinerary.status',payload);this.onStatus?.(payload);return payload;}
  async saveCurrent(reason='autosave'){
    const route=pocketGuideState.select('route');if(!route?.pack?.id)return null;
    let id=route.activeId||route.pack.id,existing=await this.store.getItinerary(id);
    if(existing?.status==='completed'&&existing.routeFingerprint!==routeFingerprint(route.pack)){
      id=`${safeId(id)}-revision-${Date.now().toString(36)}`;const pack={...clone(route.pack),id};pocketGuideState.patch({route:{activeId:id,pack}},{source:'pg18-itinerary-manager',event:'route.version.forked'});existing=null;
    }
    const currentRoute=pocketGuideState.select('route'),record=itineraryRecordFromRoute({...currentRoute,activeId:id},{existing,reason});
    await this.store.saveItinerary(record);this.status('saved',{id:record.id,reason,revision:record.revision});return record;
  }
  schedule(reason='autosave'){
    this.pendingReason=reason;if(this.timer)clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.timer=null;const pending=this.pendingReason;this.pendingReason=null;this.saveCurrent(pending).catch(error=>this.status('error',{message:error.message}));},this.debounceMs);
  }
  async flush(){if(this.timer){clearTimeout(this.timer);this.timer=null;}const reason=this.pendingReason;this.pendingReason=null;return this.saveCurrent(reason||'flush');}
  async list(options){return this.store.listItineraries(options);}
  async load(id,{restart=false}={}){
    await this.flush().catch(()=>null);const item=await this.store.getItinerary(id);if(!item?.routePack)throw new Error('Itinéraire local introuvable.');
    const events=routeEvents(item.routePack),progress=restart?{currentEventId:events[0]?.id||null,nextEventId:events[1]?.id||null,completedEventIds:[],skippedEventIds:[],remainingMinutes:null}:item.progress;
    pocketGuideState.patch({route:{activeId:item.id,title:item.title,pack:clone(item.routePack),currentEventId:progress?.currentEventId||null,nextEventId:progress?.nextEventId||null,completedEventIds:[...(progress?.completedEventIds||[])],skippedEventIds:[...(progress?.skippedEventIds||[])],remainingMinutes:progress?.remainingMinutes??null},session:{simulation:false}},{source:'pg18-itinerary-manager',event:'route.loaded'});
    item.lastOpenedAt=now();item.updatedAt=item.lastOpenedAt;if(restart)item.status='planned';await this.store.saveItinerary(item);this.status('loaded',{id:item.id,restart});return clone(item);
  }
  async rename(id,label){const item=await this.store.getItinerary(id);if(!item)return false;item.label=String(label||'').trim()||item.title;item.updatedAt=now();await this.store.saveItinerary(item);this.status('renamed',{id,label:item.label});return true;}
  async archive(id,archived=true){const item=await this.store.getItinerary(id);if(!item)return false;item.status=archived?'archived':(item.progress?.currentEventId?'in_progress':'completed');item.archivedAt=archived?now():null;item.updatedAt=now();await this.store.saveItinerary(item);this.status(archived?'archived':'restored',{id});return true;}
  async duplicate(id,{label}={}){
    const item=await this.store.getItinerary(id);if(!item)throw new Error('Itinéraire à dupliquer introuvable.');
    const duplicateId=`${safeId(item.id)}-copie-${Date.now().toString(36)}`,routePack=clone(item.routePack);routePack.id=duplicateId;routePack.title=label||`${item.title} — copie`;
    const events=routeEvents(routePack),copy={...clone(item),id:duplicateId,label:label||`${item.label} — copie`,title:routePack.title,status:'planned',createdAt:now(),updatedAt:now(),lastOpenedAt:null,revision:1,routePack,routeFingerprint:routeFingerprint(routePack),progress:{currentEventId:events[0]?.id||null,nextEventId:events[1]?.id||null,completedEventIds:[],skippedEventIds:[],remainingMinutes:null},stats:{...item.stats,mediaCount:0},source:'pocketguide-v18-duplicate'};
    await this.store.saveItinerary(copy);this.status('duplicated',{id,duplicateId});return copy;
  }
  async delete(id){await this.store.deleteItinerary(id);this.status('deleted',{id});return true;}
  async mediaSaved(itineraryId){const item=await this.store.getItinerary(itineraryId);if(!item)return null;item.stats={...(item.stats||{}),mediaCount:(await this.store.listMedia(itineraryId)).length};item.updatedAt=now();await this.store.saveItinerary(item);this.status('media_counted',{id:itineraryId,count:item.stats.mediaCount});return item;}
  start(){
    if(this.started)return this;this.started=true;
    for(const type of ['app.ready','route.loaded','route.replaced','route.advanced','route.skipped','route.shortened','route.completed','route.media.enriched'])this.unsubs.push(eventBus.on(type,()=>this.schedule(type)));
    this.unsubs.push(eventBus.on('media.personal.saved',payload=>this.mediaSaved(payload.itineraryId).catch(error=>this.status('error',{message:error.message}))));
    if(globalThis.addEventListener){const flush=()=>this.flush().catch(()=>null);globalThis.addEventListener('pagehide',flush);this.pagehide=flush;}
    this.schedule('pg18-start');return this;
  }
  stop(){if(this.timer)clearTimeout(this.timer);this.timer=null;this.unsubs.splice(0).forEach(off=>off?.());if(this.pagehide)globalThis.removeEventListener?.('pagehide',this.pagehide);this.started=false;return this;}
}

export const itineraryManager=new ItineraryManager();
export {routeEvents,safeId,statusFromRoute,progressFromRoute};

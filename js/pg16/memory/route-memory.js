import {eventBus} from '../core/event-bus.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {memoryStore} from './memory-store.js';

function now(){return new Date().toISOString();}
function append(key,item,{scope='session',max=30}={}){const current=memoryStore.recall(key,{scope})?.value||[];const next=[...current,item].slice(-max);memoryStore.remember(key,next,{scope,source:'pocketguide-core',confidence:1});return next;}
function routeEventName(eventId){const route=pocketGuideState.select('route');const event=(route?.pack?.days||[]).flatMap(day=>day.events||[]).find(e=>e.id===eventId);const place=(route?.pack?.places||[]).find(p=>p.id===event?.placeId);return place?.name||event?.title||eventId||null;}

export function installRouteMemory(){
  const unsubs=[];
  unsubs.push(eventBus.on('route.advanced',()=>{const completed=pocketGuideState.select('route.completedEventIds')||[];const id=completed.at(-1);if(id)append('route.visited',{eventId:id,name:routeEventName(id),at:now()},{scope:'session'});}));
  unsubs.push(eventBus.on('route.skipped',()=>{const skipped=pocketGuideState.select('route.skippedEventIds')||[];const id=skipped.at(-1);if(id)append('route.skipped',{eventId:id,name:routeEventName(id),at:now()},{scope:'session'});}));
  unsubs.push(eventBus.on('route.shortened',()=>append('route.changes',{type:'shortened',routeId:pocketGuideState.select('route.activeId'),remainingMinutes:pocketGuideState.select('route.remainingMinutes'),at:now()},{scope:'session'})));
  unsubs.push(eventBus.on('route.replaced',()=>append('route.changes',{type:'replaced',routeId:pocketGuideState.select('route.activeId'),title:pocketGuideState.select('route.title'),at:now()},{scope:'session'})));
  unsubs.push(eventBus.on('route.completed',()=>append('trip.completedRoutes',{routeId:pocketGuideState.select('route.activeId'),title:pocketGuideState.select('route.title'),at:now()},{scope:'trip'})));
  unsubs.push(eventBus.on('action.completed',payload=>{if(payload?.name!=='place.explain'&&payload?.name!=='place.explain_next')return;const place=payload?.result;if(!place?.id)return;append('place.storiesTold',{placeId:place.id,name:place.name||place.id,at:now()},{scope:'session'});}));
  return ()=>unsubs.splice(0).forEach(off=>off?.());
}

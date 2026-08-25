import {loadPocketGuideRoute} from '../../route-runtime.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';

function eventIdsFromPack(pack){const ids=[];for(const day of pack?.days||[])for(const event of day.events||[])if(event?.id)ids.push(event.id);return ids;}
function hhmm(value){if(!/^\d{2}:\d{2}$/.test(value||''))return NaN;const[h,m]=value.split(':').map(Number);return h*60+m;}
function eventDuration(event){const value=Number(event?.durationMinutes??event?.duration);if(Number.isFinite(value)&&value>0)return value;const start=hhmm(event?.time),end=hhmm(event?.end);return Number.isFinite(start)&&Number.isFinite(end)&&end>start?end-start:0;}
function estimateRemainingMinutes(pack,currentEventId=null){const events=(pack?.days||[]).flatMap(day=>day.events||[]);if(!events.length)return 0;if(!currentEventId)return 0;const found=events.findIndex(e=>e.id===currentEventId);if(found<0)return 0;return events.slice(found).reduce((sum,event)=>sum+eventDuration(event),0);}

export async function loadRouteIntoV16(options={}){
  const loaded=await loadPocketGuideRoute(options);const pack=loaded.pack,ids=eventIdsFromPack(pack),currentEventId=ids[0]||null,nextEventId=ids[1]||null;
  pocketGuideState.patch({trip:{active:true,startedAt:new Date().toISOString()},route:{activeId:pack.id,title:pack.title,pack,currentEventId,nextEventId,completedEventIds:[],skippedEventIds:[],remainingMinutes:estimateRemainingMinutes(pack,currentEventId)}},{source:'route-adapter-v15',event:'route.loaded'});
  eventBus.emit('route.adapter.ready',{routeId:pack.id,title:pack.title,legacySource:loaded.route?.format!=='routepack'});return loaded;
}
export function routeEventsFromState(){const pack=pocketGuideState.select('route.pack');return (pack?.days||[]).flatMap(day=>day.events||[]);}
export function advanceRoute({skip=false}={}){
  const route=pocketGuideState.select('route'),events=routeEventsFromState();if(!events.length||!route.currentEventId)return null;
  const index=events.findIndex(e=>e.id===route.currentEventId);if(index<0)return null;const current=events[index],next=events[index+1]||null,after=events[index+2]||null,completed=[...(route.completedEventIds||[])],skipped=[...(route.skippedEventIds||[])];
  if(current?.id){const target=skip?skipped:completed;if(!target.includes(current.id))target.push(current.id);}
  pocketGuideState.patch({route:{currentEventId:next?.id||null,nextEventId:after?.id||null,completedEventIds:completed,skippedEventIds:skipped,remainingMinutes:next?estimateRemainingMinutes(route.pack,next.id):0}},{source:'route-adapter-v15',event:skip?'route.skipped':'route.advanced'});
  if(!next)eventBus.emit('route.completed',{routeId:route.activeId,lastEventId:current?.id||null});return next;
}

import {loadPocketGuideRoute} from '../../route-runtime.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';

function eventIdsFromPack(pack){
  const ids=[];
  for(const day of pack?.days||[])for(const event of day.events||[])if(event?.id)ids.push(event.id);
  return ids;
}

function estimateRemainingMinutes(pack,currentEventId=null){
  const events=(pack?.days||[]).flatMap(day=>day.events||[]);
  if(!events.length)return null;
  let start=0;if(currentEventId){const found=events.findIndex(e=>e.id===currentEventId);if(found>=0)start=found;}
  let total=0;let foundDuration=false;
  for(const event of events.slice(start)){
    const value=Number(event.durationMinutes??event.duration??0);
    if(Number.isFinite(value)&&value>0){total+=value;foundDuration=true;}
  }
  return foundDuration?total:null;
}

export async function loadRouteIntoV16(options={}){
  const loaded=await loadPocketGuideRoute(options);
  const pack=loaded.pack;const ids=eventIdsFromPack(pack);const currentEventId=ids[0]||null;const nextEventId=ids[1]||null;
  pocketGuideState.patch({
    trip:{active:true,startedAt:new Date().toISOString()},
    route:{activeId:pack.id,title:pack.title,pack,currentEventId,nextEventId,completedEventIds:[],skippedEventIds:[],remainingMinutes:estimateRemainingMinutes(pack,currentEventId)}
  },{source:'route-adapter-v15',event:'route.loaded'});
  eventBus.emit('route.adapter.ready',{routeId:pack.id,title:pack.title,legacySource:loaded.route?.format!=='routepack'});
  return loaded;
}

export function routeEventsFromState(){
  const pack=pocketGuideState.select('route.pack');
  return (pack?.days||[]).flatMap(day=>day.events||[]);
}

export function advanceRoute({skip=false}={}){
  const route=pocketGuideState.select('route');const events=routeEventsFromState();
  if(!events.length)return null;
  const index=Math.max(0,events.findIndex(e=>e.id===route.currentEventId));
  const current=events[index];const next=events[index+1]||null;const after=events[index+2]||null;
  const completed=[...(route.completedEventIds||[])];const skipped=[...(route.skippedEventIds||[])];
  if(current?.id){const target=skip?skipped:completed;if(!target.includes(current.id))target.push(current.id);}
  pocketGuideState.patch({route:{currentEventId:next?.id||null,nextEventId:after?.id||null,completedEventIds:completed,skippedEventIds:skipped,remainingMinutes:estimateRemainingMinutes(route.pack,next?.id||null)}},{source:'route-adapter-v15',event:skip?'route.skipped':'route.advanced'});
  return next;
}

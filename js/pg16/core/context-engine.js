import {pocketGuideState} from './pocketguide-state.js';

function finite(value){return Number.isFinite(value)?value:null;}
function compactArray(value,max=8){return Array.isArray(value)?value.slice(-max):[];}
function routeObjects(route){const events=(route?.pack?.days||[]).flatMap(day=>day.events||[]);const places=route?.pack?.places||[];const placeMap=Object.fromEntries(places.map(p=>[p.id,p]));const describe=id=>{const event=events.find(e=>e.id===id);if(!event)return null;const place=placeMap[event.placeId];return {eventId:event.id,placeId:event.placeId||null,name:place?.name||event.title||event.place||event.id,title:event.title||place?.name||event.id,time:event.time||null,end:event.end||null,mustSee:Boolean(event.mustSee||place?.mustSee),priority:Number(event.priority??place?.priority??50)};};return {current:describe(route?.currentEventId),next:describe(route?.nextEventId)};}

export class HumanContextEngine {
  constructor(state=pocketGuideState){this.state=state;}
  build(){
    const s=this.state.get(),route=s.route||{},location=s.location||{},conversation=s.conversation||{},named=routeObjects(route);
    return {
      version:s.version,generatedAt:new Date().toISOString(),
      session:{id:s.session?.id||null,startedAt:s.session?.startedAt||null,lastActiveAt:s.session?.lastActiveAt||null,simulation:Boolean(s.session?.simulation)},
      trip:{active:Boolean(s.trip?.active),startedAt:s.trip?.startedAt||null,resumedAt:s.trip?.resumedAt||null},
      location:{lat:finite(location.lat),lng:finite(location.lng),accuracy:finite(location.accuracy),heading:finite(location.heading),updatedAt:location.updatedAt||null},
      route:{activeId:route.activeId||null,title:route.title||null,currentEventId:route.currentEventId||null,nextEventId:route.nextEventId||null,current:named.current,next:named.next,remainingMinutes:finite(route.remainingMinutes),completedEventIds:compactArray(route.completedEventIds,12),skippedEventIds:compactArray(route.skippedEventIds,12)},
      perception:{...s.perception},
      device:{online:Boolean(s.device?.online),platform:s.device?.platform||'web',standalone:Boolean(s.device?.standalone),battery:finite(s.device?.battery)},
      connectivity:{...(s.connectivity||{})},
      conversation:{status:conversation.status||'idle',currentTopic:conversation.currentTopic||null,currentPlaceId:conversation.currentPlaceId||named.current?.placeId||null,lastMentionedPlaceId:conversation.lastMentionedPlaceId||null,lastAction:conversation.lastAction||null,lastObjectType:conversation.lastObjectType||null,lastObjectId:conversation.lastObjectId||null},
      preferences:{session:{...(s.preferences?.session||{})},persistent:{...(s.preferences?.persistent||{})}},
      memory:{working:{...(s.memory?.working||{})},session:{...(s.memory?.session||{})}},
      proposal:s.proposals?.pending?{id:s.proposals.pending.id||null,type:s.proposals.pending.type||null,action:s.proposals.pending.action||null,summary:s.proposals.pending.summary||null,requiresConfirmation:Boolean(s.proposals.pending.requiresConfirmation)}:null,
      ui:{panel:s.ui?.panel||'guide',ar:Boolean(s.ui?.ar)},
      capabilities:{canLocate:s.perception?.gps==='ready',canOrient:s.perception?.orientation==='ready',canSee:s.perception?.camera==='ready',canHear:s.perception?.microphone==='ready',online:Boolean(s.device?.online)}
    };
  }
  summary(){const c=this.build(),parts=[];if(c.route.title)parts.push(`Parcours: ${c.route.title}`);else parts.push('Aucun parcours actif');if(c.route.current?.name)parts.push(`Maintenant: ${c.route.current.name}`);if(c.route.next?.name)parts.push(`Ensuite: ${c.route.next.name}`);if(Number.isFinite(c.route.remainingMinutes))parts.push(`${Math.round(c.route.remainingMinutes)} min restantes`);if(Number.isFinite(c.location.accuracy))parts.push(`GPS ±${Math.round(c.location.accuracy)} m`);parts.push(c.device.online?'En ligne':'Hors ligne');return parts.join(' · ');}
}
export const humanContextEngine=new HumanContextEngine();
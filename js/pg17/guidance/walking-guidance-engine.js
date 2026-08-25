import {haversineKm,bearingDeg} from '../../ar-core.js';
import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {actionRegistry} from '../../pg16/core/action-registry.js';

export const GUIDANCE_PHASES=Object.freeze({
  WAITING_GPS:'waiting_gps',GPS_DEGRADED:'gps_degraded',EN_ROUTE:'en_route',PREVIEW:'preview',APPROACHING:'approaching',ARRIVED:'arrived',DEPARTED:'departed',COMPLETED:'completed'
});

export const DEFAULT_GUIDANCE_OPTIONS=Object.freeze({
  previewMeters:350,
  approachMeters:120,
  arrivalMeters:35,
  exitMeters:70,
  maxAccuracyMeters:80,
  arrivalSamples:2,
  autoAdvance:true
});

function finite(value){const number=Number(value);return Number.isFinite(number)?number:null;}
function eventsFromState(){return (pocketGuideState.select('route.pack.days')||[]).flatMap(day=>day.events||[]);}
function placeById(id){return (pocketGuideState.select('route.pack.places')||[]).find(place=>place?.id===id)||null;}
function eventById(id){return eventsFromState().find(event=>event?.id===id)||null;}
function placeForEvent(id){const event=eventById(id);return event?placeById(event.placeId):null;}
function metersBetween(a,b){if(!a||!b)return null;const latA=finite(a.lat),lngA=finite(a.lng),latB=finite(b.lat),lngB=finite(b.lng);if([latA,lngA,latB,lngB].some(value=>value==null))return null;return haversineKm({lat:latA,lng:lngA},{lat:latB,lng:lngB})*1000;}
function signedHeadingDelta(bearing,heading){return ((bearing-heading+540)%360)-180;}

export function formatDistance(meters){
  const value=finite(meters);if(value==null)return 'distance inconnue';
  if(value<1000)return `${Math.max(0,Math.round(value))} m`;
  return `${(value/1000).toFixed(value<10_000?1:0)} km`;
}

export function directionInstruction({bearing,heading,distanceMeters,placeName='la prochaine étape'}={}){
  const distance=formatDistance(distanceMeters),target=placeName||'la prochaine étape';
  if(!Number.isFinite(bearing)||!Number.isFinite(heading))return `Continuez vers ${target}, à ${distance}.`;
  const delta=signedHeadingDelta(bearing,heading),magnitude=Math.abs(delta);
  if(magnitude<=18)return `Continuez tout droit vers ${target}, à ${distance}.`;
  if(magnitude>=155)return `Faites demi-tour vers ${target}, à ${distance}.`;
  if(magnitude<=55)return `Orientez-vous légèrement à ${delta>0?'droite':'gauche'} vers ${target}, à ${distance}.`;
  return `Tournez à ${delta>0?'droite':'gauche'} vers ${target}, à ${distance}.`;
}

function cueFor(phase,{place,distanceMeters,instruction}={}){
  const name=place?.name||place?.title||'la prochaine étape';
  if(phase===GUIDANCE_PHASES.GPS_DEGRADED)return 'Le GPS est trop imprécis pour confirmer votre direction. Continuez prudemment pendant que je retrouve une position fiable.';
  if(phase===GUIDANCE_PHASES.PREVIEW)return `Prochaine étape : ${name}, à ${formatDistance(distanceMeters)}.`;
  if(phase===GUIDANCE_PHASES.APPROACHING)return `Vous approchez de ${name}. ${place?.repere||place?.arCue||'Regardez autour de vous.'}`;
  if(phase===GUIDANCE_PHASES.ARRIVED){const story=place?.historyShort||place?.description||place?.note||'';return `Vous êtes arrivé à ${name}.${story?` ${story}`:''}`;}
  if(phase===GUIDANCE_PHASES.COMPLETED)return 'Le parcours est terminé. Vous pouvez continuer à interroger votre guide sur les lieux visités.';
  if(phase===GUIDANCE_PHASES.EN_ROUTE)return instruction;
  return instruction||'';
}

export class WalkingGuidanceEngine{
  constructor(options={}){
    this.options={...DEFAULT_GUIDANCE_OPTIONS,...options};
    this.phase=GUIDANCE_PHASES.WAITING_GPS;
    this.targetEventId=null;
    this.arrivedEventId=null;
    this.arrivalStreak=0;
    this.lastCueKey=null;
    this.lastSnapshot=null;
    this.started=false;
    this.processing=false;
    this.pendingSample=null;
    this.unsubs=[];
    this.onCue=null;
    this.onSnapshot=null;
  }

  currentTarget(){const eventId=pocketGuideState.select('route.currentEventId');return {eventId,event:eventById(eventId),place:placeForEvent(eventId)};}
  nextTarget(){const eventId=pocketGuideState.select('route.nextEventId');return {eventId,event:eventById(eventId),place:placeForEvent(eventId)};}

  resetForRoute({preserveCue=false}={}){
    const {eventId}=this.currentTarget();
    this.targetEventId=eventId||null;
    this.arrivedEventId=null;
    this.arrivalStreak=0;
    if(!preserveCue)this.lastCueKey=null;
    this.phase=eventId?GUIDANCE_PHASES.WAITING_GPS:GUIDANCE_PHASES.COMPLETED;
    return this.phase;
  }

  emitCue(kind,text,metadata={}){
    const eventId=pocketGuideState.select('route.currentEventId');
    const key=`${eventId||'none'}:${kind}`;
    if(!text||key===this.lastCueKey)return false;
    this.lastCueKey=key;
    const payload={kind,text,eventId,at:new Date().toISOString(),...metadata};
    eventBus.emit('guidance.cue',payload);this.onCue?.(payload);return true;
  }

  publish(snapshot,{cue=true}={}){
    const previous=this.phase;this.phase=snapshot.phase;this.lastSnapshot=snapshot;
    pocketGuideState.patch({ui:{guidance:{phase:snapshot.phase,eventId:snapshot.eventId,distanceMeters:snapshot.distanceMeters,instruction:snapshot.instruction,progress:snapshot.progress,media:snapshot.media}}},{source:'pg17-guidance',event:'guidance.state.changed'});
    if(previous!==snapshot.phase)eventBus.emit('guidance.phase.changed',{from:previous,to:snapshot.phase,eventId:snapshot.eventId,distanceMeters:snapshot.distanceMeters});
    eventBus.emit('guidance.snapshot',snapshot);this.onSnapshot?.(snapshot);
    if(cue){const text=cueFor(snapshot.phase,snapshot);if(text)this.emitCue(snapshot.phase,text,{placeId:snapshot.place?.id||null,distanceMeters:snapshot.distanceMeters});}
    return snapshot;
  }

  buildSnapshot({phase,position,distanceMeters,bearing,place,event}={}){
    const route=pocketGuideState.select('route'),events=eventsFromState(),completed=route?.completedEventIds?.length||0,skipped=route?.skippedEventIds?.length||0,total=events.length||1;
    const arrivalCredit=phase===GUIDANCE_PHASES.ARRIVED ? 0.25 : 0;
    const progress=Math.max(0,Math.min(1,(completed+skipped+arrivalCredit)/total));
    const name=place?.name||event?.title||'la prochaine étape';
    let instruction=directionInstruction({bearing,heading:finite(position?.heading),distanceMeters,placeName:name});
    if(phase===GUIDANCE_PHASES.WAITING_GPS)instruction=`GPS en attente pour vous guider vers ${name}.`;
    if(phase===GUIDANCE_PHASES.GPS_DEGRADED)instruction=`GPS imprécis : continuez prudemment vers ${name}, à environ ${formatDistance(distanceMeters)}.`;
    if(phase===GUIDANCE_PHASES.ARRIVED)instruction=`Vous êtes arrivé à ${name}.`;
    if(phase===GUIDANCE_PHASES.COMPLETED)instruction='Parcours terminé.';
    const next=this.nextTarget().place;
    return {phase,eventId:event?.id||null,place,distanceMeters,bearing,heading:finite(position?.heading),accuracy:finite(position?.accuracy),instruction,progress,media:{heroImage:place?.heroImage||place?.media?.[0]?.url||null,nextHeroImage:next?.heroImage||next?.media?.[0]?.url||null,caption:place?.photoLabel||place?.imageAttribution?.source||place?.sourceLabel||null},updatedAt:position?.updatedAt||new Date().toISOString()};
  }

  async processPosition(position=pocketGuideState.select('location'),{source='gps'}={}){
    if(this.processing){this.pendingSample={position,source};return this.lastSnapshot;}
    this.processing=true;
    try{
      const target=this.currentTarget();
      if(target.eventId!==this.targetEventId)this.resetForRoute({preserveCue:false});
      if(!target.eventId||!target.place){
        const snapshot=this.buildSnapshot({phase:GUIDANCE_PHASES.COMPLETED,position,event:null,place:null,distanceMeters:null,bearing:null});return this.publish(snapshot);
      }
      const accuracy=finite(position?.accuracy),lat=finite(position?.lat),lng=finite(position?.lng);
      if(lat==null||lng==null){
        const snapshot=this.buildSnapshot({phase:GUIDANCE_PHASES.WAITING_GPS,position,event:target.event,place:target.place,distanceMeters:null,bearing:null});return this.publish(snapshot,{cue:false});
      }
      const distanceMeters=metersBetween(position,target.place),bearing=bearingDeg({lat,lng},{lat:Number(target.place.lat),lng:Number(target.place.lng)});
      if(accuracy!=null&&accuracy>this.options.maxAccuracyMeters){
        this.arrivalStreak=0;const snapshot=this.buildSnapshot({phase:GUIDANCE_PHASES.GPS_DEGRADED,position,event:target.event,place:target.place,distanceMeters,bearing});return this.publish(snapshot);
      }
      if(this.arrivedEventId===target.eventId){
        if(distanceMeters>=this.options.exitMeters){
          const departed=this.buildSnapshot({phase:GUIDANCE_PHASES.DEPARTED,position,event:target.event,place:target.place,distanceMeters,bearing});this.publish(departed,{cue:false});
          if(this.options.autoAdvance){
            await actionRegistry.execute('route.next',{}, {source:'pg17-auto-progress'});
            eventBus.emit('guidance.auto_advanced',{fromEventId:target.eventId,source});
            this.resetForRoute({preserveCue:false});
            this.pendingSample={position,source:'post-advance'};
            return departed;
          }
          return departed;
        }
        const snapshot=this.buildSnapshot({phase:GUIDANCE_PHASES.ARRIVED,position,event:target.event,place:target.place,distanceMeters,bearing});return this.publish(snapshot,{cue:false});
      }
      let phase=GUIDANCE_PHASES.EN_ROUTE;
      if(distanceMeters<=this.options.arrivalMeters){
        this.arrivalStreak+=1;
        if(this.arrivalStreak>=this.options.arrivalSamples){phase=GUIDANCE_PHASES.ARRIVED;this.arrivedEventId=target.eventId;}
        else phase=GUIDANCE_PHASES.APPROACHING;
      }else{
        this.arrivalStreak=0;
        if(distanceMeters<=this.options.approachMeters)phase=GUIDANCE_PHASES.APPROACHING;
        else if(distanceMeters<=this.options.previewMeters)phase=GUIDANCE_PHASES.PREVIEW;
      }
      const snapshot=this.buildSnapshot({phase,position,event:target.event,place:target.place,distanceMeters,bearing});return this.publish(snapshot);
    }finally{
      this.processing=false;
      if(this.pendingSample){const pending=this.pendingSample;this.pendingSample=null;queueMicrotask(()=>this.processPosition(pending.position,{source:pending.source}));}
    }
  }

  repeatLastCue(){if(!this.lastSnapshot)return false;const text=cueFor(this.lastSnapshot.phase,this.lastSnapshot);if(!text)return false;const payload={kind:'repeat',text,eventId:this.lastSnapshot.eventId,at:new Date().toISOString(),placeId:this.lastSnapshot.place?.id||null};eventBus.emit('guidance.cue',payload);this.onCue?.(payload);return true;}

  async continueAfterArrival({source='pg17-user-continue'}={}){
    const eventId=pocketGuideState.select('route.currentEventId');
    if(!eventId||this.arrivedEventId!==eventId)return {ok:false,reason:'arrival_required'};
    const result=await actionRegistry.execute('route.next',{}, {source});
    eventBus.emit('guidance.user_advanced',{fromEventId:eventId,source});
    this.resetForRoute({preserveCue:false});
    return result;
  }

  start(){
    if(this.started)return this;this.started=true;this.resetForRoute();
    this.unsubs.push(eventBus.on('gps.updated',()=>this.processPosition()),eventBus.on('route.loaded',()=>this.resetForRoute()),eventBus.on('route.replaced',()=>this.resetForRoute()),eventBus.on('route.advanced',()=>this.resetForRoute({preserveCue:false})),eventBus.on('route.skipped',()=>this.resetForRoute({preserveCue:false})),eventBus.on('route.completed',()=>this.processPosition()));
    return this;
  }
  stop(){this.unsubs.splice(0).forEach(off=>off?.());this.started=false;return this;}
}

export const walkingGuidanceEngine=new WalkingGuidanceEngine();

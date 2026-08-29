import {bearingDeg,compassLabel,haversineKm} from '../../ar-core.js';

const STATE_PREFIX='pg4-route-state-v152:';
const LEGACY_PREFIX='pg15-state-v2:';
const TRANSPORT_TYPES=new Set(['transfert','bus','train','ferry','flight','avion','navette']);

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function priorityOf(item){
  const raw=item?.event?.priority??item?.place?.priority??50;
  if(typeof raw==='string'){
    const value=raw.toLowerCase();
    if(/must|incontourn|high|haute/.test(value))return 90;
    if(/low|basse|option/.test(value))return 20;
  }
  const number=Number(raw);return Number.isFinite(number)?Math.max(0,Math.min(100,number)):50;
}
function isMustSee(item){return Boolean(item?.event?.mustSee||item?.place?.mustSee||priorityOf(item)>=80);}

export class RouteStateAdapter{
  constructor({state,storage=globalThis.localStorage,bus=null}={}){
    this.state=state;this.storage=storage;this.bus=bus;this.pack=null;this.placeById={};
    this.progress={skipped:[],currentPlaceId:null,focusedPlaceId:null,routeRevision:0,followMap:true,proactiveEnabled:true};
  }
  key(){return this.pack?.id?`${STATE_PREFIX}${this.pack.id}`:'';}
  legacyKey(){return this.pack?.id?`${LEGACY_PREFIX}${this.pack.id}`:'';}
  setPack(pack){
    this.pack=pack||null;this.placeById=Object.fromEntries((pack?.places||[]).map(place=>[place.id,place]));
    this.progress={skipped:[],currentPlaceId:null,focusedPlaceId:null,routeRevision:0,followMap:true,proactiveEnabled:true};
    this.restore();this.publish('route-loaded');return this.snapshot();
  }
  eventIds(){return new Set((this.pack?.days||[]).flatMap(day=>(day.events||[]).map(event=>event.id)));}
  restore(){
    if(!this.pack)return this.progress;
    try{
      const raw=this.storage?.getItem?.(this.key())||this.storage?.getItem?.(this.legacyKey());
      const saved=JSON.parse(raw||'null');if(!saved)return this.progress;
      const ids=this.eventIds();
      this.progress={
        skipped:(saved.skipped||[]).filter(id=>ids.has(id)),
        currentPlaceId:this.placeById[saved.currentPlaceId]?saved.currentPlaceId:null,
        focusedPlaceId:this.placeById[saved.focusedPlaceId]?saved.focusedPlaceId:null,
        routeRevision:Number(saved.routeRevision)||0,
        followMap:saved.followMap!==false,
        proactiveEnabled:saved.proactiveEnabled!==false
      };
    }catch{}
    return this.progress;
  }
  persist(){
    if(!this.key())return false;
    try{this.storage?.setItem?.(this.key(),JSON.stringify({...this.progress,updatedAt:new Date().toISOString()}));return true}catch{return false;}
  }
  allEvents(){
    const skipped=new Set(this.progress.skipped);
    return(this.pack?.days||[]).flatMap(day=>(day.events||[]).map(event=>({day,event,place:this.placeById[event.placeId]}))).filter(item=>!skipped.has(item.event.id));
  }
  activeEvent(){
    const events=this.allEvents();
    if(this.progress.currentPlaceId){const exact=events.find(item=>item.event.placeId===this.progress.currentPlaceId);if(exact)return exact;}
    const timezone=this.pack?.timezone||'Europe/Paris';
    const today=new Date().toLocaleDateString('en-CA',{timeZone:timezone});
    const time=new Date().toLocaleTimeString('fr-FR',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hour12:false});
    const todayEvents=events.filter(item=>item.day.date===today);
    return todayEvents.find(item=>item.event.time<=time&&time<item.event.end)||todayEvents.find(item=>item.event.time>time)||events[0]||null;
  }
  nextEvent(){const events=this.allEvents(),current=this.activeEvent();if(!current)return events[0]||null;return events[events.findIndex(item=>item.event.id===current.event.id)+1]||null;}
  remainingEvents(){const events=this.allEvents(),current=this.activeEvent();if(!current)return events;const index=events.findIndex(item=>item.event.id===current.event.id);return index<0?events:events.slice(index);}
  position(){return this.state?.select?.('sensors.position')||null;}
  heading(){return this.state?.select?.('sensors.heading');}
  nearestPlaces(limit=5){
    const position=this.position();if(!position)return[];
    return(this.pack?.places||[]).filter(place=>Number.isFinite(place.lat)&&Number.isFinite(place.lng)).map(place=>({place,distanceKm:haversineKm(position,place),bearing:bearingDeg(position,place)})).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,Math.max(1,Math.min(6,limit)));
  }
  targetPlace(){return this.placeById[this.progress.focusedPlaceId]||this.nearestPlaces(1)[0]?.place||this.activeEvent()?.place||this.pack?.places?.[0]||null;}
  contextSnapshot(){
    const current=this.activeEvent(),next=this.nextEvent(),near=this.nearestPlaces(1)[0],target=this.targetPlace(),position=this.position(),heading=this.heading();
    return{app:'PocketGuide V4',base:'1.5.2',route:this.pack?{id:this.pack.id,title:this.pack.title,timezone:this.pack.timezone}:null,now:new Date().toISOString(),position:position?{lat:+position.lat.toFixed(6),lng:+position.lng.toFixed(6),accuracy:Math.round(position.accuracy||0),simulated:Boolean(position.simulated)}:null,heading:Number.isFinite(heading)?Math.round(heading):null,nearest:near?{id:near.place.id,name:near.place.name,distanceMeters:Math.round(near.distanceKm*1000),direction:compassLabel(near.bearing)}:null,target:target?{id:target.id,name:target.name}:null,current:current?{eventId:current.event.id,title:current.event.title,placeId:current.event.placeId,time:current.event.time,end:current.event.end}:null,next:next?{eventId:next.event.id,title:next.event.title,placeId:next.event.placeId,time:next.event.time}:null,remaining:this.remainingEvents().length,skipped:[...this.progress.skipped],routeRevision:this.progress.routeRevision,proactiveEnabled:this.progress.proactiveEnabled};
  }
  nearby(limit=4){return this.nearestPlaces(limit).map(item=>({id:item.place.id,name:item.place.name,distanceMeters:Math.round(item.distanceKm*1000),direction:compassLabel(item.bearing),description:item.place.historyShort||item.place.description||''}));}
  focus(placeId){if(!this.placeById[placeId])throw new Error('Lieu inconnu');this.progress.focusedPlaceId=placeId;this.commit('focus');return{target:this.placeById[placeId]};}
  goTo(placeId){if(!this.placeById[placeId])throw new Error('Lieu inconnu');this.progress.currentPlaceId=placeId;this.progress.focusedPlaceId=placeId;this.progress.routeRevision+=1;this.commit('go-to');return{current:this.placeById[placeId]};}
  skipNext(){const next=this.nextEvent();if(!next)throw new Error('Aucune étape suivante');this.progress.skipped=[...new Set([...this.progress.skipped,next.event.id])];this.progress.routeRevision+=1;this.commit('skip');return{skipped:next,next:this.nextEvent()};}
  shorten(removeCount=1){
    const count=Math.max(1,Math.min(4,Number(removeCount)||1));
    const candidates=this.remainingEvents().slice(1).filter(item=>!item.event.fixed&&!item.event.locked&&!TRANSPORT_TYPES.has(String(item.event.type||'').toLowerCase())&&!isMustSee(item)).sort((a,b)=>priorityOf(a)-priorityOf(b));
    const removed=candidates.slice(0,count);this.progress.skipped=[...new Set([...this.progress.skipped,...removed.map(item=>item.event.id)])];this.progress.routeRevision+=1;this.commit('shorten');return{removed,preservedMustSee:true,next:this.nextEvent()};
  }
  reset(){this.progress={...this.progress,skipped:[],currentPlaceId:null,focusedPlaceId:null,routeRevision:this.progress.routeRevision+1};this.commit('reset');return this.snapshot();}
  setProactive(enabled){this.progress.proactiveEnabled=Boolean(enabled);this.commit('proactive');return{enabled:this.progress.proactiveEnabled};}
  snapshot(){return{...clone(this.progress),context:this.contextSnapshot()};}
  commit(reason){this.persist();this.publish(reason);}
  publish(reason){const snapshot=this.snapshot();this.state?.patch?.({routeProgress:snapshot},{source:`route-state:${reason}`});this.bus?.emit?.('pg4.route.state',{reason,snapshot});return snapshot;}
}

export {STATE_PREFIX,isMustSee,priorityOf};

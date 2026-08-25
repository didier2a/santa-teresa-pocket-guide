import {haversineKm} from '../../ar-core.js';
import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {walkingGuidanceEngine} from '../guidance/walking-guidance-engine.js';

const DEFAULT_STEP_MS=240;

function finite(value){if(value==null||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function events(){return (pocketGuideState.select('route.pack.days')||[]).flatMap(day=>day.events||[]);}
function places(){return pocketGuideState.select('route.pack.places')||[];}
function placeFor(event){return places().find(place=>place?.id===event?.placeId)||null;}
function distanceMeters(a,b){return haversineKm({lat:Number(a.lat),lng:Number(a.lng)},{lat:Number(b.lat),lng:Number(b.lng)})*1000;}
function headingBetween(a,b){
  const lat1=Number(a.lat)*Math.PI/180,lat2=Number(b.lat)*Math.PI/180,delta=(Number(b.lng)-Number(a.lng))*Math.PI/180;
  const y=Math.sin(delta)*Math.cos(lat2),x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function offsetMeters(point,{north=0,east=0}={}){
  const lat=Number(point.lat)+north/111_320;
  const lng=Number(point.lng)+east/(111_320*Math.max(.2,Math.cos(Number(point.lat)*Math.PI/180)));
  return {lat,lng};
}
function position(point,{heading=null,accuracy=7,index=0}={}){
  return {lat:Number(point.lat),lng:Number(point.lng),heading:finite(heading),accuracy,updatedAt:new Date(Date.UTC(2026,0,1,9,0,index)).toISOString()};
}
function line(from,to,{steps=8,startIndex=0}={}){
  const heading=headingBetween(from,to),samples=[];
  for(let step=0;step<=steps;step+=1){
    const ratio=step/steps;
    samples.push(position({lat:Number(from.lat)+(Number(to.lat)-Number(from.lat))*ratio,lng:Number(from.lng)+(Number(to.lng)-Number(from.lng))*ratio},{heading,index:startIndex+step}));
  }
  return samples;
}

export function buildWalkingScenario({previewMeters=420,exitMeters=walkingGuidanceEngine.options.exitMeters}={}){
  const routeEvents=events(),items=[];
  if(!routeEvents.length)return items;
  let index=0;
  const first=placeFor(routeEvents[0]);
  if(!first)return items;
  const origin=offsetMeters(first,{west:0,east:-previewMeters});
  for(const sample of line(origin,first,{steps:9,startIndex:index})){items.push({type:'position',eventId:routeEvents[0].id,position:sample,label:'Marche vers la première étape'});index+=1;}
  items.push({type:'position',eventId:routeEvents[0].id,position:position(first,{heading:null,index:index++}),label:'Confirmation d’arrivée'});

  for(let eventIndex=0;eventIndex<routeEvents.length-1;eventIndex+=1){
    const currentEvent=routeEvents[eventIndex],nextEvent=routeEvents[eventIndex+1],current=placeFor(currentEvent),next=placeFor(nextEvent);
    if(!current||!next)continue;
    const legDistance=distanceMeters(current,next);
    if(legDistance<=exitMeters){
      items.push({type:'continue',eventId:currentEvent.id,label:legDistance<10?'Continuer au même lieu':'Continuer vers l’étape voisine'});
      items.push({type:'position',eventId:nextEvent.id,position:position(next,{heading:null,index:index++}),label:'Première confirmation au lieu partagé'});
      items.push({type:'position',eventId:nextEvent.id,position:position(next,{heading:null,index:index++}),label:'Arrivée au lieu partagé'});
      continue;
    }
    const steps=Math.max(7,Math.min(18,Math.ceil(legDistance/70)));
    for(const sample of line(current,next,{steps,startIndex:index}).slice(1)){items.push({type:'position',eventId:nextEvent.id,position:sample,label:`Marche vers ${next.name||nextEvent.title||'la suite'}`});index+=1;}
    items.push({type:'position',eventId:nextEvent.id,position:position(next,{heading:null,index:index++}),label:'Confirmation d’arrivée'});
  }

  const finalEvent=routeEvents.at(-1),finalPlace=placeFor(finalEvent);
  if(finalPlace){
    const exit=offsetMeters(finalPlace,{north:Math.max(exitMeters+35,105)});
    items.push({type:'position',eventId:finalEvent.id,position:position(exit,{heading:0,index:index++}),label:'Départ de la dernière étape'});
  }
  return items;
}

export class WalkingSimulator{
  constructor({engine=walkingGuidanceEngine,stepMs=DEFAULT_STEP_MS}={}){
    this.engine=engine;this.stepMs=stepMs;this.items=[];this.index=0;this.running=false;this.timer=null;this.onStatus=null;
  }
  prepare(options={}){
    this.pause();this.items=buildWalkingScenario(options);this.index=0;
    pocketGuideState.patch({session:{simulation:true},perception:{gps:'ready'}},{source:'pg17-walking-simulator',event:'simulation.walking.prepared'});
    this.report('ready');return this.items;
  }
  report(status){
    const payload={status,index:this.index,total:this.items.length,progress:this.items.length?this.index/this.items.length:0,item:this.items[this.index]||null};
    eventBus.emit('simulation.walking.status',payload);this.onStatus?.(payload);return payload;
  }
  async step(){
    if(!this.items.length)this.prepare();
    const item=this.items[this.index];if(!item){this.pause();return this.report('completed');}
    if(item.type==='continue')await this.engine.continueAfterArrival({source:'pg17-walking-simulation'});
    else{
      pocketGuideState.patch({location:item.position,perception:{gps:item.position.accuracy>this.engine.options.maxAccuracyMeters?'degraded':'ready'}},{source:'pg17-walking-simulator',event:'simulation.position.updated'});
      await this.engine.processPosition(item.position,{source:'pg17-walking-simulation'});
    }
    this.index+=1;return this.report(this.index>=this.items.length?'completed':this.running?'running':'paused');
  }
  run(){
    if(this.running)return this.report('running');if(!this.items.length)this.prepare();this.running=true;this.report('running');
    const tick=async()=>{if(!this.running)return;await this.step();if(this.running&&this.index<this.items.length)this.timer=setTimeout(tick,this.stepMs);else{this.running=false;this.timer=null;this.report('completed');}};
    this.timer=setTimeout(tick,0);return this.report('running');
  }
  pause(){this.running=false;if(this.timer)clearTimeout(this.timer);this.timer=null;return this.report(this.index?'paused':'idle');}
  reset(options={}){this.pause();return this.prepare(options);}
}

export const walkingSimulator=new WalkingSimulator();

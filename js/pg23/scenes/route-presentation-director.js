import {eventBus} from '../../pg16/core/event-bus.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const eventsOf=pack=>(pack?.days||[]).flatMap(day=>day.events||[]);
const mediaOf=place=>place?.media?.find(item=>item?.url)||null;

export function attributionForPlace(place){
  const media=mediaOf(place),legacy=place?.imageAttribution;if(media)return{label:media.attribution||[media.author,media.license,media.source].filter(Boolean).join(' · '),url:media.sourceUrl||media.descriptionUrl||''};if(legacy)return{label:[legacy.author,legacy.license,legacy.source].filter(Boolean).join(' · '),url:legacy.sourceUrl||legacy.descriptionUrl||''};return null;
}

export function orderedRoutePlaces(pack={}){
  const byId=new Map((pack.places||[]).map(place=>[place.id,place])),ordered=[],seen=new Set();
  for(const event of eventsOf(pack)){const place=byId.get(event.placeId);if(place&&!seen.has(place.id)){ordered.push({...place,eventId:event.id,eventTitle:event.title});seen.add(place.id);}}
  for(const place of pack.places||[])if(!seen.has(place.id)){ordered.push(place);seen.add(place.id);}return ordered;
}

export function buildRoutePresentationScenes(pack={},source='companion-request'){
  if(!pack?.id)return[];const places=orderedRoutePlaces(pack),prefix=`presentation-${String(pack.id).replace(/[^a-zA-Z0-9._:-]/g,'-')}`;
  const scenes=[{id:`${prefix}-intro`,type:'route',title:pack.title||'Votre itinéraire',text:pack.subtitle||`${places.length} étapes préparées. Je vous les présente dans l’ordre du parcours.`,places:places.map(place=>place.name),persist:true,source,meta:{routeId:pack.id,position:0,total:places.length+2}}];
  places.forEach((place,index)=>{const media=mediaOf(place),image=place.heroImage||media?.url||'',credit=attributionForPlace(place),verified=Boolean(image&&credit?.label),precision=place.photoExact===false&&place.photoLabel?`${place.photoLabel}. `:'';scenes.push({id:`${prefix}-poi-${place.eventId||place.id||index}`,type:image?'media':'poi',title:`${index+1}. ${place.name||place.title||'Étape'}`,text:`${precision}${place.historyShort||place.description||(image?'Je vous montre cette étape du parcours.':'Aucune photographie touristique vérifiée n’est disponible pour cette étape. Le lieu reste dans votre itinéraire.')}`.trim(),image,attribution:credit,persist:true,source,meta:{routeId:pack.id,placeId:place.id,eventId:place.eventId||null,position:index+1,total:places.length+2,mediaStatus:verified?'verified':image?'unattributed':'unavailable'}});});
  scenes.push({id:`${prefix}-map`,type:'map',title:'Le parcours dans son ensemble',text:`${places.length} étape${places.length>1?'s':''}. Ouvrez la carte lorsque vous voulez examiner les distances et le chemin.`,places:places.map(place=>place.name),persist:true,source,meta:{routeId:pack.id,position:places.length+1,total:places.length+2}});return scenes;
}

export class RoutePresentationDirector{
  constructor({bus=eventBus,sceneEngine,voiceService,intervalMs=1150,waitImpl=wait}={}){this.bus=bus;this.sceneEngine=sceneEngine;this.voiceService=voiceService;this.intervalMs=intervalMs;this.waitImpl=waitImpl;this.runId=0;this.running=false;}
  cancel(reason='interrupted'){this.runId+=1;const wasRunning=this.running;this.running=false;if(wasRunning)this.bus.emit('pg23.presentation.stopped',{reason});return wasRunning;}
  async present(pack,{source='companion-request',speak=true,intervalMs=this.intervalMs}={}){
    this.cancel('replaced');const id=this.runId,scenes=buildRoutePresentationScenes(pack,source);if(!scenes.length)return{ok:false,reason:'no-route',count:0};this.running=true;this.bus.emit('pg23.presentation.started',{routeId:pack.id,count:scenes.length,source});
    let presented=0;for(const scene of scenes){if(id!==this.runId)return{ok:false,reason:'interrupted',count:presented};this.sceneEngine?.create?.(scene);presented+=1;this.bus.emit('pg23.presentation.frame',{routeId:pack.id,scene,index:presented,total:scenes.length});if(presented<scenes.length)await this.waitImpl(intervalMs);}
    this.running=false;const text=`Je vous ai présenté les ${Math.max(0,scenes.length-2)} étapes de « ${pack.title||'votre parcours'} ». Vous pouvez ouvrir la carte ou lancer la simulation avant le départ.`;this.bus.emit('pg23.presentation.completed',{routeId:pack.id,count:presented,text});if(speak)this.voiceService?.speak?.(text,{routeId:pack.id,key:'route-presentation-summary'}).catch?.(()=>{});return{ok:true,count:presented,scenes,text};
  }
}

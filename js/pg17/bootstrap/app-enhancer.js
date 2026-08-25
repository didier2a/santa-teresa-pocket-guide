import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {voiceController} from '../../pg16/guide/voice-controller.js';
import {realtimeSession} from '../../pg16/guide/realtime-session.js';
import {proactiveEngine} from '../../pg16/proactive/proactive-engine.js';
import {findCommonsImages} from '../../route-media.js';
import {walkingGuidanceEngine,GUIDANCE_PHASES,formatDistance} from '../guidance/walking-guidance-engine.js';
import {walkingSimulator} from '../simulation/walking-simulator.js';

const $=selector=>document.querySelector(selector);
const params=new URL(location.href).searchParams;
const simulationRequested=params.get('walksim')==='1';
const autoWalk=params.get('autowalk')==='1';
const PHASE_LABELS={waiting_gps:'GPS en attente',gps_degraded:'GPS imprécis',en_route:'En chemin',preview:'À proximité',approaching:'Vous approchez',arrived:'Vous êtes arrivé',departed:'Étape quittée',completed:'Parcours terminé'};
let voiceEnabled=false,lastPrefetched=null,currentHero=null,lastGuidanceText='';
const mediaRequests=new Map();

function waitForBase(timeoutMs=12_000){
  const started=Date.now();
  return new Promise((resolve,reject)=>{const poll=()=>{if(globalThis.__POCKETGUIDE_16__)resolve(globalThis.__POCKETGUIDE_16__);else if(Date.now()-started>timeoutMs)reject(new Error('PocketGuide 1.6 base indisponible'));else setTimeout(poll,40);};poll();});
}
function setText(selector,value){const target=$(selector);if(target)target.textContent=value??'—';}
function appendGuide(text){
  const value=String(text||'').trim();if(!value)return;
  setText('#guideAnswer',value);
  const log=$('#conversationLog');if(!log)return;
  const row=document.createElement('div');row.className='turn turn--assistant';row.append(document.createTextNode(value));
  const meta=document.createElement('small');meta.textContent=`PocketGuide · ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`;row.append(meta);log.append(row);log.scrollTop=log.scrollHeight;
}
function prefetch(url){if(!url||url===lastPrefetched)return;lastPrefetched=url;const image=new Image();image.decoding='async';image.src=url;}
async function enrichMissingHero(snapshot){
  const place=snapshot?.place;if(!place?.id||mediaRequests.has(place.id)||!pocketGuideState.select('device.online'))return;
  const task=(async()=>{
    try{
      const name=place.name||place.title,queries=[`${name} Santa Teresa Gallura`,name,'Santa Teresa Gallura'];let results=[];
      for(const query of queries){results=await findCommonsImages(query,{limit:3});if(results.length)break;}if(!results.length)return;
      const pack=pocketGuideState.select('route.pack'),places=(pack?.places||[]).map(item=>item.id===place.id?{...item,heroImage:results[0].url,media:results,photoExact:false,photoLabel:'Wikimedia Commons',imageAttribution:{source:results[0].source,author:results[0].author,license:results[0].license,descriptionUrl:results[0].descriptionUrl}}:item);
      pocketGuideState.patch({route:{pack:{...pack,places}}},{source:'pg17-media',event:'route.media.enriched'});
    }catch{eventBus.emit('guidance.media.degraded',{placeId:place.id});}
  })();mediaRequests.set(place.id,task);await task;
}
function verifyCurrentHero(snapshot){
  const url=snapshot?.media?.heroImage;currentHero=url||null;if(!url)return;
  const image=new Image();image.decoding='async';image.onload=()=>{};image.onerror=()=>{if(currentHero!==url)return;const media=$('#terrainMedia');if(media&&!pocketGuideState.select('ui.ar')){media.classList.remove('has-photo');media.style.backgroundImage='';}void enrichMissingHero(snapshot);};image.src=url;
}
function renderGuidance(snapshot){
  if(!snapshot)return;
  if(lastGuidanceText)setText('#guideAnswer',lastGuidanceText);
  if(!pocketGuideState.select('ui.ar'))setText('#modeBadge','GUIDE AUDIOVISUEL');
  if(snapshot.phase===GUIDANCE_PHASES.COMPLETED)setText('#focusTitle','Parcours terminé');
  setText('#pg17Phase',PHASE_LABELS[snapshot.phase]||snapshot.phase);
  setText('#pg17Instruction',snapshot.instruction);
  setText('#pg17Distance',formatDistance(snapshot.distanceMeters));
  const percent=Math.round((snapshot.progress||0)*100);setText('#pg17ProgressText',`${percent} %`);
  const progress=$('#pg17ProgressBar');if(progress)progress.style.width=`${percent}%`;
  const progressRoot=progress?.parentElement;if(progressRoot){progressRoot.setAttribute('aria-valuemin','0');progressRoot.setAttribute('aria-valuemax','100');progressRoot.setAttribute('aria-valuenow',String(percent));}
  const guidance=$('#pg17Guidance');if(guidance)guidance.dataset.phase=snapshot.phase;
  const media=$('#terrainMedia');if(media){if(!snapshot.media?.heroImage&&!pocketGuideState.select('ui.ar')){media.classList.remove('has-photo');media.style.backgroundImage='';}media.classList.add('pg17-media-transition');requestAnimationFrame(()=>media.classList.remove('pg17-media-transition'));}
  const continueButton=$('#pg17Continue');if(continueButton)continueButton.hidden=snapshot.phase!==GUIDANCE_PHASES.ARRIVED;
  verifyCurrentHero(snapshot);prefetch(snapshot.media?.nextHeroImage);
}
function renderSimulation(payload){
  if(!payload)return;setText('#pg17SimStatus',payload.status==='completed'?'Simulation terminée':payload.status==='running'?'Marche simulée en cours':payload.status==='paused'?'Simulation en pause':'Simulation prête');
  const percent=Math.round((payload.progress||0)*100),bar=$('#pg17SimProgress');if(bar)bar.style.width=`${percent}%`;
  $('#pg17SimStart')?.toggleAttribute('disabled',payload.status==='running');$('#pg17SimPause')?.toggleAttribute('disabled',payload.status!=='running');
}
function setVoiceEnabled(enabled){voiceEnabled=Boolean(enabled);const button=$('#pg17VoiceToggle');if(button){button.setAttribute('aria-pressed',String(voiceEnabled));button.textContent=voiceEnabled?'🔊 Guidage vocal':'🔇 Guidage muet';}if(!voiceEnabled)voiceController.interrupt();}
function resetRouteForSimulation(){
  const route=pocketGuideState.select('route'),routeEvents=(route?.pack?.days||[]).flatMap(day=>day.events||[]);
  pocketGuideState.patch({route:{currentEventId:routeEvents[0]?.id||null,nextEventId:routeEvents[1]?.id||null,completedEventIds:[],skippedEventIds:[]},session:{simulation:true},perception:{gps:'ready'}},{source:'pg17-walking-simulator',event:'route.replaced'});
}

const base=await waitForBase();
pocketGuideState.patch({version:'1.7.0-rc1',ui:{guidance:{phase:GUIDANCE_PHASES.WAITING_GPS}}},{source:'pg17-bootstrap',event:'app.v17.ready'});
setText('#modeBadge','GUIDE AUDIOVISUEL');
walkingGuidanceEngine.onSnapshot=renderGuidance;
walkingGuidanceEngine.onCue=payload=>{lastGuidanceText=payload.text;if(voiceEnabled)voiceController.speak(payload.text);appendGuide(payload.text);};
walkingGuidanceEngine.start();
walkingSimulator.onStatus=renderSimulation;

proactiveEngine.onSuggestion=payload=>{if(payload.type==='near_place'||payload.type==='gps_degraded')return;appendGuide(payload.text);if(voiceEnabled&&!realtimeSession.connected)voiceController.speak(payload.text);};
proactiveEngine.options.poiRadiusMeters=-1;proactiveEngine.options.gpsAccuracyBad=Number.POSITIVE_INFINITY;
proactiveEngine.start();
eventBus.on('voice.speaking',()=>{if(lastGuidanceText)setText('#guideAnswer',lastGuidanceText);});
eventBus.on('voice.idle',()=>{if(lastGuidanceText)setText('#guideAnswer',lastGuidanceText);});

$('#startGuide')?.addEventListener('click',()=>setVoiceEnabled(true));
$('#pg17VoiceToggle')?.addEventListener('click',()=>setVoiceEnabled(!voiceEnabled));
$('#pg17Repeat')?.addEventListener('click',()=>{const muted=!voiceEnabled;if(muted)voiceEnabled=true;walkingGuidanceEngine.repeatLastCue();if(muted)voiceEnabled=false;});
$('#pg17Continue')?.addEventListener('click',async()=>{await walkingGuidanceEngine.continueAfterArrival();await walkingGuidanceEngine.processPosition(pocketGuideState.select('location'),{source:'pg17-user-continue'});});
$('#interruptBtn')?.addEventListener('click',()=>voiceController.interrupt());
$('#pg17SimStart')?.addEventListener('click',()=>{setVoiceEnabled(true);walkingSimulator.run();});
$('#pg17SimPause')?.addEventListener('click',()=>walkingSimulator.pause());
$('#pg17SimStep')?.addEventListener('click',()=>walkingSimulator.step());
$('#pg17SimReset')?.addEventListener('click',()=>{resetRouteForSimulation();walkingGuidanceEngine.resetForRoute();walkingSimulator.reset();});

if(simulationRequested){
  $('#permissionSheet').hidden=true;$('#pg17Simulation').hidden=false;resetRouteForSimulation();walkingGuidanceEngine.resetForRoute();walkingSimulator.prepare();
  if(autoWalk)walkingSimulator.run();
}else $('#pg17Simulation').hidden=true;

const initialLocation=pocketGuideState.select('location');if(Number.isFinite(initialLocation?.lat))walkingGuidanceEngine.processPosition(initialLocation,{source:'pg17-restored'});
globalThis.__POCKETGUIDE_17__={...base,guidance:walkingGuidanceEngine,simulator:walkingSimulator,setVoiceEnabled};
eventBus.emit('app.v17.enhanced',{version:'1.7.0-rc1'});

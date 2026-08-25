import {eventBus} from '../core/event-bus.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {humanContextEngine} from '../core/context-engine.js';
import {actionRegistry} from '../core/action-registry.js';
import {loadRouteIntoV16,routeEventsFromState} from '../route/route-adapter-v15.js';
import {registerRouteActions} from '../route/route-actions.js';
import {registerUiActions} from '../ui/ui-actions.js';
import {humanGuide} from '../guide/human-guide.js';
import {voiceController} from '../guide/voice-controller.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const params=new URL(location.href).searchParams;
const simRequested=params.get('sim')==='1';
const debugRequested=params.get('debug')==='1';
let map=null;let userMarker=null;let cameraStream=null;let geoWatchId=null;let lastGuideText='Je retrouve le contexte de votre balade.';

function sessionId(){return `pg16_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
function setText(selector,value){const el=$(selector);if(el)el.textContent=value??'—';}
function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function events(){return routeEventsFromState();}
function eventById(id){return events().find(event=>event?.id===id)||null;}
function places(){return pocketGuideState.select('route.pack')?.places||[];}
function placeById(id){return places().find(place=>place?.id===id)||null;}
function placeForEventId(eventId){const event=eventById(eventId);return event?placeById(event.placeId):null;}
function nameForEventId(eventId){const event=eventById(eventId);const place=event?placeById(event.placeId):null;return place?.name||place?.title||event?.title||event?.name||eventId||'—';}
function currentPlace(){return placeForEventId(pocketGuideState.select('route.currentEventId'));}
function nextPlace(){return placeForEventId(pocketGuideState.select('route.nextEventId'));}
function haversine(a,b){if(!a||!b||!Number.isFinite(a.lat)||!Number.isFinite(a.lng)||!Number.isFinite(b.lat)||!Number.isFinite(b.lng))return null;const R=6371000;const dLat=(b.lat-a.lat)*Math.PI/180;const dLng=(b.lng-a.lng)*Math.PI/180;const la1=a.lat*Math.PI/180;const la2=b.lat*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function distanceLabel(m){if(!Number.isFinite(m))return 'Localisation en attente';return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`;}

function appendLog(role,text){
  const value=String(text||'').trim();if(!value)return;
  const log=$('#conversationLog');if(!log)return;
  const row=document.createElement('div');row.className=`turn ${role==='user'?'turn--user':'turn--assistant'}`;row.textContent=value;log.append(row);log.scrollTop=log.scrollHeight;
  if(role==='guide'){lastGuideText=value;setText('#guideAnswer',value);}
}

function renderPanels(state){
  $$('[data-panel]').forEach(panel=>{const active=panel.dataset.panel===state.ui.panel;panel.classList.toggle('is-active',active);panel.hidden=!active;});
  $$('[data-tab]').forEach(button=>button.classList.toggle('is-active',button.dataset.tab===state.ui.panel));
  if(state.ui.panel==='map'&&map)setTimeout(()=>map.invalidateSize(),0);
}

function renderTimeline(state){
  const target=$('#timeline');if(!target)return;target.innerHTML='';
  const done=new Set(state.route.completedEventIds||[]);const skipped=new Set(state.route.skippedEventIds||[]);
  for(const event of events()){
    const place=placeById(event.placeId);const item=document.createElement('article');
    item.className='timeline-item pg16-event';item.classList.toggle('is-current',event.id===state.route.currentEventId);item.classList.toggle('is-done',done.has(event.id));item.classList.toggle('is-skipped',skipped.has(event.id));
    item.innerHTML=`<div class="timeline-time">${esc(event.startTime||event.time||'•')}</div><div><strong>${esc(place?.name||event.title||event.name||event.id)}</strong><small>${esc(place?.description||place?.note||event.note||'')}</small></div>`;
    target.append(item);
  }
}

function ensureMap(){
  if(map||!globalThis.L||!$('#map'))return;
  map=L.map('map',{zoomControl:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  const routePlaces=places().filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
  routePlaces.forEach(place=>L.marker([Number(place.lat),Number(place.lng)]).addTo(map).bindPopup(`<strong>${esc(place.name||place.title||place.id)}</strong>`));
  if(routePlaces.length){const bounds=L.latLngBounds(routePlaces.map(p=>[Number(p.lat),Number(p.lng)]));map.fitBounds(bounds.pad(.18));}
}

function renderMap(state){
  ensureMap();if(!map)return;
  const {lat,lng}=state.location||{};
  if(Number.isFinite(lat)&&Number.isFinite(lng)){
    if(!userMarker)userMarker=L.circleMarker([lat,lng],{radius:8,weight:3,fillOpacity:.9}).addTo(map).bindPopup('Vous êtes ici');
    else userMarker.setLatLng([lat,lng]);
  }
}

function render(){
  const state=pocketGuideState.get();const context=humanContextEngine.build();const current=currentPlace();const next=nextPlace();
  setText('#routeTitle',state.route.title||'Human Guide Alpha 2');
  setText('#networkState',state.device.online?'● Réseau':'● Hors ligne');$('#networkState')?.classList.toggle('is-ok',state.device.online);
  setText('#gpsState',state.perception.gps==='ready'?(state.location.accuracy?`GPS ±${Math.round(state.location.accuracy)} m`:'GPS'):'GPS');
  const status=state.conversation.status||'idle';setText('#sessionState',status==='listening'?'Écoute':status==='speaking'?'Parle':status==='thinking'?'Réfléchit':status==='waiting_confirmation'?'Confirme':'Guide');
  setText('#focusTitle',current?.name||current?.title||nameForEventId(state.route.currentEventId)||'Parcours terminé');
  setText('#focusTime',Number.isFinite(state.route.remainingMinutes)?`${Math.round(state.route.remainingMinutes)} min restantes`:'—');
  const d=haversine(state.location,current?{lat:Number(current.lat),lng:Number(current.lng)}:null);setText('#focusDistance',distanceLabel(d));
  setText('#focusDirection',state.location.heading==null?'—':`${Math.round(state.location.heading)}°`);
  setText('#nowPlace',current?.name||current?.title||'—');setText('#nowDistance',distanceLabel(d));
  setText('#nextTitle',next?.name||next?.title||nameForEventId(state.route.nextEventId)||'Fin du parcours');
  setText('#nextMeta',state.route.nextEventId?'Prochaine étape':'Vous avez terminé');
  setText('#remainingTitle',Number.isFinite(state.route.remainingMinutes)?`${Math.round(state.route.remainingMinutes)} min`:'—');
  setText('#remainingMeta',`${Math.max(0,events().length-(state.route.completedEventIds?.length||0)-(state.route.skippedEventIds?.length||0))} étapes à traiter`);
  setText('#guideAnswer',lastGuideText);
  const media=$('#terrainMedia');if(media&&current?.heroImage&&!state.ui.ar){media.classList.add('has-photo');media.style.backgroundImage=`linear-gradient(to top,rgba(3,17,21,.76),rgba(3,17,21,.08)),url("${current.heroImage}")`;}
  renderPanels(state);renderTimeline(state);renderMap(state);
  $('#pg16Proposal')?.toggleAttribute('hidden',!state.proposals.pending);
  $('#simStatus')?.toggleAttribute('hidden',!state.session.simulation);
  $('#arToggle')?.classList.toggle('is-on',Boolean(state.ui.ar));setText('#modeBadge',state.ui.ar?'GEO-AR':'HUMAN GUIDE');
  const debug=$('#pg16Debug');if(debugRequested&&debug){debug.hidden=false;debug.textContent=JSON.stringify({context,state},null,2);}
}

async function submitText(text,{speak=false,source='text'}={}){
  const value=String(text||'').trim();if(!value)return;
  appendLog('user',value);const lower=value.toLowerCase();let reply;
  if(['oui','yes','ok','d’accord','daccord','confirme','je confirme'].includes(lower))reply=await humanGuide.confirmPending(true);
  else if(['non','no','annule','annuler','pas maintenant'].includes(lower))reply=await humanGuide.confirmPending(false);
  else reply=await humanGuide.handleText(value,{source});
  appendLog('guide',reply.text);if(speak)voiceController.speak(reply.text);render();return reply;
}

function simulateAtCurrent(){
  const place=currentPlace();if(!place||!Number.isFinite(Number(place.lat))||!Number.isFinite(Number(place.lng)))return;
  pocketGuideState.patch({session:{simulation:true},location:{lat:Number(place.lat),lng:Number(place.lng),accuracy:4,heading:0,updatedAt:new Date().toISOString()},perception:{gps:'ready'}},{source:'simulation',event:'gps.updated'});
  setText('#mapNote','Simulation : votre position suit l’étape courante.');
}

function startGps(){
  if(!navigator.geolocation){appendLog('guide','Le GPS Web n’est pas disponible sur cet appareil.');return;}
  if(geoWatchId!=null)return;
  pocketGuideState.patch({session:{simulation:false},perception:{gps:'starting'}},{source:'gps',event:'gps.starting'});
  geoWatchId=navigator.geolocation.watchPosition(position=>{
    const c=position.coords;pocketGuideState.patch({location:{lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,heading:Number.isFinite(c.heading)?c.heading:null,updatedAt:new Date(position.timestamp).toISOString()},perception:{gps:'ready'}},{source:'gps',event:'gps.updated'});
  },error=>{pocketGuideState.patch({perception:{gps:'error'}},{source:'gps',event:'gps.error'});appendLog('guide',error.code===1?'Autorisez la localisation dans Chrome pour me donner votre contexte réel.':`GPS indisponible : ${error.message}`);},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
}

async function toggleCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;const video=$('#arCamera');if(video){video.pause();video.srcObject=null;video.hidden=true;}$('#terrainMedia')?.classList.remove('is-camera');pocketGuideState.patch({ui:{ar:false},perception:{camera:'idle'}},{source:'camera',event:'ar.closed'});return;}
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});const video=$('#arCamera');video.srcObject=cameraStream;video.hidden=false;await video.play();$('#terrainMedia')?.classList.add('is-camera');pocketGuideState.patch({ui:{ar:true,panel:'guide'},perception:{camera:'ready'}},{source:'camera',event:'ar.opened'});
  }catch(error){appendLog('guide',`Je n’ai pas pu ouvrir la caméra : ${error.message}`);pocketGuideState.patch({perception:{camera:'error'}},{source:'camera',event:'ar.error'});}
}

function recenterMap(){const state=pocketGuideState.get();if(map&&Number.isFinite(state.location.lat)&&Number.isFinite(state.location.lng))map.setView([state.location.lat,state.location.lng],17);}

async function boot(){
  const now=new Date().toISOString();
  pocketGuideState.patch({boot:{status:'starting',startedAt:now},session:{id:sessionId(),startedAt:now,lastActiveAt:now,simulation:false},device:{online:navigator.onLine,standalone:matchMedia('(display-mode: standalone)').matches}},{source:'bootstrap',event:'app.started'});
  registerUiActions();registerRouteActions();
  try{await loadRouteIntoV16();}
  catch(error){pocketGuideState.patch({diagnostics:{lastError:String(error?.message||error)}},{source:'bootstrap',event:'route.load.failed'});appendLog('guide',`Je démarre sans parcours : ${error.message}`);}
  pocketGuideState.patch({boot:{status:'ready',restoredAt:new Date().toISOString()}},{source:'bootstrap',event:'app.ready'});

  $$('[data-tab]').forEach(button=>button.addEventListener('click',()=>actionRegistry.execute(`ui.open_${button.dataset.tab}`,{}, {source:'button'})));
  $$('[data-command]').forEach(button=>button.addEventListener('click',()=>submitText(button.dataset.command,{speak:false,source:'quick-command'})));
  $$('[data-ask="where"]').forEach(button=>button.addEventListener('click',()=>submitText('Où en sommes-nous ?',{source:'context-card'})));
  $$('[data-ask="next"]').forEach(button=>button.addEventListener('click',()=>submitText('Et ensuite ?',{source:'context-card'})));
  $$('[data-ask="remaining"]').forEach(button=>button.addEventListener('click',()=>submitText('Combien de temps reste-t-il ?',{source:'context-card'})));
  $('#textForm')?.addEventListener('submit',async event=>{event.preventDefault();const input=$('#textCommand');const value=input.value;input.value='';await submitText(value,{source:'text'});});
  $('#pg16Yes')?.addEventListener('click',()=>submitText('oui',{source:'confirmation'}));$('#pg16No')?.addEventListener('click',()=>submitText('non',{source:'confirmation'}));
  $('#gpsBtn')?.addEventListener('click',()=>{startGps();recenterMap();});$('#arToggle')?.addEventListener('click',toggleCamera);
  $('#routeReset')?.addEventListener('click',()=>location.reload());
  $('#planBtn')?.addEventListener('click',()=>{const text=$('#planPrompt')?.value||'';if(text)submitText(text,{source:'planner-shell'});actionRegistry.execute('ui.open_guide',{}, {source:'planner-shell'});});
  $('#planVoiceBtn')?.addEventListener('click',()=>voiceController.start());
  $('#startGuide')?.addEventListener('click',()=>{$('#permissionSheet').hidden=true;startGps();});
  $('#startDemo')?.addEventListener('click',()=>{$('#permissionSheet').hidden=true;simulateAtCurrent();});
  $('#voiceMain')?.addEventListener('click',()=>voiceController.start());$('#interruptBtn')?.addEventListener('click',()=>voiceController.interrupt());
  voiceController.onTranscript=text=>submitText(text,{speak:true,source:'voice'});
  voiceController.onStatus=(status,label)=>{setText('#voiceLabel',label||'Parlez à votre guide');const orb=$('#voiceMain');orb?.classList.toggle('is-listening',status==='listening');orb?.classList.toggle('is-speaking',status==='speaking');render();};
  addEventListener('online',()=>pocketGuideState.patch({device:{online:true}},{source:'platform',event:'network.online'}));addEventListener('offline',()=>pocketGuideState.patch({device:{online:false}},{source:'platform',event:'network.offline'}));
  eventBus.on('route.advanced',()=>{if(pocketGuideState.select('session.simulation'))simulateAtCurrent();});eventBus.on('route.skipped',()=>{if(pocketGuideState.select('session.simulation'))simulateAtCurrent();});eventBus.on('*',()=>render());
  appendLog('guide',`Je suis prêt. ${humanContextEngine.summary()}`);
  if(simRequested){simulateAtCurrent();$('#permissionSheet').hidden=true;}else $('#permissionSheet').hidden=false;
  render();
  window.__POCKETGUIDE_16__={state:pocketGuideState,bus:eventBus,actions:actionRegistry,context:humanContextEngine,guide:humanGuide,voice:voiceController,submitText,simulateAtCurrent,startGps,toggleCamera};
}

boot().catch(error=>{console.error(error);appendLog('guide',`Erreur de démarrage : ${error.message}`);setText('#guideAnswer',`Erreur de démarrage : ${error.message}`);});

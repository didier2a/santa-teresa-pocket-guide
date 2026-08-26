import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {actionRegistry} from '../../pg16/core/action-registry.js';
import {proposalManager} from '../../pg16/core/proposal-manager.js';
import {registerRouteActions} from '../../pg16/route/route-actions.js';
import {loadRouteIntoV16} from '../../pg16/route/route-adapter-v15.js';
import {plannerEngine} from '../../pg16/planner/planner-engine.js';
import {perceptionEngine} from '../../pg16/perception/perception-engine.js';
import {platformAdapter} from '../../pg16/platform/platform.js';
import {geoAREngine} from '../../pg16/ar/geo-ar-engine.js';
import {voiceController} from '../../pg16/guide/voice-controller.js';
import {walkingGuidanceEngine,formatDistance} from '../../pg17/guidance/walking-guidance-engine.js';
import {walkingSimulator} from '../../pg17/simulation/walking-simulator.js';
import {itineraryManager} from '../../pg18/itineraries/itinerary-manager.js';
import {itineraryStore} from '../../pg18/storage/itinerary-store.js';
import {photoPreviewEngine,MODES} from '../../pg18/simulation/photo-preview-engine.js';
import {audiovisualJournal} from '../../pg18/journal/audiovisual-journal.js';
import {savePersonalPhoto,captureVideoFrame,LocalVoiceNoteRecorder} from '../../pg18/media/photo-capture.js';
import {createPortableBackupBlob,backupFilename,downloadPortableBackup,importPortableBundle,blobToDataUrl} from '../../pg18/backup/portable-backup.js';
import {V51_PHOTO_MAP} from '../../trip-config.js';
import {haversineKm} from '../../ar-core.js';
import {registerV2Actions} from '../../pg2/core/v2-actions.js';
import {loadCompanionSession21,saveCompanionSession21,resetSensorsForRealSession} from '../core/session-store.js';
import {companionOrchestrator21} from '../companion/companion-orchestrator.js';
import {humanRealtimeCompanion} from '../companion/human-realtime-companion.js';
import {adaptiveMomentEngine} from '../core/adaptive-moment-engine.js';

const loadCompanionSession=loadCompanionSession21;
const saveCompanionSession=saveCompanionSession21;
const companionOrchestrator=companionOrchestrator21;
const realtimeCompanion=humanRealtimeCompanion;

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const params=new URL(location.href).searchParams;
const simulationRequested=params.get('sim')==='1';
const walkingSimulationRequested=params.get('walksim')==='1';
const debugRequested=params.get('debug')==='1';
const app=$('#companionApp');
const livingCompanion=/^2\.3/.test(app?.dataset?.pgVersion||'');
const session=loadCompanionSession()||{currentItineraryId:null,quietMode:false,voiceEnabled:true,conversationExpanded:true};
const voiceRecorder=new LocalVoiceNoteRecorder();
let map=null,routeLayer=null,positionMarker=null,toastTimer=null,showArchives=false,pendingPhoto=null,pendingPhotoUrl=null,pendingVoiceNote=null,previewItineraryId=null,previewVoice=true,arRenderTimer=null,pendingPlanPack=null,lastRenderedMoment='welcome';
const journalUrls=[];

function esc(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function safeImage(value=''){const url=String(value||'');return /^(https:\/\/|\.\/|assets\/)/.test(url)?url:'';}
function setText(selector,value){const target=$(selector);if(target)target.textContent=value??'—';}
function showDialog(dialog){if(!dialog)return;const livingSurface=livingCompanion&&['plannerDialog','proposalDialog','readyDialog','previewDialog'].includes(dialog.id);if(livingSurface&&typeof dialog.show==='function'&&!dialog.open){dialog.classList.add('living-surface');dialog.show();}else if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');}
function closeDialog(dialog){if(!dialog)return;if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');}
function toast(message,duration=3000){const target=$('#toast');if(!target)return;target.textContent=String(message||'');target.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{target.hidden=true;},duration);}
function allEvents(){return (pocketGuideState.select('route.pack.days')||[]).flatMap(day=>(day.events||[]).map(event=>({...event,date:day.date,label:day.label})));}
function eventById(id){return allEvents().find(event=>event.id===id)||null;}
function placeById(id){return (pocketGuideState.select('route.pack.places')||[]).find(place=>place.id===id)||null;}
function placeForEvent(id){const event=eventById(id);return event?placeById(event.placeId):null;}
function currentPlace(){return placeForEvent(pocketGuideState.select('route.currentEventId'));}
function currentItineraryId(){return itineraryManager.currentId();}
function formatDate(value){try{return new Date(value).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});}catch{return'—';}}
function formatBytes(bytes=0){const value=Number(bytes)||0;if(value<1024)return`${value} o`;if(value<1024**2)return`${(value/1024).toFixed(1)} Ko`;return`${(value/1024**2).toFixed(1)} Mo`;}
function formatDuration(minutes){const value=Math.max(0,Number(minutes)||0),hours=Math.floor(value/60),rest=Math.round(value%60);if(!hours)return`${rest} min`;return rest?`${hours} h ${rest}`:`${hours} h`;}
function nowTime(){return new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});}
function revoke(url){if(url)try{URL.revokeObjectURL(url)}catch{}}

function packFromProposal(proposal){return proposal?.args?.pack||proposal?.plan?.pack||proposal?.pack||null;}
function packEvents(pack){return (pack?.days||[]).flatMap(day=>(day.events||[]).map(event=>({...event,date:day.date})));}
function packDuration(pack){
  const events=packEvents(pack);let minutes=0;
  for(const event of events){const value=Number(event.durationMinutes??event.duration??0);if(Number.isFinite(value)&&value>0)minutes+=value;}
  if(minutes)return minutes;
  const toMinutes=value=>{const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):null;},starts=events.map(event=>toMinutes(event.time)).filter(Number.isFinite),ends=events.map(event=>toMinutes(event.end)).filter(Number.isFinite);
  return starts.length&&ends.length?Math.max(0,Math.max(...ends)-Math.min(...starts)):0;
}
function packDistance(pack){
  const byId=new Map((pack?.places||[]).map(place=>[place.id,place]));const points=packEvents(pack).map(event=>byId.get(event.placeId)).filter(place=>Number.isFinite(Number(place?.lat))&&Number.isFinite(Number(place?.lng)));
  return points.slice(1).reduce((sum,point,index)=>sum+haversineKm(points[index],point),0);
}
function renderProposalSummary(pack){
  const section=$('#proposalSummary');if(!section)return;const places=pack?.places||[],events=packEvents(pack),minutes=packDuration(pack),distance=packDistance(pack),effort=distance<=2.5&&minutes<=120?'Tranquille':distance<=6&&minutes<=240?'Équilibré':'Dynamique';
  setText('#proposalDuration',minutes?formatDuration(minutes):'À préciser');setText('#proposalDistance',Number.isFinite(distance)&&distance>0?`${distance.toFixed(distance<10?1:0)} km`:'À préciser');setText('#proposalPoi',String(events.length||places.length||0));setText('#proposalDifficulty',effort);
  $('#proposalPlaces').innerHTML=places.slice(0,8).map((place,index)=>`<span>${index+1}. ${esc(place.name||place.title||'Étape')}</span>`).join('');
  const images=places.slice(0,livingCompanion?10:3).map(place=>({url:safeImage(place.heroImage||place.media?.[0]?.url),name:place.name||place.title||'Étape',credit:place.media?.[0]?.attribution||[place.imageAttribution?.author,place.imageAttribution?.license,place.imageAttribution?.source].filter(Boolean).join(' · ')}));
  $('#proposalImages').innerHTML=livingCompanion?images.map(item=>`<figure class="proposal-media-card" data-media-status="${item.url?'verified':'unavailable'}">${item.url?`<img src="${esc(item.url)}" alt="Aperçu de ${esc(item.name)}">`:'<span aria-hidden="true">◫</span>'}<figcaption><strong>${esc(item.name)}</strong><small>${esc(item.url?(item.credit||'Source à vérifier'):'Photo vérifiée indisponible')}</small></figcaption></figure>`).join(''):images.filter(item=>item.url).map(item=>`<img src="${esc(item.url)}" alt="Aperçu de ${esc(item.name)}">`).join('');$('#proposalImages').hidden=!images.length;section.hidden=!pack;
}
function setConversationExpanded(expanded){
  const value=Boolean(expanded),conversation=$('#conversation'),toggle=$('#toggleConversation');session.conversationExpanded=value;if(conversation)conversation.hidden=!value;if(toggle){toggle.setAttribute('aria-expanded',String(value));toggle.textContent=value?'Masquer la conversation':'Ouvrir la conversation';}saveCompanionSession({...session,currentItineraryId:currentItineraryId()});
}
function renderMoment(moment){
  if(!moment)return;const previous=lastRenderedMoment;lastRenderedMoment=moment.id;app.dataset.moment=moment.id;app.dataset.portrait=moment.portrait;if(pocketGuideState.select('ui.moment')!==moment.id)pocketGuideState.patch({ui:{moment:moment.id}},{source:'pg21-moment',event:'pg21.moment.rendered'});setText('#momentEyebrow',moment.eyebrow);setText('#momentTitle',moment.title);setText('#momentMessage',moment.message);setText('#momentLabel',moment.eyebrow);
  const primary=$('#momentPrimary'),secondary=$('#momentSecondary');if(primary){primary.textContent=moment.primaryLabel;primary.dataset.momentAction=moment.primaryAction;}if(secondary){secondary.textContent=moment.secondaryLabel;secondary.dataset.momentAction=moment.secondaryAction;}
  if(moment.id==='walking'&&previous!=='walking')setConversationExpanded(false);else if(previous==='walking'&&moment.id!=='walking'&&!session.conversationExpanded)setConversationExpanded(true);
}
function requestLocation(){showDialog($('#locationDialog'));}
async function runMomentAction(action){
  if(action==='voice.toggle')return companionOrchestrator.toggleListening();
  if(action==='composer.focus'){setConversationExpanded(true);$('#companionInput')?.focus();return;}
  if(action==='journey.start'){requestLocation();return;}
  if(action==='preview.open')return openPreview();
  if(action==='preview.next')return photoPreviewEngine.next();
  if(action==='preview.close'){photoPreviewEngine.pause();voiceController.interrupt();closeDialog($('#previewDialog'));adaptiveMomentEngine.setPreview(false);return;}
  if(action==='ar.open')return openAR();
  if(action==='place.explain'){const place=currentPlace();return companionOrchestrator.ask(`Raconte-moi ${place?.name||'ce lieu'}`,{source:'moment',speak:true});}
  if(action==='journal.open')return openJournal();
  if(action==='memories.open'){setView('memories');return;}
  if(action==='companion.open'){setView('companion');return;}
  if(action==='planner.open'){showDialog($('#plannerDialog'));return;}
}

function enrichKnownMedia(){
  const pack=pocketGuideState.select('route.pack');if(!pack?.places)return false;let changed=false;
  const places=pack.places.map(place=>{const photo=V51_PHOTO_MAP[place.id];if(!photo)return place;const image=photo.page&&photo.image?photo.image:'';if(place.heroImage===image&&Boolean(place.media?.[0]?.url)===Boolean(image))return place;changed=true;return {...place,heroImage:image,photoExact:Boolean(photo.exact),photoLabel:photo.label||place.name,imageAttribution:image?{source:'Wikimedia Commons',author:photo.credit||'',descriptionUrl:photo.page||''}:null,media:image?[{url:image,title:photo.label||place.name,source:'Wikimedia Commons',sourceUrl:photo.page||'',descriptionUrl:photo.page||'',attribution:photo.credit||'Wikimedia Commons'}]:[]};});
  if(changed)pocketGuideState.patch({route:{pack:{...pack,places}}},{source:'pg21-media',event:'route.media.enriched'});return changed;
}

function setPresence({value='ready',label='Je suis avec vous',connected=false,listening=false,message=''}={}){
  app.dataset.presence=value;setText('#presenceLabel',label);setText('#guideStateLabel',label);setText('#connectionLabel',value==='degraded'?'Mode essentiel':connected?'Avec vous en direct':'Avec vous');
  const hints={connecting:'Connexion à votre voix…',listening:'Parlez naturellement, vous pouvez m’interrompre.',thinking:'Je rassemble le contexte utile.',speaking:'Vous pouvez m’interrompre à tout moment.',degraded:'Le parcours, le GPS et vos souvenirs restent disponibles.',error:'Réessayez ou écrivez-moi.'};
  setText('#presenceHint',message||hints[value]||'Touchez pour parler naturellement');$('#companionMic')?.setAttribute('aria-pressed',String(Boolean(listening)));
}
function appendTurn(role,text,{source=''}={}){
  const log=$('#conversationLog');if(!log||!String(text||'').trim())return;
  const turn=document.createElement('article');turn.className=`turn turn--${role==='user'?'user':'companion'}`;
  const paragraph=document.createElement('p');paragraph.textContent=String(text).trim();const meta=document.createElement('small');meta.textContent=`${role==='user'?'Vous':'PocketGuide'} · ${nowTime()}`;
  if(source==='local')meta.title='Réponse disponible hors ligne';turn.append(paragraph,meta);log.append(turn);log.scrollTop=log.scrollHeight;
}

function setView(view){
  const target=['companion','journey','memories'].includes(view)?view:'companion';if(pocketGuideState.select('ui.panel')!==target)pocketGuideState.patch({ui:{panel:target}},{source:'pg21-ui',event:'ui.panel.changed'});
  app.dataset.view=target;$$('[data-view-panel]').forEach(panel=>{const active=panel.dataset.viewPanel===target;panel.hidden=!active;panel.classList.toggle('is-active',active);});
  $$('[data-view-target]').forEach(button=>button.classList.toggle('is-active',button.dataset.viewTarget===target));
  if(target==='journey'){renderTimeline();if(pocketGuideState.select('ui.journeyMode')==='map')showJourneyMode('map');}
  if(target==='memories')void renderLibrary();
  adaptiveMomentEngine.sync();scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

function renderTimeline(){
  const host=$('#journeyTimeline');if(!host)return;const route=pocketGuideState.select('route'),completed=new Set(route.completedEventIds||[]),skipped=new Set(route.skippedEventIds||[]),events=allEvents();
  host.innerHTML=events.map(event=>{const place=placeById(event.placeId),current=event.id===route.currentEventId,done=completed.has(event.id)||skipped.has(event.id),state=current?'Maintenant':skipped.has(event.id)?'Passée':completed.has(event.id)?'Visitée':'';return `<article class="timeline-item${current?' is-current':''}${done?' is-done':''}" data-event-id="${esc(event.id)}"><time class="timeline-time">${esc(event.time||'—')}</time><div class="timeline-copy"><strong>${esc(place?.name||event.title||'Étape')}</strong><small>${esc(place?.historyShort||place?.description||event.title||'')}</small></div><span class="timeline-state">${esc(state)}</span></article>`;}).join('')||'<p>Aucune étape dans ce voyage.</p>';
}
function renderMap(){
  const host=$('#journeyMap');if(!host||!globalThis.L)return;const places=pocketGuideState.select('route.pack.places')||[];
  if(!map){map=L.map(host,{zoomControl:true,attributionControl:true});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);}
  if(routeLayer)routeLayer.remove();const valid=places.filter(place=>Number.isFinite(Number(place.lat))&&Number.isFinite(Number(place.lng)));const group=L.featureGroup();
  valid.forEach((place,index)=>L.circleMarker([place.lat,place.lng],{radius:8,color:'#eacb82',weight:2,fillColor:index===0?'#79dccf':'#08292e',fillOpacity:1}).bindPopup(`<strong>${esc(place.name||'Étape')}</strong>`).addTo(group));
  if(valid.length>1)L.polyline(valid.map(place=>[place.lat,place.lng]),{color:'#2d8f87',weight:4,opacity:.82,dashArray:'8 8'}).addTo(group);group.addTo(map);routeLayer=group;
  if(valid.length)map.fitBounds(group.getBounds().pad(.15),{maxZoom:16});updatePositionMarker();setTimeout(()=>map.invalidateSize(),80);
}
function updatePositionMarker(){
  if(!map||!globalThis.L)return;const locationState=pocketGuideState.select('location');if(!Number.isFinite(locationState?.lat)||!Number.isFinite(locationState?.lng))return;
  if(!positionMarker)positionMarker=L.circleMarker([locationState.lat,locationState.lng],{radius:9,color:'#fff',weight:3,fillColor:'#36b5a8',fillOpacity:1}).addTo(map);else positionMarker.setLatLng([locationState.lat,locationState.lng]);
}
function showJourneyMode(mode){
  const target=mode==='map'?'map':'timeline';pocketGuideState.patch({ui:{journeyMode:target}},{source:'pg21-ui',event:'ui.journey.mode.changed'});$('#journeyTimeline').hidden=target!=='timeline';$('#journeyMap').hidden=target!=='map';$$('[data-journey-mode]').forEach(button=>button.classList.toggle('is-active',button.dataset.journeyMode===target));if(target==='map')renderMap();
}

function renderHero(){
  const state=pocketGuideState.get(),place=currentPlace(),snapshot=walkingGuidanceEngine.lastSnapshot,events=allEvents(),done=(state.route.completedEventIds?.length||0)+(state.route.skippedEventIds?.length||0),progress=events.length?Math.round(done/events.length*100):0;
  setText('#routeTitle',state.route.title||'Votre compagnon');setText('#journeyTitle',state.route.title||'Le voyage');setText('#placeTitle',place?.name||place?.title||'Parcours terminé');
  setText('#placeStory',snapshot?.phase==='arrived'?(place?.historyShort||place?.description||'Prenez le temps de regarder autour de vous.'):place?.description||place?.arCue||'Je reste avec vous pendant le voyage.');
  const image=safeImage(snapshot?.media?.heroImage||place?.heroImage||place?.media?.[0]?.url);const stage=$('#visualStage');if(stage)stage.style.backgroundImage=image?`linear-gradient(180deg,rgba(2,12,15,.05),rgba(2,12,15,.12)),url(${JSON.stringify(image)})`:'';
  setText('#distanceLabel',snapshot?formatDistance(snapshot.distanceMeters):'Distance en attente');setText('#remainingLabel',Number.isFinite(state.route.remainingMinutes)?formatDuration(state.route.remainingMinutes):'Durée en attente');setText('#progressLabel',`${progress} %`);
  const phase=snapshot?.phase||'waiting_gps';$('#directionCard').dataset.phase=phase;setText('#directionPhase',({waiting_gps:'Je vous situe',gps_degraded:'Position imprécise',en_route:'En chemin',preview:'Bientôt',approaching:'Vous approchez',arrived:'Nous y sommes',completed:'Voyage accompli'})[phase]||'Avec vous');setText('#directionText',snapshot?.instruction||'Activez votre position lorsque vous serez prêt.');
  const gps=state.perception.gps;setText('#gpsSense',gps==='ready'?(state.location.accuracy?`Position ±${Math.round(state.location.accuracy)} m`:'Position active'):gps==='denied'?'Position refusée':gps==='degraded'?'Position imprécise':'Position en attente');
  setText('#visionSense',state.perception.camera==='ready'?'Je regarde avec vous':'Vision au repos');
  renderTimeline();if(map)updatePositionMarker();if(state.ui.ar)renderARLabels();renderDebug();
}

function renderDebug(){if(!debugRequested)return;const target=$('#debugPanel');target.hidden=false;target.textContent=JSON.stringify({state:pocketGuideState.get(),realtime:{connected:realtimeCompanion.connected,connecting:realtimeCompanion.connecting,listening:realtimeCompanion.listening,model:realtimeCompanion.model,lastError:realtimeCompanion.lastError},guidance:walkingGuidanceEngine.lastSnapshot},null,2);}

async function renderLibrary(){
  const host=$('#journeyLibrary');if(!host)return;const items=await itineraryManager.list({includeArchived:showArchives}),estimate=await itineraryStore.storageEstimate();setText('#storageLabel',estimate.quota?`${formatBytes(estimate.usage)} utilisés`:'Stockage local');
  host.innerHTML=items.map(item=>`<article class="journey-card" data-itinerary="${esc(item.id)}"><div class="journey-cover"><div><h3>${esc(item.label||item.title)}</h3><small>${esc(item.title)} · ${esc(formatDate(item.updatedAt))}</small></div></div><div class="journey-body"><div class="journey-meta"><span>${esc(item.status==='archived'?'Archivé':item.status==='completed'?'Terminé':item.status==='in_progress'?'En cours':'Planifié')}</span><span>${Number(item.stats?.poiCount)||0} étapes</span><span>${Number(item.stats?.mediaCount)||0} souvenir${Number(item.stats?.mediaCount)===1?'':'s'}</span><span>Révision ${Number(item.revision)||1}</span></div><div class="journey-actions"><button class="action action--accent" data-library-action="open" type="button">Reprendre</button><button class="action" data-library-action="preview" type="button">Simuler</button><button class="action" data-library-action="journal" type="button">Carnet</button><button class="action" data-library-action="export" type="button">Exporter</button><details><summary>Plus d’actions</summary><div class="journey-more"><button class="action" data-library-action="rename" type="button">Renommer</button><button class="action" data-library-action="duplicate" type="button">Dupliquer</button><button class="action" data-library-action="archive" type="button">${item.status==='archived'?'Restaurer':'Archiver'}</button><button class="action" data-library-action="delete" type="button">Supprimer</button></div></details></div></div></article>`).join('')||'<p class="privacy-note">Aucun voyage enregistré. Demandez-moi de créer une excursion.</p>';
  items.forEach(item=>{const root=[...host.querySelectorAll('[data-itinerary]')].find(card=>card.dataset.itinerary===item.id),card=root?.querySelector('.journey-cover'),cover=safeImage(item.cover);if(card&&cover)card.style.backgroundImage=`linear-gradient(to top,rgba(2,14,17,.92),rgba(2,14,17,.08)),url(${JSON.stringify(cover)})`;});
}

async function openPreview(id=currentItineraryId()){
  if(!id){toast('Aucun voyage actif à simuler.');return;}realtimeCompanion.stopListening();await itineraryManager.flush().catch(()=>null);const itinerary=await itineraryStore.getItinerary(id),media=await itineraryStore.listMedia(id);if(!itinerary)return;
  previewItineraryId=id;photoPreviewEngine.load({itinerary,media,mode:MODES.PREPARATORY});setText('#previewTitle',itinerary.label||itinerary.title);showDialog($('#previewDialog'));adaptiveMomentEngine.setPreview(true);
}
function renderPreviewScene(scene){
  if(!scene){setText('#previewPlace','Aucune scène');setText('#previewStory','Ce carnet ne contient pas encore de média.');setText('#previewCount','0 / 0');$('#previewVisual').style.backgroundImage='';return;}
  setText('#previewPlace',scene.title);setText('#previewStory',scene.story||scene.narration||'');setText('#previewLeg',scene.sceneIndex?`${scene.distanceMeters??'—'} m · environ ${scene.walkingMinutes??'—'} min`:'Départ');setText('#previewCount',`${scene.sceneIndex+1} / ${scene.totalScenes}`);setText('#previewSource',scene.provenance||'RoutePack');$('#previewProgress').style.width=`${Math.round(scene.progress*100)}%`;
  const image=safeImage(scene.imageUrl);$('#previewVisual').style.backgroundImage=image?`linear-gradient(to top,rgba(2,14,17,.94),rgba(2,14,17,.05)),url(${JSON.stringify(image)})`:'';if(previewVoice)voiceController.speak(scene.narration||scene.story||scene.title);
}

async function openJournal(id=currentItineraryId()){
  if(!id)return;const data=await audiovisualJournal.load(id);journalUrls.splice(0).forEach(revoke);setText('#journalTitle',data.itinerary.label||data.itinerary.title);const host=$('#journalEntries');host.innerHTML='';
  for(const entry of data.entries){const article=document.createElement('article');article.className='journal-entry';let src=safeImage(entry.imageUrl);if(!src&&entry.thumbnail){src=URL.createObjectURL(entry.thumbnail);journalUrls.push(src);}const image=document.createElement('img');image.alt='';if(src)image.src=src;const body=document.createElement('div'),title=document.createElement('h4'),story=document.createElement('p');title.textContent=entry.title;story.textContent=entry.story||entry.provenance;body.append(title,story);article.append(image,body);host.append(article);}
  $('#journal').hidden=false;setView('memories');$('#journal').scrollIntoView({behavior:'smooth',block:'start'});
}

async function openAR(){
  if(pocketGuideState.select('ui.ar'))return;setPresence({value:'connecting',label:'J’ouvre notre regard commun'});const orientation=platformAdapter.requestOrientationPermission();const [camera,oriented]=await Promise.all([perceptionEngine.openCamera($('#companionCamera')),orientation.then(ok=>ok?perceptionEngine.startOrientation({requestPermission:false}):false)]);
  if(!camera){setPresence({value:'degraded',label:'La caméra reste fermée'});toast('Je ne peux pas ouvrir la caméra. Vérifiez son autorisation dans le navigateur.');return;}
  pocketGuideState.patch({ui:{ar:true,arRequested:false,panel:'companion'}},{source:'pg21-ar',event:'ar.opened'});app.dataset.ar='true';$('#arLayer').hidden=false;setView('companion');setPresence({value:'ready',label:'Je regarde avec vous',connected:realtimeCompanion.connected});renderARLabels();arRenderTimer=setInterval(renderARLabels,300);
}
function renderARLabels(){
  const host=$('#arLabels');if(!host)return;const projected=geoAREngine.project({fov:70,maxDistanceKm:3}).filter(item=>item.visible).slice(0,5);host.innerHTML=projected.map((item,index)=>`<button class="ar-poi" type="button" data-ar-place="${esc(item.place.id)}" style="left:${Math.max(12,Math.min(88,item.x*100))}%;top:${34+index*10}%"><strong>${esc(item.place.name)}</strong><small>${Math.round(item.distanceKm*1000)} m · ${esc(item.direction)}</small></button>`).join('');
}
function closeAR(){clearInterval(arRenderTimer);arRenderTimer=null;perceptionEngine.closeCamera($('#companionCamera'));pocketGuideState.patch({ui:{ar:false,arRequested:false}},{source:'pg21-ar',event:'ar.closed'});delete app.dataset.ar;$('#arLayer').hidden=true;setPresence({value:'ready',label:'Je suis avec vous',connected:realtimeCompanion.connected});}

function preparePhoto(blob){
  pendingPhoto=blob;pendingVoiceNote=null;revoke(pendingPhotoUrl);pendingPhotoUrl=URL.createObjectURL(blob);$('#photoPreview').src=pendingPhotoUrl;$('#photoCaption').value='';setText('#voiceNoteStatus','Aucune note');
  const locationState=pocketGuideState.select('location'),measured=Number.isFinite(locationState?.lat)&&Number.isFinite(locationState?.lng)&&!pocketGuideState.select('session.simulation');setText('#photoLocation',measured?`Position mesurée ±${Math.round(locationState.accuracy||0)} m`:'Aucune position réelle ne sera inventée');showDialog($('#photoDialog'));
}
async function blobDataUrl(blob){return blobToDataUrl(blob);}

function installEvents(){
  companionOrchestrator.install({remoteAudio:$('#remoteAudio')});companionOrchestrator.setVoiceOutput(!session.quietMode);companionOrchestrator.onTurn=(role,text,meta)=>appendTurn(role,text,meta);companionOrchestrator.onStatus=setPresence;
  companionOrchestrator.onPlanning=value=>adaptiveMomentEngine.setPlanning(value);companionOrchestrator.onPlanReady=result=>{pendingPlanPack=result?.plan?.pack||null;renderProposalSummary(pendingPlanPack);};companionOrchestrator.onProposal=proposal=>{if(proposal){pendingPlanPack=packFromProposal(proposal)||pendingPlanPack;setText('#proposalText',proposal.summary||'Je vous propose un changement.');renderProposalSummary(pendingPlanPack);showDialog($('#proposalDialog'));}else closeDialog($('#proposalDialog'));};
  adaptiveMomentEngine.onChange=renderMoment;adaptiveMomentEngine.start();renderMoment(adaptiveMomentEngine.current);
  $$('[data-view-target]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.viewTarget)));$('#homeIdentity').addEventListener('click',()=>setView('companion'));
  for(const button of [$('#momentPrimary'),$('#momentSecondary')])button?.addEventListener('click',()=>void runMomentAction(button.dataset.momentAction));$('#toggleConversation').addEventListener('click',()=>setConversationExpanded(!session.conversationExpanded));setConversationExpanded(session.conversationExpanded!==false);
  $('#companionMic').addEventListener('click',()=>companionOrchestrator.toggleListening());$('#stopCompanion').addEventListener('click',()=>companionOrchestrator.interrupt());
  $$('[data-prompt]').forEach(button=>button.addEventListener('click',()=>companionOrchestrator.ask(button.dataset.prompt,{source:'suggestion',speak:true})));
  $('#companionForm').addEventListener('submit',event=>{event.preventDefault();const input=$('#companionInput'),value=input.value;input.value='';void companionOrchestrator.ask(value,{source:'text'});});
  $('#startTogether').addEventListener('click',async()=>{closeDialog($('#welcomeDialog'));session.quietMode=false;companionOrchestrator.setVoiceOutput(true);saveCompanionSession({...session,currentItineraryId:currentItineraryId()});setPresence({value:'connecting',label:'Je vous rejoins…'});await companionOrchestrator.startVoice();renderHero();});
  $('#exploreQuietly').addEventListener('click',()=>{closeDialog($('#welcomeDialog'));session.quietMode=true;companionOrchestrator.setVoiceOutput(false);saveCompanionSession({...session,currentItineraryId:currentItineraryId()});appendTurn('companion','Je reste avec vous discrètement. Vous pouvez écrire, consulter le voyage ou activer ma voix plus tard.',{source:'local'});});
  $$('[data-journey-mode]').forEach(button=>button.addEventListener('click',()=>showJourneyMode(button.dataset.journeyMode)));$('#startGps').addEventListener('click',requestLocation);$('#allowPosition').addEventListener('click',async()=>{closeDialog($('#locationDialog'));setPresence({value:'connecting',label:'Je vous situe…'});const started=await perceptionEngine.startLocation();if(!started)toast('La position reste indisponible. Vérifiez l’autorisation du navigateur.',4500);renderHero();});$('#positionLater').addEventListener('click',()=>closeDialog($('#locationDialog')));
  $('#simulateJourney').addEventListener('click',()=>openPreview());$('#createByVoice').addEventListener('click',()=>{setView('companion');void companionOrchestrator.toggleListening();toast('Dites-moi la destination, la durée, le rythme et vos envies.');});$('#createByText').addEventListener('click',()=>showDialog($('#plannerDialog')));
  $('#plannerForm').addEventListener('submit',async event=>{event.preventDefault();const prompt=$('#plannerPrompt').value.trim();if(prompt.length<8){setText('#plannerStatus','Décrivez un peu davantage votre excursion.');return;}adaptiveMomentEngine.setPlanning(true);setText('#plannerStatus','Je vérifie les lieux et je construis un parcours cohérent…');try{const result=await plannerEngine.proposeReplacement({prompt,destination:$('#plannerDestination').value,maxPlaces:Number($('#plannerPlaces').value)||5});pendingPlanPack=result.plan.pack;renderProposalSummary(pendingPlanPack);setText('#plannerStatus',`« ${result.plan.pack.title} » est prêt. Je demande votre confirmation.`);closeDialog($('#plannerDialog'));setText('#proposalText',result.proposal.summary);showDialog($('#proposalDialog'));}catch(error){setText('#plannerStatus',`Je n’ai pas pu préparer cette excursion : ${error.message||error}`);}finally{adaptiveMomentEngine.setPlanning(false);}});
  $$('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>closeDialog(document.getElementById(button.dataset.closeDialog))));
  $('#confirmProposal').addEventListener('click',async()=>{closeDialog($('#proposalDialog'));const result=await companionOrchestrator.resolveProposal(true,{speak:true});if(result?.error)return;pendingPlanPack=null;enrichKnownMedia();await itineraryManager.saveCurrent('pg21-proposal-confirmed');session.currentItineraryId=currentItineraryId();saveCompanionSession(session);renderHero();adaptiveMomentEngine.sync();showDialog($('#readyDialog'));});$('#rejectProposal').addEventListener('click',()=>{closeDialog($('#proposalDialog'));pendingPlanPack=null;renderProposalSummary(null);void companionOrchestrator.resolveProposal(false,{speak:true});});
  $('#previewNow').addEventListener('click',()=>{closeDialog($('#readyDialog'));void openPreview();});$('#previewLater').addEventListener('click',()=>closeDialog($('#readyDialog')));
  photoPreviewEngine.onScene=renderPreviewScene;photoPreviewEngine.onStatus=status=>{setText('#previewPlay',status.status==='running'?'Pause':'Lecture');};$('#closePreview').addEventListener('click',()=>{photoPreviewEngine.pause();voiceController.interrupt();closeDialog($('#previewDialog'));adaptiveMomentEngine.setPreview(false);});$('#previewPrevious').addEventListener('click',()=>photoPreviewEngine.previous());$('#previewNext').addEventListener('click',()=>photoPreviewEngine.next());$('#previewRepeat').addEventListener('click',()=>photoPreviewEngine.repeat());$('#previewPlay').addEventListener('click',()=>photoPreviewEngine.running?photoPreviewEngine.pause():photoPreviewEngine.play());
  $('#captureMemory').addEventListener('click',()=>$('#photoInput').click());$('#lookWithCompanion').addEventListener('click',()=>$('#photoInput').click());$('#photoInput').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)preparePhoto(file);});
  $('#savePhoto').addEventListener('click',async()=>{if(!pendingPhoto)return;try{const record=await savePersonalPhoto(pendingPhoto,{itineraryId:currentItineraryId(),association:$('#photoAssociation').value,caption:$('#photoCaption').value,voiceNote:pendingVoiceNote});await itineraryManager.mediaSaved(record.itineraryId);closeDialog($('#photoDialog'));toast('Souvenir enregistré uniquement sur ce téléphone.');pendingPhoto=null;pendingVoiceNote=null;void renderLibrary();}catch(error){toast(error.message||error,5000);}});
  $('#askAboutPhoto').addEventListener('click',async()=>{if(!pendingPhoto)return;if(!confirm('Cette action transmettra ponctuellement cette image à OpenAI pour répondre à votre question. La photo ne sera pas synchronisée ni conservée automatiquement. Continuer ?'))return;setText('#voiceNoteStatus','Je regarde cette image avec vous…');const connected=realtimeCompanion.connected||await realtimeCompanion.connect({remoteAudio:$('#remoteAudio')});if(!connected){setText('#voiceNoteStatus','Analyse visuelle indisponible. Vous pouvez conserver la photo localement.');return;}const dataUrl=await blobDataUrl(pendingPhoto);await companionOrchestrator.analyzeImage(dataUrl);closeDialog($('#photoDialog'));setView('companion');});
  $('#recordVoiceNote').addEventListener('click',async()=>{try{if(voiceRecorder.recorder){pendingVoiceNote=await voiceRecorder.stop();setText('#voiceNoteStatus','Note vocale prête et locale');realtimeCompanion.beginListening();}else{realtimeCompanion.stopListening();await voiceRecorder.start();setText('#voiceNoteStatus','Enregistrement… touchez pour terminer');}}catch(error){setText('#voiceNoteStatus',error.message||String(error));}});
  $('#openAr').addEventListener('click',()=>openAR());$('#closeAr').addEventListener('click',closeAR);$('#arLabels').addEventListener('click',event=>{const button=event.target.closest('[data-ar-place]');if(button){geoAREngine.focus(button.dataset.arPlace);const place=placeById(button.dataset.arPlace);if(place)void companionOrchestrator.ask(`Raconte-moi ${place.name}`,{source:'ar'});}});
  $('#showArchived').addEventListener('click',()=>{showArchives=!showArchives;$('#showArchived').setAttribute('aria-pressed',String(showArchives));setText('#showArchived',showArchives?'Masquer les archives':'Archives');void renderLibrary();});$('#importJourney').addEventListener('click',()=>$('#importInput').click());$('#importInput').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const result=await importPortableBundle(file);toast(result.collision?'Voyage importé comme copie.':'Voyage importé.');void renderLibrary();}catch(error){toast(error.message||error,5000);}});
  $('#journeyLibrary').addEventListener('click',async event=>{const button=event.target.closest('[data-library-action]');if(!button)return;const card=button.closest('[data-itinerary]'),id=card?.dataset.itinerary,action=button.dataset.libraryAction;if(!id)return;try{if(action==='open'){await itineraryManager.load(id);session.currentItineraryId=id;saveCompanionSession(session);enrichKnownMedia();renderHero();setView('companion');appendTurn('companion',`Nous reprenons « ${pocketGuideState.select('route.title')} » exactement où vous l’aviez laissé.`,{source:'local'});}if(action==='preview')await openPreview(id);if(action==='journal')await openJournal(id);if(action==='export'){const item=await itineraryStore.getItinerary(id),blob=await createPortableBackupBlob(id);downloadPortableBackup(blob,backupFilename(item));toast('Sauvegarde complète créée.');}if(action==='rename'){const item=await itineraryStore.getItinerary(id),label=prompt('Nouveau nom du voyage',item?.label||item?.title||'');if(label){await itineraryManager.rename(id,label);void renderLibrary();}}if(action==='duplicate'){await itineraryManager.duplicate(id);toast('Copie créée.');void renderLibrary();}if(action==='archive'){const item=await itineraryStore.getItinerary(id);await itineraryManager.archive(id,item?.status!=='archived');void renderLibrary();}if(action==='delete'){const item=await itineraryStore.getItinerary(id);if(id===currentItineraryId()){toast('Ouvrez un autre voyage avant de supprimer celui qui vous accompagne actuellement.',4500);}else if(confirm(`Supprimer « ${item?.label||item?.title||'ce voyage'} » et tous ses médias locaux ?`)){await itineraryManager.delete(id);toast('Voyage et médias supprimés du téléphone.');void renderLibrary();}}}catch(error){toast(error.message||error,5000);}});
  $('#closeJournal').addEventListener('click',()=>{$('#journal').hidden=true;journalUrls.splice(0).forEach(revoke);});
  eventBus.on('ui.panel.changed',payload=>setView(payload?.after?.ui?.panel||pocketGuideState.select('ui.panel')));eventBus.on('ui.preview.requested',()=>openPreview());eventBus.on('ui.vision.requested',()=>$('#photoInput').click());eventBus.on('ui.journal.requested',()=>openJournal());eventBus.on('ui.location.requested',requestLocation);eventBus.on('ar.requested',()=>{toast('Touchez « Voir en AR » pour ouvrir la caméra avec votre accord.',4500);});
  eventBus.on('gps.updated',()=>{walkingGuidanceEngine.processPosition();realtimeCompanion.sendContext('position mesurée');renderHero();adaptiveMomentEngine.sync();});eventBus.on('heading.updated',()=>{realtimeCompanion.sendContext('orientation');renderHero();});eventBus.on('guidance.snapshot',payload=>{renderHero();adaptiveMomentEngine.snapshot=payload;adaptiveMomentEngine.sync();});eventBus.on('guidance.cue',payload=>{appendTurn('companion',payload.text,{source:'guidance'});if(realtimeCompanion.connected)realtimeCompanion.announce(payload.text);else if(!session.quietMode)voiceController.speak(payload.text);});
  for(const type of ['route.loaded','route.replaced','route.advanced','route.skipped','route.shortened','route.completed','route.media.enriched'])eventBus.on(type,()=>{enrichKnownMedia();renderHero();realtimeCompanion.sendContext(type);session.currentItineraryId=currentItineraryId();saveCompanionSession(session);});
  eventBus.on('network.offline',()=>{realtimeCompanion.disconnect();setPresence({value:'degraded',label:'Je poursuis avec votre voyage'});});eventBus.on('network.online',()=>{toast('Le réseau est revenu. Touchez ma présence pour reprendre la conversation en direct.');});
  window.addEventListener('pagehide',()=>{saveCompanionSession({...session,currentItineraryId:currentItineraryId()});photoPreviewEngine.pause();voiceRecorder.cancel();});
}

async function loadInitialRoute(){
  const requested=params.get('route');if(requested){await loadRouteIntoV16({routeId:requested});return;}
  const saved=await itineraryManager.list({includeArchived:false});const preferred=session.currentItineraryId&&saved.find(item=>item.id===session.currentItineraryId),candidate=preferred||saved[0];
  if(candidate)await itineraryManager.load(candidate.id);else await loadRouteIntoV16();
}

async function boot(){
  registerRouteActions();registerV2Actions();platformAdapter.updateDeviceState();platformAdapter.installNetworkWatch();resetSensorsForRealSession(pocketGuideState);
  await loadInitialRoute();enrichKnownMedia();pocketGuideState.patch({version:'2.1.0-rc1',boot:{status:'ready',startedAt:new Date().toISOString()},session:{id:`pg21_${Date.now().toString(36)}`,startedAt:new Date().toISOString(),simulation:false},ui:{panel:'companion',journeyMode:'timeline',moment:'ready'}},{source:'pg21-bootstrap',event:'app.ready'});
  installEvents();walkingGuidanceEngine.start();itineraryManager.start();await itineraryManager.saveCurrent('pg21-initial');session.currentItineraryId=currentItineraryId();saveCompanionSession(session);
  appendTurn('companion',`Bonjour. Je serai votre guide personnelle pour « ${pocketGuideState.select('route.title')} ». Vous pouvez me parler comme à une accompagnatrice : je prépare, j’explique, je vous guide et je garde vos souvenirs sur ce téléphone.`,{source:'local'});renderHero();renderTimeline();adaptiveMomentEngine.sync();
  if(simulationRequested||walkingSimulationRequested){closeDialog($('#welcomeDialog'));session.quietMode=true;perceptionEngine.setMode('simulation');perceptionEngine.simulateAtCurrent();appendTurn('companion','Simulation active. Elle reste strictement séparée de toute position réelle.',{source:'local'});if(walkingSimulationRequested){walkingSimulator.prepare();walkingSimulator.onStatus=status=>{if(status.status==='completed')toast('Simulation de marche terminée.');};walkingSimulator.run();}}
  else if(!livingCompanion)showDialog($('#welcomeDialog'));
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(error=>eventBus.emit('pwa.registration.failed',{message:String(error?.message||error)}));
  navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='POCKETGUIDE_UPDATE_READY')toast('Une nouvelle version est prête. Elle sera appliquée au prochain démarrage.',5000);});
  globalThis.__POCKETGUIDE_V21__={state:pocketGuideState,bus:eventBus,actions:actionRegistry,companion:companionOrchestrator,realtime:realtimeCompanion,planner:plannerEngine,perception:perceptionEngine,guidance:walkingGuidanceEngine,simulator:walkingSimulator,itineraries:itineraryManager,preview:photoPreviewEngine,moments:adaptiveMomentEngine,openAR,openPreview,openJournal,render:renderHero};
}

boot().catch(error=>{console.error(error);setPresence({value:'error',label:'Je n’ai pas pu ouvrir le voyage',message:error.message||String(error)});appendTurn('companion',`Erreur de démarrage : ${error.message||error}`,{source:'error'});toast('PocketGuide V2.1 n’a pas pu terminer son démarrage.',5000);});

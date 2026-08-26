import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {proposalManager} from '../../pg16/core/proposal-manager.js';
import {plannerEngine} from '../../pg16/planner/planner-engine.js';
import {voiceController} from '../../pg16/guide/voice-controller.js';
import {humanContextEngine} from '../../pg16/core/context-engine.js';
import {itineraryManager} from '../../pg18/itineraries/itinerary-manager.js';
import {TOOLS} from '../../pg2/companion/realtime-companion.js';
import {humanRealtimeCompanion} from '../../pg21/companion/human-realtime-companion.js';
import {planningStageEngine} from '../planning/planning-stage-engine.js';
import {mediaPackEngine} from '../media/media-pack-engine.js';
import {unifiedVoiceService} from '../audio/unified-audio-pack.js';
import {avatarRuntime} from '../avatar/avatar-runtime.js';
import {mapModeController,googleReadiness} from '../maps/map-mode-controller.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
let wrapped=false,pendingGoogleMode=null;

const UNIFIED_PERSONA=`Tu incarnes PocketGuide V2.2, une unique accompagnatrice humaine numérique de voyage : chaleureuse, cultivée, éloquente, élégante et attentive. Tu ne te fais jamais passer pour une personne physique. Tu parles en français naturel avec la voix marin. L’utilisateur ne doit jamais percevoir plusieurs IA ou moteurs.

Tu orchestres l’application : Terra vérifie et prépare, les règles GPS déterministes sécurisent la marche et les médias illustrent, mais tu restes la seule personnalité qui explique le résultat. Pendant la marche, une ou deux phrases suffisent. À un POI, raconte avec précision et distingue les faits vérifiés des conseils. N’invente jamais position, distance, direction, horaire, accessibilité, couverture Street View ou capacité 3D.

Pour une excursion, recueille destination ou « autour de moi », durée, rythme et centres d’intérêt, puis montre que tu réfléchis. Toute modification structurelle reste une proposition jusqu’à confirmation. Une image personnelle n’est transmise qu’après une action et un consentement explicites. Les photos Google restent en ligne et les photos personnelles restent locales par défaut. Tu peux être interrompue immédiatement, sans protester ni répéter inutilement.`;

function installUnifiedRealtimePersona(){humanRealtimeCompanion.sessionUpdate=function(reason='initial'){if(!this.connected)return false;const context=humanContextEngine.build(),moment=pocketGuideState.select('ui.moment')||'ready';return this.send({type:'session.update',session:{type:'realtime',instructions:`${UNIFIED_PERSONA}\n\nMoment ergonomique : ${moment}.\nContexte PocketGuide (${reason}) : ${JSON.stringify(context)}`,tools:TOOLS,tool_choice:'auto',reasoning:{effort:'low'},audio:{input:{noise_reduction:{type:'near_field'},transcription:{model:'gpt-4o-mini-transcribe',language:'fr'},turn_detection:{type:'semantic_vad',create_response:true,interrupt_response:true}},output:{voice:'marin'}}}});};}

function currentPlace(){const route=pocketGuideState.select('route')||{},event=(route.pack?.days||[]).flatMap(day=>day.events||[]).find(item=>item.id===route.currentEventId);return (route.pack?.places||[]).find(place=>place.id===event?.placeId)||(route.pack?.places||[])[0]||null;}
function attributionFromPlace(place){const media=place?.media?.[0],legacy=place?.imageAttribution;if(media)return {label:media.attribution||[media.author,media.license,media.source].filter(Boolean).join(' · '),url:media.sourceUrl||media.descriptionUrl||''};if(legacy)return {label:[legacy.author,legacy.license,legacy.source].filter(Boolean).join(' · '),url:legacy.sourceUrl||legacy.descriptionUrl||''};return null;}
function setAttribution(target,value){if(!target)return;if(!value?.label||!/^https:\/\//.test(value.url||'')){target.hidden=true;target.removeAttribute('href');return;}target.textContent=value.label;target.href=value.url;target.title=value.label;target.hidden=false;}
function renderCurrentAttribution(){setAttribution($('#activeMediaAttribution'),attributionFromPlace(currentPlace()));}
function renderProposalAttributions(){const host=$('#proposalAttributions');if(!host)return;host.replaceChildren();const pack=proposalManager.pending()?.args?.pack,items=(pack?.mediaPack?.items||[]).slice(0,3);for(const item of items){const link=document.createElement('a');link.href=item.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.attribution||`${item.author} · ${item.license} · ${item.source}`;host.append(link);}}
function updatePendingPack(pack){const pending=proposalManager.pending();if(pending?.action==='route.replace')pocketGuideState.patch({proposals:{pending:{...pending,args:{...(pending.args||{}),pack}}}},{source:'pg22-planning',event:'pg22.proposal.enriched'});}
function renderThinkingMedia(payload){const host=$('#thinkingMedia');if(!host)return;const items=payload?.items||[];host.innerHTML=items.slice(-4).map(item=>`<figure title="${String(item.attribution||'').replace(/"/g,'&quot;')}"><img src="${item.thumbnailUrl||item.url}" alt="${String(item.alt||'Aperçu').replace(/"/g,'&quot;')}"><figcaption>${item.author} · ${item.license}</figcaption></figure>`).join('');host.hidden=!items.length;renderProposalAttributions();}

export function installPlanningPipeline(){
  if(wrapped)return;wrapped=true;const original=plannerEngine.proposeReplacement.bind(plannerEngine);
  plannerEngine.proposeReplacement=async request=>{
    const signal=planningStageEngine.begin(request);await new Promise(resolve=>setTimeout(resolve,90));planningStageEngine.set('verification');
    try{
      const result=await original({...request,signal});planningStageEngine.set('route');await new Promise(resolve=>setTimeout(resolve,70));
      planningStageEngine.set('media');const enriched=await mediaPackEngine.enrich(result.plan.pack,{signal,onProgress:progress=>{planningStageEngine.progress('media',progress.index,progress.total,{place:progress.place?.name});eventBus.emit('pg22.media.progress',{...progress,items:progress.items});}});result.plan.pack=enriched.pack;result.proposal={...result.proposal,args:{...(result.proposal.args||{}),pack:enriched.pack}};updatePendingPack(enriched.pack);
      planningStageEngine.set('audio');await unifiedVoiceService.prepare(enriched.pack,{signal,onProgress:progress=>planningStageEngine.progress('audio',progress.index,progress.total,{clip:progress.entry?.key})});updatePendingPack(enriched.pack);
      planningStageEngine.set('finalizing');await new Promise(resolve=>setTimeout(resolve,80));planningStageEngine.complete({routeId:enriched.pack.id});return result;
    }catch(error){if(error?.name==='AbortError'||signal.aborted){proposalManager.reject('planning_cancelled');planningStageEngine.cancel('user',false);eventBus.emit('pg22.planning.cancelled',{reason:'user',request});throw new DOMException('Préparation annulée. Votre voyage actuel reste intact.','AbortError');}planningStageEngine.fail(error);throw error;}
  };
}

function installPlanningUi(){
  eventBus.on('pg22.planning.stage',payload=>{const thinking=$('#thinkingPanel'),stage=payload?.stage;if(thinking)thinking.hidden=!payload.running;if(stage){$('#thinkingLabel').textContent=stage.label;$('#thinkingProgress').style.width=`${Math.min(100,stage.progress||0)}%`;avatarRuntime.setState(payload.running?'thinking':'ready',stage.label);}});
  eventBus.on('pg22.planning.cancelled',()=>{const panel=$('#thinkingPanel');if(panel)panel.hidden=true;const status=$('#plannerStatus');if(status)status.textContent='Préparation annulée. Votre voyage actuel est intact et vous pouvez modifier la demande.';});
  eventBus.on('pg22.media.progress',renderThinkingMedia);
  $('#cancelPlanning')?.addEventListener('click',()=>planningStageEngine.cancel('user'));
  $('#modifyPlanning')?.addEventListener('click',()=>{planningStageEngine.cancel('modify');$('#thinkingPanel').hidden=true;const dialog=$('#plannerDialog');if(dialog&&!dialog.open)dialog.showModal();$('#plannerPrompt')?.focus();});
}

async function renderMapDiagnostic(){try{const response=await fetch('./data/v22-config.json',{cache:'no-store'}),config=await response.json(),ready=googleReadiness(config),target=$('#googleDiagnostic');if(!target)return;target.textContent=ready.ready?'Clé Google dédiée : restrictions, quotas et alertes déclarés conformes.':'Google inactif : clé dédiée, restrictions, quotas et alertes restent à valider.';target.dataset.ready=String(ready.ready);}catch{}}
function installMaps(){
  mapModeController.install({host:$('#googleMapHost'),osmHost:$('#journeyMap'),statusHost:$('#mapModeStatus')});mapModeController.onMode=({mode})=>$$('[data-map-mode]').forEach(button=>button.classList.toggle('is-active',button.dataset.mapMode===mode));
  $('#mapModeBar')?.addEventListener('click',event=>{const button=event.target.closest('[data-map-mode]');if(!button)return;const mode=button.dataset.mapMode;if(mode==='osm'){void mapModeController.select('osm',{explicit:true,place:currentPlace()});return;}pendingGoogleMode=mode;const dialog=$('#mapConsentDialog');if(dialog?.showModal)dialog.showModal();});
  $('#confirmGoogleMap')?.addEventListener('click',async()=>{const dialog=$('#mapConsentDialog');dialog?.close();const mode=pendingGoogleMode;pendingGoogleMode=null;await mapModeController.select(mode,{explicit:true,place:currentPlace()});});
  $('#cancelGoogleMap')?.addEventListener('click',()=>{$('#mapConsentDialog')?.close();pendingGoogleMode=null;});renderMapDiagnostic();
}

function installAudioPersistence(){
  eventBus.on('proposal.confirmed',async()=>{await new Promise(resolve=>setTimeout(resolve,260));const routeId=pocketGuideState.select('route.pack.id'),itineraryId=itineraryManager.currentId();await unifiedVoiceService.attachToItinerary(routeId,itineraryId).catch(()=>0);});
  eventBus.on('route.loaded',()=>{const routeId=pocketGuideState.select('route.pack.id'),itineraryId=itineraryManager.currentId();void unifiedVoiceService.hydrateItinerary(itineraryId,routeId);});
}

function installMediaAttributions(){
  for(const type of ['route.loaded','route.replaced','route.advanced','guidance.snapshot','pg22.proposal.enriched'])eventBus.on(type,()=>{renderCurrentAttribution();renderProposalAttributions();});eventBus.on('proposal.created',renderProposalAttributions);
  const preview=globalThis.__POCKETGUIDE_V21__?.preview;if(preview?.onScene){const render=preview.onScene;preview.onScene=(scene,...args)=>{render(scene,...args);const value=scene?.attribution?{label:[scene.attribution.author,scene.attribution.license,scene.attribution.source].filter(Boolean).join(' · '),url:scene.attribution.sourceUrl||scene.attribution.descriptionUrl||''}:null;setAttribution($('#previewAttribution'),value);};}renderCurrentAttribution();renderProposalAttributions();
}

export function installBeforeV21(){
  installUnifiedRealtimePersona();installPlanningPipeline();avatarRuntime.install({root:$('#humanGuide'),mouth:$('#avatarMouth'),label:$('#guideStateLabel')});unifiedVoiceService.install({voiceController,guideAudio:$('#guideAudio'),remoteAudio:$('#remoteAudio'),onLevel:level=>avatarRuntime.drive(level)});return true;
}

export function installAfterV21(){
  installPlanningUi();installMaps();installAudioPersistence();installMediaAttributions();eventBus.on('companion.status',payload=>{if(payload.value==='thinking')avatarRuntime.setState('thinking',payload.label);else if(payload.value==='speaking')avatarRuntime.setState('speaking',payload.label);else if(!['planning'].includes(payload.value))avatarRuntime.setState(payload.value==='listening'?'listening':'ready',payload.label);});
  $('#stopCompanion')?.addEventListener('click',()=>{unifiedVoiceService.interrupt();avatarRuntime.interrupt();},{capture:true});document.querySelector('.identity strong').textContent='PocketGuide 2.2';document.title='PocketGuide V2.2 · Votre guide';
  globalThis.__POCKETGUIDE_V22__={version:'2.2.0-rc1',planning:planningStageEngine,audio:unifiedVoiceService,avatar:avatarRuntime,media:mediaPackEngine,maps:mapModeController,googleReadiness};
}

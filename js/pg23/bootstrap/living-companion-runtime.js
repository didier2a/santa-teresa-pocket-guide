import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {proposalManager} from '../../pg16/core/proposal-manager.js';
import {companionOrchestrator21} from '../../pg21/companion/companion-orchestrator.js';
import {unifiedVoiceService} from '../../pg22/audio/unified-audio-pack.js';
import {livingAvatarRuntime,LipSyncLabRuntime} from '../avatar/living-avatar-runtime.js';
import {livingSceneEngine} from '../scenes/living-scene-engine.js';
import {scrollDirector} from '../scenes/scroll-director.js';

const $=selector=>document.querySelector(selector);
let hooksInstalled=false,previewHooked=false;

function allEvents(pack){return(pack?.days||[]).flatMap(day=>day.events||[]);}
function routePack(){return pocketGuideState.select('route.pack')||null;}
function attribution(place){const media=place?.media?.[0],legacy=place?.imageAttribution;if(media)return{label:media.attribution||[media.author,media.license,media.source].filter(Boolean).join(' · '),url:media.sourceUrl||media.descriptionUrl||''};if(legacy)return{label:[legacy.author,legacy.license,legacy.source].filter(Boolean).join(' · '),url:legacy.sourceUrl||legacy.descriptionUrl||''};return null;}
function currentPlace(){const route=pocketGuideState.select('route')||{},pack=route.pack||{},event=allEvents(pack).find(item=>item.id===route.currentEventId);return(pack.places||[]).find(place=>place.id===event?.placeId)||(pack.places||[])[0]||null;}
function sceneId(prefix,value=''){return`${prefix}-${String(value||Date.now()).replace(/[^a-zA-Z0-9._:-]/g,'-')}`.slice(0,120);}

function createRouteScene(pack=routePack(),source='route'){
  if(!pack?.id)return null;const places=pack.places||[],image=places.find(place=>place.heroImage||place.media?.[0]?.url),credit=attribution(image);return livingSceneEngine.create({id:sceneId('route',pack.id),type:'route',title:pack.title||'Votre parcours',text:pack.subtitle||`${places.length} étapes préparées pour vous.`,image:image?.heroImage||image?.media?.[0]?.url||'',attribution:credit,places:places.map(place=>place.name),persist:true,source,meta:{routeId:pack.id,events:allEvents(pack).length}});
}

function installConversationHook(){
  if(hooksInstalled)return true;const original=companionOrchestrator21.onTurn;if(typeof original!=='function')return false;hooksInstalled=true;companionOrchestrator21.onTurn=(role,text,meta={})=>{original(role,text,meta);if(role!=='user')livingSceneEngine.create({id:sceneId('speech',`${Date.now()}-${livingSceneEngine.items.length}`),type:meta.source?.includes('error')?'error':'speech',title:meta.source==='guidance'?'Une indication pour vous':'Je vous réponds',text,persist:false,source:meta.source||'conversation'});};return true;
}

function installPreviewHook(){
  const preview=globalThis.__POCKETGUIDE_V21__?.preview;if(!preview||previewHooked)return false;previewHooked=true;const original=preview.onScene;preview.onScene=(scene,...args)=>{original?.(scene,...args);if(!scene)return;livingSceneEngine.create({id:sceneId('preview',scene.id||scene.eventId||scene.sceneIndex),type:'preview',title:scene.title||scene.placeName||'Votre parcours avant le départ',text:scene.story||scene.narration||'',image:scene.imageUrl||scene.image||'',attribution:scene.attribution?{label:[scene.attribution.author,scene.attribution.license,scene.attribution.source].filter(Boolean).join(' · '),url:scene.attribution.sourceUrl||scene.attribution.descriptionUrl||''}:null,persist:false,source:'preview',meta:{index:scene.sceneIndex,total:scene.totalScenes}});};return true;
}

function installSceneBridges(){
  eventBus.on('app.ready',()=>queueMicrotask(()=>{installConversationHook();setTimeout(installPreviewHook,0);createRouteScene(routePack(),'app-ready');}));
  eventBus.on('companion.status',payload=>{if(payload?.value==='thinking')livingSceneEngine.create({id:'live-thinking',type:'thinking',title:payload.label||'Je réfléchis',text:'Je rassemble le contexte utile avant de vous répondre.',source:'realtime'});});
  eventBus.on('pg22.planning.stage',payload=>{const stage=payload?.stage;if(!stage)return;livingSceneEngine.create({id:'planning-stage',type:payload.running?'thinking':'route',title:stage.label||'Je prépare votre excursion',text:payload.running?`Préparation ${Math.round(stage.progress||0)} %`:'Votre proposition est prête.',persist:false,source:'planner',meta:{stage:stage.id,progress:stage.progress}});});
  eventBus.on('pg22.media.progress',payload=>{const item=(payload?.items||[]).at(-1);if(!item?.url&&!item?.thumbnailUrl)return;livingSceneEngine.create({id:sceneId('media',item.placeId||payload?.place?.id||Date.now()),type:'media',title:payload?.place?.name||'Une image vérifiée',text:item.alt||'Cette image accompagne la préparation de votre parcours.',image:item.thumbnailUrl||item.url,attribution:{label:item.attribution||[item.author,item.license,item.source].filter(Boolean).join(' · '),url:item.sourceUrl||item.descriptionUrl||''},persist:true,source:'media-pack'});});
  eventBus.on('proposal.created',()=>{const pack=proposalManager.pending()?.args?.pack;if(pack)createRouteScene(pack,'proposal');});
  for(const type of ['route.loaded','route.replaced'])eventBus.on(type,()=>createRouteScene(routePack(),type));
  eventBus.on('guidance.snapshot',snapshot=>{if(!snapshot)return;const arrived=snapshot.phase==='arrived',completed=snapshot.phase==='completed',place=snapshot.place||currentPlace(),type=arrived||completed?'arrival':'direction';livingSceneEngine.create({id:sceneId(type,snapshot.eventId||'current'),type,title:completed?'Parcours terminé':arrived?`Vous êtes arrivé à ${place?.name||'cette étape'}`:`Vers ${place?.name||'la prochaine étape'}`,text:snapshot.instruction||'',image:arrived?snapshot.media?.heroImage||place?.heroImage||'':'',attribution:arrived?attribution(place):null,persist:arrived||completed,source:'deterministic-gps',meta:{phase:snapshot.phase,distanceMeters:snapshot.distanceMeters,accuracy:snapshot.accuracy}});});
  eventBus.on('media.personal.saved',payload=>livingSceneEngine.create({id:sceneId('memory',payload.mediaId),type:'memory',title:'Votre souvenir est enregistré',text:'Cette photo et sa position mesurée restent uniquement sur ce téléphone.',persist:true,source:'local-media',meta:{itineraryId:payload.itineraryId,eventId:payload.eventId}}));
  eventBus.on('network.offline',()=>livingSceneEngine.create({id:'offline-continuity',type:'continuity',title:'Je poursuis avec votre voyage',text:'Le laboratoire du visage, le parcours et vos souvenirs locaux restent disponibles hors ligne.',source:'network'}));
  eventBus.on('companion.realtime.error',payload=>livingSceneEngine.create({id:sceneId('error',Date.now()),type:'error',title:'La conversation en direct est momentanément indisponible',text:payload?.message||'Le parcours et les fonctions locales restent disponibles.',source:'realtime'}));
}

function installLab(){
  const dialog=$('#lipSyncLabDialog'),lab=new LipSyncLabRuntime({voiceService:unifiedVoiceService});lab.install({root:$('#labAvatar'),portrait:$('#labAvatarPortrait'),mouth:$('#labAvatarMouth'),readout:{verdict:$('#labVerdict'),viseme:$('#labViseme'),changes:$('#labChanges'),visibility:$('#labVisibility'),status:$('#labStatus')}});
  $('#openLipSyncLab')?.addEventListener('click',()=>{dialog?.showModal?.();requestAnimationFrame(()=>lab.fit());});$('#closeLipSyncLab')?.addEventListener('click',()=>dialog?.close?.());$('#testSilentLips')?.addEventListener('click',()=>void lab.runSilent());$('#testFrenchLips')?.addEventListener('click',()=>void lab.runFrench());$('#testMarinLips')?.addEventListener('click',()=>void lab.runMarin());
  return lab;
}

export function installLivingCompanion(){
  const app=$('#companionApp');livingAvatarRuntime.install({root:$('#humanGuide'),portrait:$('#avatarPortrait'),mouth:$('#avatarMouth')});livingSceneEngine.install({host:$('#sceneStream'),countHost:$('#sceneCount')});scrollDirector.install({flow:$('#livingFlow'),resumeButton:$('#resumeScenes'),app});eventBus.on('pg23.scene.presented',payload=>scrollDirector.present(payload?.node));installSceneBridges();const lab=installLab();
  if(pocketGuideState.select('boot.status')==='ready')queueMicrotask(()=>{installConversationHook();installPreviewHook();createRouteScene();});
  const identity=$('.identity strong');if(identity)identity.textContent='PocketGuide 2.3';document.title='PocketGuide V2.3 · Compagnon vivant';
  globalThis.__POCKETGUIDE_V23__={version:'2.3.0-rc1',avatar:livingAvatarRuntime,lab,scenes:livingSceneEngine,scroll:scrollDirector,spec:'G121-G150'};eventBus.emit('pg23.runtime.ready',{version:'2.3.0-rc1'});return globalThis.__POCKETGUIDE_V23__;
}

import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {actionRegistry} from '../../pg16/core/action-registry.js';
import {proposalManager} from '../../pg16/core/proposal-manager.js';
import {TOOLS} from '../../pg2/companion/realtime-companion.js';
import {companionOrchestrator21} from '../../pg21/companion/companion-orchestrator.js';
import {humanRealtimeCompanion} from '../../pg21/companion/human-realtime-companion.js';
import {unifiedVoiceService} from '../../pg22/audio/unified-audio-pack.js';
import {livingAvatarRuntime,LipSyncLabRuntime} from '../avatar/living-avatar-runtime.js';
import {avatarEngineController} from '../avatar/avatar-engine-controller.js';
import {livingPresenceMachine} from '../core/living-presence-machine.js';
import {livingPerformanceMonitor} from '../performance/living-performance-monitor.js?v=2.3.2.1';
import {livingSceneEngine} from '../scenes/living-scene-engine.js';
import {RoutePresentationDirector,attributionForPlace} from '../scenes/route-presentation-director.js';
import {scrollDirector} from '../scenes/scroll-director.js';

const VERSION='2.3.2';
const $=selector=>document.querySelector(selector);
const PRESENT_ROUTE=/\b(?:montre(?:-moi)?|pr[ée]sente(?:-moi)?|affiche|voir|simule)\b[\s\S]{0,48}\b(?:itin[ée]raire|parcours|voyage|[ée]tapes?)\b|\b(?:itin[ée]raire|parcours)\b[\s\S]{0,36}\b(?:photos?|images?|visuel)/i;
let hooksInstalled=false,previewHooked=false,semanticInstalled=false,realtimeToolInstalled=false,sceneBridgesInstalled=false,activated=false;

function allEvents(pack){return(pack?.days||[]).flatMap(day=>day.events||[]);}
function routePack(){return pocketGuideState.select('route.pack')||null;}
function currentRouteId(){return pocketGuideState.select('route.activeId')||routePack()?.id||'default';}
function currentPlace(){const route=pocketGuideState.select('route')||{},pack=route.pack||{},event=allEvents(pack).find(item=>item.id===route.currentEventId);return(pack.places||[]).find(place=>place.id===event?.placeId)||(pack.places||[])[0]||null;}
function sceneId(prefix,value=''){return`${prefix}-${String(value||Date.now()).replace(/[^a-zA-Z0-9._:-]/g,'-')}`.slice(0,120);}
function setText(selector,value){const node=$(selector);if(node)node.textContent=String(value??'');}

function createRouteScene(pack=routePack(),source='route'){
  if(!pack?.id)return null;const places=pack.places||[],placeWithImage=places.find(place=>place.heroImage||place.media?.[0]?.url),credit=attributionForPlace(placeWithImage);return livingSceneEngine.create({id:sceneId('route',pack.id),type:'route',title:pack.title||'Votre parcours',text:pack.subtitle||`${places.length} étapes préparées pour vous.`,image:placeWithImage?.heroImage||placeWithImage?.media?.[0]?.url||'',attribution:credit,places:places.map(place=>place.name),persist:true,source,meta:{routeId:pack.id,events:allEvents(pack).length,mediaStatus:placeWithImage?'verified':'unavailable'}});
}

function installConversationHook(){
  if(hooksInstalled)return true;const original=companionOrchestrator21.onTurn;if(typeof original!=='function')return false;hooksInstalled=true;companionOrchestrator21.onTurn=(role,text,meta={})=>{original(role,text,meta);if(role!=='user')livingSceneEngine.create({id:sceneId('speech',`${Date.now()}-${livingSceneEngine.items.length}`),type:meta.source?.includes('error')?'error':'speech',title:meta.source==='guidance'?'Une indication pour vous':'Je vous réponds',text,persist:false,source:meta.source||'conversation'});};return true;
}

function installPreviewHook(){
  const preview=globalThis.__POCKETGUIDE_V21__?.preview;if(!preview||previewHooked)return false;previewHooked=true;const originalScene=preview.onScene,originalStatus=preview.onStatus;
  preview.onScene=(scene,...args)=>{originalScene?.(scene,...args);if(!scene)return;livingPresenceMachine.transition('presenting',{source:'preview',reason:'scene-presented',label:'Je vous montre le parcours',portrait:'compact'});livingSceneEngine.create({id:sceneId('preview',scene.id||scene.eventId||scene.sceneIndex),type:'preview',title:scene.title||scene.placeName||'Votre parcours avant le départ',text:scene.story||scene.narration||'',image:scene.imageUrl||scene.image||'',attribution:scene.attribution?{label:[scene.attribution.author,scene.attribution.license,scene.attribution.source].filter(Boolean).join(' · '),url:scene.attribution.sourceUrl||scene.attribution.descriptionUrl||''}:null,persist:false,source:'preview',meta:{index:scene.sceneIndex,total:scene.totalScenes,mediaStatus:scene.imageUrl?'verified':'unavailable'}});};
  preview.onStatus=status=>{originalStatus?.(status);if(['completed','paused','idle'].includes(status?.status))livingPresenceMachine.transition('ready',{source:'preview',reason:status.status,label:'Je suis avec vous',portrait:'guide'});};return true;
}

const presentationDirector=new RoutePresentationDirector({sceneEngine:livingSceneEngine,voiceService:unifiedVoiceService});

function installActions(){
  if(!actionRegistry.has('pg23.present_route'))actionRegistry.register('pg23.present_route',{description:'Présenter audiovisuellement chaque étape du RoutePack réel.',riskLevel:'safe',confirmation:'none',handler:(args={},context={})=>{const pack=routePack();if(!pack?.id)throw new Error('Aucun itinéraire actif à présenter.');void presentationDirector.present(pack,{source:context.source||'action',speak:Boolean(args.speak)});return{started:true,routeId:pack.id,places:pack.places?.length||0};}});
}

function installSemanticOrchestrator(){
  if(semanticInstalled)return;semanticInstalled=true;const original=companionOrchestrator21.ask.bind(companionOrchestrator21);
  companionOrchestrator21.ask=async function(text,options={}){const value=String(text||'').trim();if(!PRESENT_ROUTE.test(value))return original(value,options);this.turn('user',value,{source:options.source||'text'});const reply='Bien sûr. Je reste avec vous pendant que les étapes et leurs photographies apparaissent dans l’ordre du parcours.';this.turn('companion',reply,{source:'pg23-presentation'});livingPresenceMachine.transition('presenting',{source:'companion',reason:'explicit-route-request',label:'Je vous montre le parcours',portrait:'guide'});void unifiedVoiceService.speak(reply,{routeId:currentRouteId(),key:'presentation-intro'});const result=await actionRegistry.execute('pg23.present_route',{speak:false},{source:'companion-intent'});return{type:'PRESENTATION',text:reply,execution:result};};
}

function installRealtimeTool(){
  if(realtimeToolInstalled)return;realtimeToolInstalled=true;if(!TOOLS.some(tool=>tool.name==='present_journey'))TOOLS.push({type:'function',name:'present_journey',description:'Présenter maintenant chaque étape du voyage actif avec sa photographie vérifiée, son attribution ou une absence de média clairement indiquée.',parameters:{type:'object',properties:{},additionalProperties:false}});
  const original=humanRealtimeCompanion.executeTool.bind(humanRealtimeCompanion);humanRealtimeCompanion.executeTool=function(name,args={}){if(name==='present_journey')return actionRegistry.execute('pg23.present_route',{speak:false},{source:'realtime-tool'});return original(name,args);};
}

function installSceneBridges(){
  if(sceneBridgesInstalled)return;sceneBridgesInstalled=true;
  eventBus.on('app.ready',()=>queueMicrotask(()=>{installConversationHook();setTimeout(installPreviewHook,0);livingSceneEngine.setScope(currentRouteId());createRouteScene(routePack(),'app-ready');}));
  eventBus.on('companion.status',payload=>{const value=payload?.value==='connecting'?'thinking':payload?.value;if(value==='thinking')livingSceneEngine.create({id:'live-thinking',type:'thinking',title:payload.label||'Je réfléchis',text:'Je rassemble le contexte utile avant de vous répondre.',source:'realtime'});livingPresenceMachine.transition(value||'ready',{source:'companion',reason:'status',label:payload?.label||''});});
  eventBus.on('pg22.planning.stage',payload=>{const stage=payload?.stage;if(!stage)return;if(payload.running){void actionRegistry.execute('ui.open_companion',{}, {source:'pg23-planner'});livingPresenceMachine.transition('thinking',{source:'planner',reason:stage.id,label:stage.label||'Je prépare votre excursion',portrait:'hero'});}else livingPresenceMachine.transition('presenting',{source:'planner',reason:'proposal-ready',label:'Votre proposition est prête',portrait:'guide'});livingSceneEngine.create({id:'planning-stage',type:payload.running?'thinking':'route',title:stage.label||'Je prépare votre excursion',text:payload.running?`Préparation ${Math.round(stage.progress||0)} %`:'Votre proposition est prête.',persist:false,source:'planner',meta:{stage:stage.id,progress:stage.progress}});});
  eventBus.on('pg22.media.progress',payload=>{const item=payload?.media||(payload?.items||[]).find(value=>value.placeId===payload?.place?.id),available=Boolean(item?.url||item?.thumbnailUrl);livingSceneEngine.create({id:sceneId(available?'media':'poi',payload?.place?.id||Date.now()),type:available?'media':'poi',title:payload?.place?.name||'Une étape du parcours',text:available?(item.alt||'Cette photographie vérifiée accompagne la préparation.'):'La recherche est terminée sans photographie touristique vérifiée. Cette étape reste disponible en texte et sur la carte.',image:item?.thumbnailUrl||item?.url||'',attribution:available?{label:item.attribution||[item.author,item.license,item.source].filter(Boolean).join(' · '),url:item.sourceUrl||item.descriptionUrl||''}:null,persist:true,source:'media-pack',meta:{placeId:payload?.place?.id,status:payload?.status||'unavailable',mediaStatus:available?'verified':'unavailable'}});});
  eventBus.on('proposal.created',()=>{const pack=proposalManager.pending()?.args?.pack;if(pack)createRouteScene(pack,'proposal');});
  for(const type of ['route.loaded','route.replaced'])eventBus.on(type,()=>{presentationDirector.cancel(type);livingSceneEngine.setScope(currentRouteId());createRouteScene(routePack(),type);});
  eventBus.on('guidance.snapshot',snapshot=>{if(!snapshot)return;const arrived=snapshot.phase==='arrived',completed=snapshot.phase==='completed',walking=['en_route','preview','approaching'].includes(snapshot.phase),place=snapshot.place||currentPlace(),type=arrived||completed?'arrival':'direction';if(arrived||completed)livingPresenceMachine.transition('arrived',{source:'deterministic-gps',reason:snapshot.phase,label:completed?'Parcours terminé':'Nous y sommes',portrait:'compact'});else if(walking)livingPresenceMachine.transition('walking',{source:'deterministic-gps',reason:snapshot.phase,label:'Je marche avec vous',portrait:'compact'});livingSceneEngine.create({id:sceneId(type,snapshot.eventId||'current'),type,title:completed?'Parcours terminé':arrived?`Vous êtes arrivé à ${place?.name||'cette étape'}`:`Vers ${place?.name||'la prochaine étape'}`,text:snapshot.instruction||'',image:arrived?snapshot.media?.heroImage||place?.heroImage||'':'',attribution:arrived?attributionForPlace(place):null,persist:arrived||completed,source:'deterministic-gps',meta:{phase:snapshot.phase,distanceMeters:snapshot.distanceMeters,accuracy:snapshot.accuracy}});});
  eventBus.on('media.personal.saved',payload=>livingSceneEngine.create({id:sceneId('memory',payload.mediaId),type:'memory',title:'Votre souvenir est enregistré',text:'Cette photo et sa position mesurée restent uniquement sur ce téléphone.',persist:true,source:'local-media',meta:{itineraryId:payload.itineraryId,eventId:payload.eventId}}));
  eventBus.on('ui.panel.changed',payload=>{const panel=payload?.after?.ui?.panel||pocketGuideState.select('ui.panel');if(panel!=='companion')livingPresenceMachine.transition(livingPresenceMachine.state,{source:'interface',reason:`open-${panel}`,label:$('#guideStateLabel')?.textContent||'',portrait:'compact'});});
  eventBus.on('ar.opened',()=>livingPresenceMachine.transition('presenting',{source:'ar',reason:'camera-open',label:'Je regarde avec vous',portrait:'compact'}));eventBus.on('ar.closed',()=>livingPresenceMachine.transition('ready',{source:'ar',reason:'camera-closed',label:'Je suis avec vous',portrait:'guide'}));
  eventBus.on('pg22.audio.started',()=>livingPresenceMachine.transition('speaking',{source:'tts',reason:'audio-started',label:'Je vous parle',portrait:livingPresenceMachine.current().mode}));eventBus.on('pg22.audio.interrupted',()=>{livingPresenceMachine.interrupt('user');setTimeout(()=>livingPresenceMachine.transition('ready',{source:'user',reason:'interruption-complete',label:'Je vous écoute',portrait:'guide'}),120);});
  eventBus.on('pg23.lipsync.frame',frame=>{if(frame?.source==='lab')return;if(Number.isFinite(frame?.firstMovementMs))livingPerformanceMonitor.noteLipLatency(frame.firstMovementMs);updateDiagnostic();});
  eventBus.on('pg23.presentation.started',()=>{livingPresenceMachine.transition('presenting',{source:'presentation',reason:'started',label:'Je vous montre le parcours',portrait:'guide'});setTimeout(()=>$('#livingFlow')?.scrollIntoView?.({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}),80);});
  eventBus.on('pg23.presentation.completed',payload=>{livingPresenceMachine.transition('ready',{source:'presentation',reason:'completed',label:'Je suis avec vous',portrait:'guide'});livingSceneEngine.create({id:sceneId('speech',`presentation-${Date.now()}`),type:'speech',title:'Le parcours est devant vous',text:payload.text,persist:false,source:'presentation'});});
  eventBus.on('network.offline',()=>livingSceneEngine.create({id:'offline-continuity',type:'continuity',title:'Je poursuis avec votre voyage',text:'Le laboratoire du visage, le parcours et vos souvenirs locaux restent disponibles hors ligne.',source:'network'}));
  eventBus.on('companion.realtime.error',payload=>livingSceneEngine.create({id:sceneId('error',Date.now()),type:'error',title:'La conversation en direct est momentanément indisponible',text:payload?.message||'Le parcours et les fonctions locales restent disponibles.',source:'realtime'}));
}

function updateDiagnostic(){
  const diag=livingAvatarRuntime.diagnostic(),presence=livingPresenceMachine.diagnostic(),voice=unifiedVoiceService.playbackSnapshot(),performance=livingPerformanceMonitor.snapshot();setText('#labVersion',VERSION);setText('#labState',presence.state);setText('#labMode',presence.mode);setText('#labSource',diag.source||presence.source);setText('#labAudio',voice.playing?`Lecture ${voice.currentTime.toFixed(1)} s`:voice.hasSource?'Prête':'Au repos');setText('#labLatency',Number.isFinite(diag.firstMovementMs)?`${Math.round(diag.firstMovementMs)} ms`:'Non mesurée');setText('#labFcp',Number.isFinite(performance.firstContentfulPaintMs)?`${performance.firstContentfulPaintMs} ms`:Number.isFinite(performance.firstRenderMs)?`${performance.firstRenderMs} ms`:'Non mesuré');setText('#labTouch',Number.isFinite(performance.lastTouchMs)?`${performance.lastTouchMs} ms`:'Non mesuré');setText('#labFps',Number.isFinite(performance.sampledFps)?`${performance.sampledFps} i/s`:'Échantillonnage…');setText('#labMemory',Number.isFinite(performance.heapBytes)?`${Math.round(performance.heapBytes/1048576)} Mo`:'Selon navigateur');setText('#labBattery',performance.battery?`${performance.battery.level} %${performance.battery.charging?' · charge':''}`:'Selon navigateur');setText('#labVideo',String(performance.activeVideoDecoders));return{version:VERSION,presence,avatar:diag,voice,performance};
}

function installLab(){
  const dialog=$('#lipSyncLabDialog'),lab=new LipSyncLabRuntime({voiceService:unifiedVoiceService});lab.install({root:$('#labAvatar'),portrait:$('#labAvatarPortrait'),mouth:$('#labAvatarMouth'),readout:{verdict:$('#labVerdict'),viseme:$('#labViseme'),changes:$('#labChanges'),visibility:$('#labVisibility'),status:$('#labStatus'),version:$('#labVersion'),state:$('#labState'),mode:$('#labMode'),source:$('#labSource'),audio:$('#labAudio'),latency:$('#labLatency')}});
  $('#openLipSyncLab')?.addEventListener('click',()=>{dialog?.showModal?.();requestAnimationFrame(()=>{lab.fit();updateDiagnostic();});});$('#closeLipSyncLab')?.addEventListener('click',()=>dialog?.close?.());$('#testSilentLips')?.addEventListener('click',()=>void lab.runSilent());$('#testFrenchLips')?.addEventListener('click',()=>void lab.runFrench());$('#testMarinLips')?.addEventListener('click',()=>{unifiedVoiceService.unlock();void lab.runMarin();});return lab;
}

function installVisibilityBudget(){
  if(typeof IntersectionObserver==='function'){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{entry.target.dataset.offscreen=String(!entry.isIntersecting);}),{rootMargin:'120px'});observer.observe($('#humanGuide'));eventBus.on('pg23.scene.presented',payload=>payload?.node&&observer.observe(payload.node));}
  document.addEventListener('visibilitychange',()=>{$('#humanGuide').dataset.offscreen=String(document.hidden);});
}

async function activateVoice(){
  unifiedVoiceService.unlock();activated=true;livingPresenceMachine.transition('listening',{source:'user',reason:'primary-action',label:'Je vous écoute',portrait:'hero'});const active=await companionOrchestrator21.toggleListening();if(!active&&!humanRealtimeCompanion.connected){const greeting='Bonjour. Je suis avec vous. Dites-moi simplement ce que vous souhaitez vivre aujourd’hui.';void unifiedVoiceService.speak(greeting,{routeId:currentRouteId(),key:'welcome'});}return active;
}

function installPrimaryExperience(){
  const welcome=$('#welcomeDialog');if(welcome?.open)welcome.close();const app=$('#companionApp');app.dataset.view='companion';app.dataset.portrait='hero';app.dataset.presence='ready';$('[data-view-panel="companion"]')?.removeAttribute('hidden');for(const panel of document.querySelectorAll('[data-view-panel]:not([data-view-panel="companion"])'))panel.hidden=true;
  const applyWelcome=()=>{if(!['welcome','ready'].includes(app.dataset.moment))return;setText('#momentEyebrow','Votre accompagnatrice audiovisuelle');setText('#momentTitle','Bonjour. Je suis avec vous.');setText('#momentMessage','Parlez-moi naturellement. Je ferai apparaître les images, la carte et les étapes pendant que je vous accompagne.');setText('#momentPrimary',activated?'Me parler':'Parler à ma guide');setText('#momentSecondary','Montre-moi l’itinéraire');};applyWelcome();eventBus.on('pg21.moment.changed',()=>queueMicrotask(applyWelcome));
  $('#momentPrimary')?.addEventListener('click',event=>{if(!['welcome','ready'].includes(app.dataset.moment))return;event.preventDefault();event.stopImmediatePropagation();void activateVoice();},{capture:true});$('#momentSecondary')?.addEventListener('click',event=>{if(!['welcome','ready'].includes(app.dataset.moment))return;event.preventDefault();event.stopImmediatePropagation();void companionOrchestrator21.ask('Montre-moi l’itinéraire préparé avec les photos de chaque étape.',{source:'primary-action',speak:true});},{capture:true});
}

export function installLivingCompanion(){
  const app=$('#companionApp');pocketGuideState.patch({version:VERSION,ui:{panel:'companion'}},{source:'pg23-bootstrap',event:'pg23.version.ready'});livingPresenceMachine.install({app,avatar:$('#humanGuide'),label:$('#guideStateLabel')});livingAvatarRuntime.install({root:$('#humanGuide'),portrait:$('#avatarPortrait'),mouth:$('#avatarMouth')});livingSceneEngine.install({host:$('#sceneStream'),countHost:$('#sceneCount'),scopeId:currentRouteId()});scrollDirector.install({flow:$('#livingFlow'),resumeButton:$('#resumeScenes'),app});livingPerformanceMonitor.install({root:app});eventBus.on('pg23.scene.presented',payload=>scrollDirector.present(payload?.node));installActions();installConversationHook();installSemanticOrchestrator();installRealtimeTool();installSceneBridges();installPreviewHook();installPrimaryExperience();installVisibilityBudget();const lab=installLab();createRouteScene(routePack(),'pg23-ready');
  void avatarEngineController.install({root:$('#humanGuide'),portrait:$('#avatarPortrait'),host:$('#avatar3dHost'),audioBus:unifiedVoiceService.bus,status:$('#avatarModeStatus'),retry:$('#retryClaire')});
  const identity=$('.identity strong');if(identity)identity.textContent='PocketGuide 2.3.2';document.title='PocketGuide V2.3.2 · Claire 3D locale';
  const diagnostic=()=>({...updateDiagnostic(),avatarEngine:avatarEngineController.diagnostic()});globalThis.__POCKETGUIDE_V23__={version:VERSION,avatar:livingAvatarRuntime,avatarEngine:avatarEngineController,presence:livingPresenceMachine,lab,scenes:livingSceneEngine,scroll:scrollDirector,presentation:presentationDirector,performance:livingPerformanceMonitor,diagnostic,spec:'G121-G150'};eventBus.emit('pg23.runtime.ready',{version:VERSION});return globalThis.__POCKETGUIDE_V23__;
}

import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {companionOrchestrator21} from '../../pg21/companion/companion-orchestrator.js';
import {liveAvatarRealtimeController,liveAvatarRealtimeRequested} from '../../pg23/avatar/liveavatar-realtime-controller.js';
import {guideCommandRouter} from '../core/guide-command-router.js';
import {reportClientDiagnostic} from '../core/client-diagnostics.js';

const VERSION='2.3.3';
const $=selector=>document.querySelector(selector);
let installed=false;

function setText(selector,value){const node=$(selector);if(node)node.textContent=String(value??'');}
function safeMediaUrl(value=''){const url=String(value||'').trim();return /^(https:\/\/|\.\/|assets\/)/.test(url)?url:'';}
function resetRouteContent(total=0){const section=$('#journeyRouteContent'),host=$('#journeyRouteCards');if(!section||!host)return;host.replaceChildren();section.hidden=false;setText('#journeyRouteContentCount',total?`0 / ${total} étapes`:'Préparation…');}
function appendRouteContentScene(scene,total=0){
  if(!['media','poi'].includes(scene?.type))return false;const section=$('#journeyRouteContent'),host=$('#journeyRouteCards'),sceneId=String(scene.id||'');if(!section||!host||[...host.children].some(node=>node.dataset.routeScene===sceneId))return false;
  const article=document.createElement('article');article.className=`journey-route-card${scene.image?'':' journey-route-card--text'}`;article.dataset.routeScene=String(scene.id||'');const image=safeMediaUrl(scene.image);if(image){const img=document.createElement('img');img.src=image;img.alt=`Photographie de ${scene.title||'cette étape'}`;img.loading='lazy';article.append(img);}const copy=document.createElement('div');copy.className='journey-route-card__copy';const title=document.createElement('h4'),text=document.createElement('p');title.textContent=scene.title||'Étape du parcours';text.textContent=scene.text||'Cette étape reste disponible sur la carte.';copy.append(title,text);const credit=scene.attribution;if(credit?.label&&/^https:\/\//.test(String(credit.url||''))){const link=document.createElement('a');link.href=credit.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=credit.label;copy.append(link);}article.append(copy);host.append(article);section.hidden=false;setText('#journeyRouteContentCount',`${host.children.length}${total?` / ${total}`:''} fiche${host.children.length>1?'s':''}`);return true;
}
function installRouteContentBridge(){
  eventBus.on('pg23.presentation.started',payload=>{if(payload?.source==='pg233-route-content')resetRouteContent(Math.max(0,Number(payload.count||0)-2));});
  eventBus.on('pg23.presentation.frame',payload=>{if(payload?.source==='pg233-route-content')appendRouteContentScene(payload.scene,Math.max(0,Number(payload.total||0)-2));});
  eventBus.on('pg23.presentation.completed',payload=>{if(payload?.source!=='pg233-route-content')return;const section=$('#journeyRouteContent'),count=$('#journeyRouteCards')?.children.length||0;setText('#journeyRouteContentCount',`${count} fiche${count>1?'s':''} prête${count>1?'s':''}`);setTimeout(()=>section?.scrollIntoView?.({behavior:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',block:'start'}),80);});
  eventBus.on('pg23.presentation.failed',payload=>{if(payload?.source==='pg233-route-content'){setText('#journeyRouteContentCount','Présentation interrompue');setText('#guideActionStatus','La carte reste disponible, mais les fiches n’ont pas toutes pu être affichées.');}});
}
function updateIdentity(){
  const app=$('#companionApp');if(app)app.dataset.pgVersion=VERSION;
  const identity=$('.identity strong');if(identity)identity.textContent=`PocketGuide ${VERSION}`;
  const apple=document.querySelector('meta[name="apple-mobile-web-app-title"]');if(apple)apple.content=`PocketGuide ${VERSION}`;
  const description=document.querySelector('meta[name="description"]');if(description)description.content='PocketGuide 2.3.3 — la guide LiveAvatar crée et modifie les itinéraires, guide par GPS, présente les lieux et gère les voyages sauvegardés.';
  document.title='PocketGuide V2.3.3 · Guide LiveAvatar';
  pocketGuideState.patch({version:VERSION},{source:'pg233-bootstrap',event:'pg233.version.ready'});
}

function installCapabilityPanel(){
  if($('#guideCapabilities'))return $('#guideCapabilities');
  const panel=document.createElement('section');panel.id='guideCapabilities';panel.className='guide-capabilities';panel.setAttribute('aria-labelledby','guideCapabilitiesTitle');
  panel.innerHTML=`<header><div><span class="overline">Priorités 2.3.3</span><h2 id="guideCapabilitiesTitle">Ce que votre guide sait accomplir</h2></div><span class="guide-capabilities__ready">Opérationnelle</span></header><div class="guide-capabilities__grid"><button type="button" data-pg233-command="Je veux modifier mon itinéraire"><span aria-hidden="true">⌁</span><strong>Créer / modifier</strong><small>L’itinéraire</small></button><button type="button" data-pg233-command="Guide-moi par GPS étape par étape"><span aria-hidden="true">⌖</span><strong>Guider par GPS</strong><small>Étape par étape</small></button><button type="button" data-pg233-command="Montre-moi la carte, les photos et les fiches du parcours"><span aria-hidden="true">◫</span><strong>Carte et fiches</strong><small>Photos et lieux</small></button><button type="button" data-pg233-command="Ouvre mes voyages sauvegardés"><span aria-hidden="true">♡</span><strong>Mes voyages</strong><small>Sauvegardés</small></button></div><p id="guideActionStatus" class="guide-capabilities__status" aria-live="polite">Parlez naturellement ou choisissez une action.</p>`;
  const flow=$('#livingFlow'),companion=$('[data-view-panel="companion"]');if(flow)flow.before(panel);else companion?.append(panel);
  panel.addEventListener('click',event=>{const button=event.target.closest('[data-pg233-command]');if(!button)return;void companionOrchestrator21.ask(button.dataset.pg233Command,{source:'pg233-quick-action'});});
  return panel;
}

function showPlanner(mode='edit'){
  const dialog=$('#plannerDialog'),prompt=$('#plannerPrompt');if(!dialog)return false;
  dialog.dataset.plannerMode=mode;
  setText('#plannerStatus',mode==='edit'?'Décrivez précisément ce qu’il faut ajouter, retirer, déplacer ou changer.':'Décrivez la destination, la durée, le rythme et vos envies.');
  if(prompt&&!prompt.value)prompt.placeholder=mode==='edit'?'Ex. Ajoute Rena Bianca après la tour et retire la pause café.':'Ex. Crée une promenade de deux heures à Bonifacio avec histoire et panoramas.';
  if(!dialog.open){dialog.classList.add('living-surface');if(typeof dialog.show==='function')dialog.show();else dialog.setAttribute('open','');}
  setTimeout(()=>prompt?.focus(),80);return true;
}

async function narrate(result,{source='pg233-command'}={}){
  const speech=String(result?.speech||'').trim();if(!speech)return false;
  if(liveAvatarRealtimeRequested()){
    const sent=await liveAvatarRealtimeController.narrate(speech,{intent:result.intent,source});if(sent)return true;
  }
  companionOrchestrator21.turn('companion',speech,{source:`${source}-local`});return false;
}

function installCommandBridge(){
  liveAvatarRealtimeController.onCommand=(text,meta)=>guideCommandRouter.handle(text,meta);
  const inheritedAsk=companionOrchestrator21.ask.bind(companionOrchestrator21);
  companionOrchestrator21.ask=async function(text,options={}){
    const value=String(text||'').trim();if(!value)return null;const routed=guideCommandRouter.handle(value,{source:options.source||'text'});
    if(!routed.handled)return inheritedAsk(value,options);
    this.turn('user',value,{source:options.source||'text'});liveAvatarRealtimeController.cancelResponse('pg233-text-command');const result=await routed.completion;await narrate(result,{source:options.source||'text'});return{type:'PG233_COMMAND',intent:routed.intent,result};
  };
}

function installStatusBridge(){
  eventBus.on('pg233.command.started',payload=>{setText('#guideActionStatus','Je m’en occupe…');const app=$('#companionApp');if(app)app.dataset.guideAction='running';eventBus.emit('companion.status',{value:'thinking',label:'J’agis dans PocketGuide',commandId:payload.id});});
  eventBus.on('pg233.command.completed',payload=>{setText('#guideActionStatus',payload.result?.speech||'Action terminée.');const app=$('#companionApp');if(app)app.dataset.guideAction='ready';void reportClientDiagnostic('command.completed',{status:'ok',intent:payload.intent});});
  eventBus.on('pg233.command.failed',payload=>{setText('#guideActionStatus',payload.result?.speech||'Cette action est momentanément indisponible.');const app=$('#companionApp');if(app)app.dataset.guideAction='error';void reportClientDiagnostic('command.failed',{status:'error',intent:payload.intent,code:'command-failed'});});
  eventBus.on('pg233.planner.requested',payload=>showPlanner(payload?.mode||'edit'));
  eventBus.on('pg233.planning.started',()=>{setText('#guideActionStatus','Je vérifie les lieux et je prépare une proposition…');});
  eventBus.on('proposal.created',()=>{setText('#guideActionStatus','Une proposition est prête. Votre confirmation reste indispensable.');});
  eventBus.on('guidance.snapshot',snapshot=>{if(snapshot?.instruction)setText('#guideActionStatus',snapshot.instruction);});
  for(const event of ['gps.denied','gps.error','gps.unavailable'])eventBus.on(event,()=>void reportClientDiagnostic(event,{status:'error',code:event}));
  eventBus.on('pg23.presentation.failed',()=>void reportClientDiagnostic('presentation.failed',{status:'error',code:'presentation-failed'}));
}

export function installPocketGuide233(){
  if(installed)return globalThis.__POCKETGUIDE_V233__;installed=true;updateIdentity();installCapabilityPanel();installCommandBridge();installStatusBridge();installRouteContentBridge();
  setText('#momentEyebrow','Votre guide opérationnelle');setText('#momentMessage','Demandez-moi de créer ou modifier l’itinéraire, de vous guider par GPS, d’afficher les lieux ou de reprendre un voyage sauvegardé.');
  const runtime={version:VERSION,commands:guideCommandRouter,avatar:liveAvatarRealtimeController,showPlanner,narrate,capabilities:Object.freeze(['itinerary','gps-guidance','route-content','saved-journeys'])};globalThis.__POCKETGUIDE_V233__=runtime;eventBus.emit('pg233.runtime.ready',{version:VERSION,capabilities:runtime.capabilities});void reportClientDiagnostic('runtime.ready',{status:'ready'});return runtime;
}

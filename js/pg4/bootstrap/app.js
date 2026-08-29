import {v4EventBus} from '../core/event-bus.js';
import {StateStore,initialV4State} from '../core/state-store.js';
import {AuditLog} from '../core/audit-log.js';
import {EvidenceBus} from '../core/evidence-bus.js';
import {PolicyGuard} from '../core/policy-guard.js';
import {CapabilityRegistry} from '../core/capability-registry.js';
import {IntentRouter} from '../orchestrator/intent-router.js';
import {registerV4Capabilities} from '../orchestrator/register-capabilities.js';
import {V4Orchestrator} from '../orchestrator/v4-orchestrator.js';
import {PlannerAdapter,mapModel} from '../adapters/planner-adapter.js';
import {OfflineAdapter} from '../adapters/offline-adapter.js';
import {AvatarAudioAdapter} from '../adapters/avatar-audio-adapter.js?v=4.0.0-preview.6';
import {RouteStateAdapter} from '../adapters/route-state-adapter.js';
import {TerrainAdapter} from '../adapters/terrain-adapter.js';
import {ProactiveGuideAdapter} from '../adapters/proactive-guide-adapter.js';
import {PlannerVoiceAdapter} from '../adapters/planner-voice-adapter.js';
import {DiagnosticAdapter} from '../adapters/diagnostic-adapter.js';
import {OrientationLayoutAdapter} from '../adapters/orientation-layout-adapter.js';
import {loadPocketGuideRoute} from '../../route-runtime.js';
import {parityReport} from '../v152-parity.js';
import {SceneDirector} from '../scenes/scene-director.js';

const $=selector=>document.querySelector(selector);
const mockRequested=new URLSearchParams(location.search).get('pg4mock')==='1';
const nativeFetch=globalThis.fetch.bind(globalThis);

async function previewFetch(input,options={}){
  const url=typeof input==='string'?input:input.url;
  if(mockRequested&&/\/api\/plan$/.test(url)){
    const pack=await nativeFetch('./data/routepacks/santa-teresa-v4-preview.json',{cache:'no-store'}).then(response=>response.json());
    return new Response(JSON.stringify({pack,status:'completed',model:'deterministic-preview'}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return nativeFetch(input,options);
}

const state=new StateStore(initialV4State,v4EventBus);
const auditLog=new AuditLog();
const evidenceBus=new EvidenceBus({bus:v4EventBus,auditLog});
const policyGuard=new PolicyGuard();
const registry=new CapabilityRegistry({policyGuard,evidenceBus,bus:v4EventBus});
const planner=new PlannerAdapter({fetchImpl:previewFetch});
const offline=new OfflineAdapter();
const router=new IntentRouter();
const avatar=new AvatarAudioAdapter({bus:v4EventBus,fetchImpl:nativeFetch,documentImpl:document});
const routeState=new RouteStateAdapter({state,storage:localStorage,bus:v4EventBus});
const proactive=new ProactiveGuideAdapter({state,bus:v4EventBus,storage:localStorage});
const terrain=new TerrainAdapter({state,bus:v4EventBus,navigatorImpl:navigator,windowImpl:window,documentImpl:document,companion:avatar,onPosition:position=>proactive.check(position)});
const layout=new OrientationLayoutAdapter({windowImpl:window,documentImpl:document,state,bus:v4EventBus});
const diagnostic=new DiagnosticAdapter({windowImpl:window,navigatorImpl:navigator,terrain,layout,companion:avatar,offline});
const plannerVoice=new PlannerVoiceAdapter({windowImpl:window,navigatorImpl:navigator,fetchImpl:nativeFetch,companion:avatar});
const scenes=new SceneDirector({bus:v4EventBus,state,documentImpl:document}).install();
registerV4Capabilities({registry,state,planner,offline,routeState,terrain,diagnostic});
const orchestrator=new V4Orchestrator({router,registry,state,bus:v4EventBus,avatar});

avatar.install({
  root:$('#avatarStage'),portrait:$('#avatarPortrait'),host:$('#avatar3dHost'),status:$('#avatarModeStatus'),retry:$('#retryAvatar'),
  onCommand:(text,meta)=>orchestrator.route(text,{source:meta?.source||'liveavatar-voice'}),
  onStatus:payload=>state.patch({presence:payload.value},{source:'avatar'}),
  onTurn:(role,text,meta)=>v4EventBus.emit('pg4.conversation.turn',{role,text,meta})
});
terrain.install({stage:$('#geoArStage'),video:$('#geoArCamera'),labels:$('#geoArLabels'),compass:$('#geoArCompass'),manual:$('#geoArManual'),status:$('#terrainStatus'),gps:$('#gpsAction'),ar:$('#arAction')});
plannerVoice.install({field:$('#createPrompt'),button:$('#plannerVoiceAction'),status:$('#plannerVoiceStatus')});
layout.install($('#pg4App'));

function submit(text,source='touch'){return orchestrator.submit(text,{source});}
function invoke(capabilityId,input={},source='touch'){return orchestrator.invoke(capabilityId,input,source);}
function summaryFor(pack){const map=mapModel(pack);return{map,summary:{title:pack.title,durationMinutes:120,places:pack.places?.length||0,distanceKm:map.distanceKm,mediaReady:(pack.places||[]).filter(place=>place.heroImage).length,mediaMissing:(pack.places||[]).filter(place=>!place.heroImage).length}};}
function activateRoute(pack,{source='runtime',preserveView=true}={}){
  if(!pack)return null;const {map,summary}=summaryFor(pack);state.patch({activeRoute:pack},{source});routeState.setPack(pack);terrain.setPack(pack);proactive.setPack(pack);scenes.renderConfirmed({pack,map,summary},{preserveView});renderLibrary();return{pack,map,summary};
}
function renderLibrary(){
  const host=$('#routeLibraryList');if(!host)return;host.replaceChildren();const routes=offline.list();
  if(!routes.length){const empty=document.createElement('p');empty.className='route-foot';empty.textContent='Aucun parcours enregistré.';host.append(empty);return;}
  for(const route of routes){const row=document.createElement('article');row.className='library-route';const copy=document.createElement('span'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent=route.label||route.title;meta.textContent=`${route.places} lieux · ${new Date(route.updatedAt).toLocaleDateString('fr-FR')}`;copy.append(title,meta);const actions=document.createElement('span');actions.className='route-event-actions';const open=document.createElement('button'),remove=document.createElement('button');open.className=remove.className='tool-button';open.type=remove.type='button';open.dataset.action='open-saved-route';open.dataset.routeId=route.id;open.textContent='Ouvrir';remove.dataset.action='delete-saved-route';remove.dataset.routeId=route.id;remove.textContent='×';actions.append(open,remove);row.append(copy,actions);host.append(row);}
}
function downloadFile(download){const blob=new Blob([download.text],{type:download.mimeType}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=download.filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

$('#voiceAction').addEventListener('click',async()=>{
  if(['speaking','thinking'].includes(state.select('presence')))await avatar.interrupt();
  await avatar.startListening();
});
$('#suggestRoute').addEventListener('click',()=>void submit('Crée-moi une promenade de deux heures à Santa Teresa, avec carte, photos et texte.','touch'));
$('#createForm').addEventListener('submit',async event=>{event.preventDefault();if(plannerVoice.wanted)await plannerVoice.stop();void submit($('#createPrompt').value,'touch');});
$('#arAction').addEventListener('pointerdown',()=>{void terrain.requestOrientationFromGesture();},{capture:true,passive:true});
$('#pg4App').addEventListener('pointerdown',event=>{if(event.target.closest('[data-action="focus-place"]'))void terrain.requestOrientationFromGesture();},{capture:true,passive:true});
$('#gpsAction').addEventListener('click',()=>void invoke('terrain.startGPS'));
$('#arAction').addEventListener('click',()=>void invoke('terrain.openAR',{active:!terrain.ar}));
$('#resetSensorsAction').addEventListener('click',()=>void invoke('sensors.reset'));
$('#resetMediaAction').addEventListener('click',()=>void invoke('sensors.reset'));
$('#downloadOfflineAction').addEventListener('click',()=>void invoke('route.downloadOffline'));
$('#exportRouteAction').addEventListener('click',()=>void invoke('route.exportPack'));
$('#resetRouteAction').addEventListener('click',()=>void invoke('route.resetProgress'));
$('#proactiveToggle').addEventListener('click',()=>void invoke('guide.toggleProactive',{enabled:state.select('routeProgress.proactiveEnabled')===false}));
for(const button of document.querySelectorAll('[data-heading]'))button.addEventListener('click',()=>terrain.adjustHeading(Number(button.dataset.heading)));
$('#importRouteFile').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{await invoke('route.importPack',{pack:JSON.parse(await file.text())});}catch(error){$('#offlineStatus').textContent=`Import impossible : ${error.message||error}`;}finally{event.target.value='';}});

$('#diagnosticAction').addEventListener('click',()=>{diagnostic.render($('#diagnosticList'));$('#diagnosticDialog').showModal();});
$('#diagnosticPermissions').addEventListener('click',async()=>{const button=$('#diagnosticPermissions'),detail=$('#diagnosticDetail');button.disabled=true;detail.textContent='Test des autorisations en cours…';const checks=await diagnostic.testPermissions();diagnostic.render($('#diagnosticList'),checks);detail.textContent=`${checks.filter(item=>item.ok).length}/${checks.length} autorisations disponibles.`;button.disabled=false;});

$('#pg4App').addEventListener('click',event=>{
  const nav=event.target.closest('[data-nav]');if(nav){
    event.preventDefault();
    const view=nav.dataset.nav;
    if(['guide','map','route','create'].includes(view)&&state.select('view')!==view){
      state.patch({view},{source:'navigation-touch'});
      v4EventBus.emit('pg4.navigation.touch',{view});
    }
    return;
  }
  const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(action==='confirm-route')void submit('Je confirme ce parcours','touch');
  else if(action==='cancel'){avatar.interrupt();void submit('Arrête','touch');}
  else if(action==='reject-route'){state.patch({proposal:null,view:'guide',action:{id:'route.confirmProposal',status:'rejected'}},{source:'touch'});}
  else if(action==='retry'){const last=state.select('intent');if(last?.raw)void submit(last.raw,'retry');}
  else if(action==='go-to-place')void invoke('route.goTo',{placeId:event.target.closest('[data-place-id]').dataset.placeId});
  else if(action==='focus-place'){const placeId=event.target.closest('[data-place-id]').dataset.placeId;void invoke('terrain.focusPlace',{placeId}).then(()=>invoke('terrain.openAR',{active:true}));}
  else if(action==='open-saved-route')void invoke('route.openSaved',{id:event.target.closest('[data-route-id]').dataset.routeId});
  else if(action==='delete-saved-route'){offline.deleteSaved(event.target.closest('[data-route-id]').dataset.routeId);renderLibrary();}
});

v4EventBus.on('pg4.evidence',evidence=>{
  if(!['succeeded','degraded'].includes(evidence.status))return;const kind=evidence.data?.kind;
  if(kind==='route-confirmed'||kind==='route-loaded')activateRoute(evidence.data.pack,{source:`evidence:${kind}`,preserveView:kind==='route-loaded'});
  else if(kind==='route-export')downloadFile(evidence.data.download);
  else if(kind==='proactive-state'){const enabled=evidence.data.enabled;$('#proactiveToggle').setAttribute('aria-pressed',String(enabled));$('#proactiveStatus').textContent=enabled?'Alertes d’arrivée actives':'Alertes d’arrivée en pause';}
});

window.addEventListener('online',()=>state.patch({network:{online:true}},{source:'network'}));
window.addEventListener('offline',()=>state.patch({network:{online:false}},{source:'network'}));

const restored=offline.restore();
if(restored){const active=activateRoute(restored,{source:'offline-restore',preserveView:true});v4EventBus.emit('pg4.route.restored',active);}
else loadPocketGuideRoute({fetchImpl:previewFetch,locationLike:window.location,storage:sessionStorage}).then(runtime=>{const active=activateRoute(runtime.pack,{source:'v152-runtime',preserveView:true});v4EventBus.emit('pg4.route.loaded',active);}).catch(error=>v4EventBus.emit('pg4.route.load-failed',{error:error.message||String(error)}));
if(mockRequested){$('#screenStatus').textContent='SIMULATION';$('#avatarModeStatus').textContent='Simulation Planner · LiveAvatar optionnel';}

renderLibrary();
const parity=()=>parityReport({registry,terrain,layout,plannerVoice,diagnostic,proactive,offline,companion:avatar});
globalThis.__POCKETGUIDE_V4__={version:'4.0.0-preview.6',baseVersion:'1.5.2',state,bus:v4EventBus,auditLog,evidenceBus,registry,router,planner,plannerVoice,offline,routeState,terrain,layout,proactive,diagnostic,avatar,scenes,orchestrator,parity,mockRequested};
v4EventBus.emit('pg4.runtime.ready',{version:'4.0.0-preview.6',base:'PocketGuide 1.5.2',companionSdk:'0.2.0',parity:parity(),mockRequested});
window.addEventListener('beforeunload',()=>{void plannerVoice.stop();terrain.destroy();layout.destroy();},{once:true});

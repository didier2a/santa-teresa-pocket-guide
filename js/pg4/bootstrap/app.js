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
import {AvatarAudioAdapter} from '../adapters/avatar-audio-adapter.js?v=4.0.0-preview.3';
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
const scenes=new SceneDirector({bus:v4EventBus,state,documentImpl:document}).install();
registerV4Capabilities({registry,state,planner,offline});
const orchestrator=new V4Orchestrator({router,registry,state,bus:v4EventBus,avatar});

avatar.install({
  root:$('#avatarStage'),portrait:$('#avatarPortrait'),host:$('#avatar3dHost'),status:$('#avatarModeStatus'),retry:$('#retryAvatar'),
  onCommand:(text,meta)=>orchestrator.route(text,{source:meta?.source||'liveavatar-voice'}),
  onStatus:payload=>state.patch({presence:payload.value},{source:'avatar'}),
  onTurn:(role,text,meta)=>v4EventBus.emit('pg4.conversation.turn',{role,text,meta})
});

function submit(text,source='touch'){return orchestrator.submit(text,{source});}

$('#voiceAction').addEventListener('click',async()=>{
  if(['speaking','thinking'].includes(state.select('presence'))){avatar.interrupt();return;}
  await avatar.toggleListening();
});
$('#suggestRoute').addEventListener('click',()=>void submit('Crée-moi une promenade de deux heures à Santa Teresa, avec carte, photos et texte.','touch'));
$('#createForm').addEventListener('submit',event=>{event.preventDefault();void submit($('#createPrompt').value,'touch');});

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
});

window.addEventListener('online',()=>state.patch({network:{online:true}},{source:'network'}));
window.addEventListener('offline',()=>state.patch({network:{online:false}},{source:'network'}));

const restored=offline.restore();
if(restored){
  const map=mapModel(restored),summary={title:restored.title,durationMinutes:120,places:restored.places?.length||0,distanceKm:map.distanceKm,mediaReady:(restored.places||[]).filter(place=>place.heroImage).length,mediaMissing:(restored.places||[]).filter(place=>!place.heroImage).length};
  state.patch({activeRoute:restored},{source:'offline-restore'});scenes.renderStory(restored.places?.[0],{preserveView:true});
  v4EventBus.emit('pg4.route.restored',{pack:restored,map,summary});
}
if(mockRequested){$('#screenStatus').textContent='SIMULATION';$('#avatarModeStatus').textContent='Simulation Planner · LiveAvatar optionnel';}

globalThis.__POCKETGUIDE_V4__={version:'4.0.0-preview.3',state,bus:v4EventBus,auditLog,evidenceBus,registry,router,planner,offline,avatar,scenes,orchestrator,mockRequested};
v4EventBus.emit('pg4.runtime.ready',{version:'4.0.0-preview.3',base:'PocketGuide 1.5.2',mockRequested});

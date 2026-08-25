import {eventBus} from '../core/event-bus.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {humanContextEngine} from '../core/context-engine.js';
import {actionRegistry} from '../core/action-registry.js';
import {loadRouteIntoV16} from '../route/route-adapter-v15.js';
import {registerRouteActions} from '../route/route-actions.js';
import {registerUiActions} from '../ui/ui-actions.js';
import {humanGuide} from '../guide/human-guide.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];

function sessionId(){return `pg16_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
function setText(selector,value){const el=$(selector);if(el)el.textContent=value??'—';}

function render(){
  const state=pocketGuideState.get();const context=humanContextEngine.build();
  setText('#pg16Context',humanContextEngine.summary());
  setText('#pg16Route',context.route.title||'Aucun parcours');
  setText('#pg16Current',context.route.currentEventId||'—');
  setText('#pg16Next',context.route.nextEventId||'—');
  setText('#pg16Remaining',Number.isFinite(context.route.remainingMinutes)?`${Math.round(context.route.remainingMinutes)} min`:'—');
  setText('#pg16Status',state.conversation.status||'idle');
  $$('.pg16-panel').forEach(panel=>panel.hidden=panel.dataset.panel!==state.ui.panel);
  $$('.pg16-nav button').forEach(button=>button.classList.toggle('is-active',button.dataset.open===state.ui.panel));
  $('#pg16Proposal')?.toggleAttribute('hidden',!state.proposals.pending);
}

function appendLog(role,text){
  const log=$('#pg16Log');if(!log)return;
  const row=document.createElement('div');row.className=`pg16-log-row ${role}`;
  const who=document.createElement('strong');who.textContent=role==='user'?'Vous':'PocketGuide';
  const body=document.createElement('span');body.textContent=text;
  row.append(who,body);log.append(row);log.scrollTop=log.scrollHeight;
}

async function submitText(text){
  const value=String(text||'').trim();if(!value)return;
  appendLog('user',value);const lower=value.toLowerCase();
  let reply;
  if(['oui','yes','ok','d’accord','daccord','confirme'].includes(lower))reply=await humanGuide.confirmPending(true);
  else if(['non','no','annule','annuler','pas maintenant'].includes(lower))reply=await humanGuide.confirmPending(false);
  else reply=await humanGuide.handleText(value,{source:'pg16-alpha-ui'});
  appendLog('guide',reply.text);render();
}

async function boot(){
  const now=new Date().toISOString();
  pocketGuideState.patch({boot:{status:'starting',startedAt:now},session:{id:sessionId(),startedAt:now,lastActiveAt:now},device:{online:navigator.onLine,standalone:matchMedia('(display-mode: standalone)').matches}},{source:'bootstrap',event:'app.started'});
  registerUiActions();registerRouteActions();
  try{await loadRouteIntoV16();}
  catch(error){pocketGuideState.patch({diagnostics:{lastError:String(error?.message||error)}},{source:'bootstrap',event:'route.load.failed'});appendLog('guide',`Je démarre sans parcours : ${error.message}`);}
  pocketGuideState.patch({boot:{status:'ready',restoredAt:new Date().toISOString()}},{source:'bootstrap',event:'app.ready'});

  $$('.pg16-nav button').forEach(button=>button.addEventListener('click',()=>actionRegistry.execute(`ui.open_${button.dataset.open}`,{}, {source:'button'})));
  $$('[data-action]').forEach(button=>button.addEventListener('click',async()=>{const result=await actionRegistry.execute(button.dataset.action,{}, {source:'button'});if(result?.result?.name)appendLog('guide',`Étape active : ${result.result.name}`);render();}));
  $('#pg16Form')?.addEventListener('submit',async event=>{event.preventDefault();const input=$('#pg16Input');const value=input.value;input.value='';await submitText(value);});
  $('#pg16Yes')?.addEventListener('click',async()=>{const reply=await humanGuide.confirmPending(true);appendLog('guide',reply.text);render();});
  $('#pg16No')?.addEventListener('click',async()=>{const reply=await humanGuide.confirmPending(false);appendLog('guide',reply.text);render();});
  addEventListener('online',()=>pocketGuideState.patch({device:{online:true}},{source:'platform',event:'network.online'}));
  addEventListener('offline',()=>pocketGuideState.patch({device:{online:false}},{source:'platform',event:'network.offline'}));
  eventBus.on('*',()=>render());
  appendLog('guide',`Human Guide Alpha 1 prêt. ${humanContextEngine.summary()}`);render();

  window.__POCKETGUIDE_16__={state:pocketGuideState,bus:eventBus,actions:actionRegistry,context:humanContextEngine,guide:humanGuide,submitText};
}

boot().catch(error=>{console.error(error);setText('#pg16Context',`Erreur de démarrage : ${error.message}`);});

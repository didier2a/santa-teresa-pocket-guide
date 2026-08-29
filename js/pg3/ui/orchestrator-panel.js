import {eventBus} from '../../pg16/core/event-bus.js';

const LABELS=Object.freeze({idle:'Prêt',listening:'J’écoute',interpreting:'Je comprends',checking:'Je vérifie',acting:'J’agis',verifying:'Je contrôle',succeeded:'Terminé',degraded:'Mode dégradé',blocked:'Action requise',failed:'Erreur'});
let installed=false;

function createPanel(){
  const panel=document.createElement('section');panel.id='pg3OrchestratorPanel';panel.className='pg3-orchestrator';panel.dataset.state='idle';panel.setAttribute('aria-labelledby','pg3IntentTitle');
  panel.innerHTML=`<header class="pg3-orchestrator__state"><span class="pg3-orchestrator__signal" aria-hidden="true"></span><span><strong id="pg3StateLabel">Prêt</strong><small id="pg3StateDetail">Votre guide peut agir dans PocketGuide</small></span></header><div class="pg3-intent" id="pg3IntentPanel" hidden><div class="pg3-intent__heading"><span>INTENTION COMPRISE</span><strong id="pg3IntentMode">AUTO · 3 S</strong></div><h2 id="pg3IntentTitle">Commande prête</h2><div class="pg3-intent__copy"><span>VOUS AVEZ DIT</span><p id="pg3IntentRequest"></p></div><div class="pg3-intent__copy"><span>ACTION COMPRISE</span><p id="pg3IntentSummary"></p></div><div class="pg3-intent__actions"><button type="button" id="pg3IntentModify">Modifier</button><button type="button" id="pg3IntentLaunch">Lancer</button></div></div>`;
  const capabilities=document.getElementById('guideCapabilities'),flow=document.getElementById('livingFlow'),companion=document.querySelector('[data-view-panel="companion"]');
  if(capabilities)capabilities.before(panel);else if(flow)flow.before(panel);else companion?.append(panel);return panel;
}

export function installOrchestratorPanel({router,bus=eventBus}={}){
  if(installed)return globalThis.__POCKETGUIDE_V3_ORCHESTRATOR_UI__;installed=true;
  const panel=createPanel();if(!panel)return null;
  const intentPanel=panel.querySelector('#pg3IntentPanel'),stateLabel=panel.querySelector('#pg3StateLabel'),stateDetail=panel.querySelector('#pg3StateDetail'),mode=panel.querySelector('#pg3IntentMode'),request=panel.querySelector('#pg3IntentRequest'),summary=panel.querySelector('#pg3IntentSummary'),modify=panel.querySelector('#pg3IntentModify'),launch=panel.querySelector('#pg3IntentLaunch');
  let currentId=null,currentText='',countdown=null;
  const stopCountdown=()=>{if(countdown!==null){clearInterval(countdown);countdown=null;}};
  const renderCountdown=autoAt=>{stopCountdown();const update=()=>{const remaining=Math.max(0,autoAt-Date.now());mode.textContent=remaining?`AUTO · ${Math.max(1,Math.ceil(remaining/1000))} S`:'LANCEMENT';if(!remaining)stopCountdown();};update();countdown=setInterval(update,200);};
  const setActions=enabled=>{modify.disabled=!enabled;launch.disabled=!enabled;};
  const renderState=snapshot=>{panel.dataset.state=snapshot?.value||'idle';stateLabel.textContent=LABELS[snapshot?.value]||'Prêt';stateDetail.textContent=snapshot?.detail||'Votre guide peut agir dans PocketGuide';};
  bus.on('pg3.state.changed',renderState);
  bus.on('pg3.intent.ready',payload=>{currentId=payload.id;currentText=payload.text;intentPanel.hidden=false;request.textContent=payload.text;summary.textContent=payload.summary;mode.textContent='AUTO · 3 S';setActions(true);renderCountdown(payload.autoAt);});
  bus.on('pg3.intent.launched',payload=>{if(payload.id!==currentId)return;stopCountdown();mode.textContent='EN COURS';setActions(false);});
  bus.on('pg3.intent.completed',payload=>{if(payload.id!==currentId)return;stopCountdown();mode.textContent=payload.state==='succeeded'?'TERMINÉ':'CONTRÔLÉ';summary.textContent=payload.result?.speech||'Action contrôlée.';setActions(false);});
  bus.on('pg3.intent.failed',payload=>{if(payload.id!==currentId)return;stopCountdown();mode.textContent='ERREUR';summary.textContent=payload.result?.speech||'Action interrompue.';setActions(false);});
  bus.on('pg3.intent.cancelled',payload=>{if(payload.id!==currentId)return;stopCountdown();mode.textContent='À MODIFIER';summary.textContent='La commande attend votre correction.';setActions(false);});
  launch.addEventListener('click',()=>{if(currentId)void router?.launch(currentId);});
  modify.addEventListener('click',()=>{if(!currentId)return;router?.cancel(currentId,'modify');const input=document.getElementById('companionInput');if(input){input.value=currentText;input.focus();input.setSelectionRange?.(input.value.length,input.value.length);}});
  const api=Object.freeze({panel,renderState,destroy(){stopCountdown();panel.remove();installed=false;}});globalThis.__POCKETGUIDE_V3_ORCHESTRATOR_UI__=api;return api;
}

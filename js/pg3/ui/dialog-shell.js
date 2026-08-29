import {eventBus} from '../../pg16/core/event-bus.js';

const KINDS=new Set(['confirmation','permission','information','error']);
const STATES=new Set(['default','busy']);
const LABELS={confirmation:'Confirmation',permission:'Permission',information:'Information',error:'Erreur'};
const DEFAULT_STATUS={confirmation:'Prêt à confirmer',permission:'En attente de votre choix',information:'Aucune action urgente',error:'Connexion ou service indisponible'};
const DIALOGS={
  welcomeDialog:'information',proposalDialog:'confirmation',readyDialog:'confirmation',locationDialog:'permission',
  plannerDialog:'information',previewDialog:'information',photoDialog:'information',lipSyncLabDialog:'information',mapConsentDialog:'permission'
};
let installed=false;

function normalizeKind(value){return KINDS.has(value)?value:'information';}
function normalizeState(value){return STATES.has(value)?value:'default';}

function shellMeta(dialog){
  let header=dialog.querySelector(':scope > .dialog-shell__meta');
  if(header)return header;
  header=document.createElement('header');header.className='dialog-shell__meta';
  const kind=document.createElement('span');kind.className='dialog-shell__kind';
  const marker=document.createElement('i');marker.setAttribute('aria-hidden','true');
  const label=document.createElement('strong');kind.append(marker,label);
  const badge=document.createElement('span');badge.className='dialog-shell__badge';
  header.append(kind,badge);dialog.prepend(header);return header;
}

function statusStrip(dialog){
  let strip=dialog.querySelector(':scope > .dialog-shell__status');
  if(strip)return strip;
  strip=document.createElement('p');strip.className='dialog-shell__status';strip.setAttribute('aria-live','polite');
  const marker=document.createElement('i');marker.setAttribute('aria-hidden','true');const copy=document.createElement('span');strip.append(marker,copy);
  const actions=dialog.querySelector(':scope > .sheet-actions');if(actions)dialog.insertBefore(strip,actions);else dialog.append(strip);return strip;
}

function setBusyButtons(dialog,busy){
  for(const button of dialog.querySelectorAll('.sheet-actions button, .planner-form > button[type="submit"]')){
    if(busy){if(!button.disabled)button.dataset.pg3BusyDisabled='true';button.disabled=true;}
    else if(button.dataset.pg3BusyDisabled==='true'){button.disabled=false;delete button.dataset.pg3BusyDisabled;}
  }
}

export function setDialogState(dialogOrId,{kind,state='default',status}={}){
  const dialog=typeof dialogOrId==='string'?document.getElementById(dialogOrId):dialogOrId;if(!dialog)return false;
  const nextKind=normalizeKind(kind||dialog.dataset.dialogKind),nextState=normalizeState(state);
  dialog.dataset.dialogKind=nextKind;dialog.dataset.dialogState=nextState;dialog.setAttribute('aria-busy',String(nextState==='busy'));
  const meta=shellMeta(dialog);meta.querySelector('.dialog-shell__kind strong').textContent=LABELS[nextKind];meta.querySelector('.dialog-shell__badge').textContent=nextState==='busy'?'Traitement':'Prêt';
  statusStrip(dialog).querySelector('span').textContent=status|| (nextState==='busy'?'Traitement en cours…':DEFAULT_STATUS[nextKind]);
  setBusyButtons(dialog,nextState==='busy');return true;
}

function installStateBridges(){
  eventBus.on('pg233.planning.started',()=>setDialogState('plannerDialog',{kind:'information',state:'busy'}));
  eventBus.on('proposal.created',()=>{setDialogState('plannerDialog',{kind:'information',state:'default'});setDialogState('proposalDialog',{kind:'confirmation',state:'default'});});
  eventBus.on('proposal.confirmed',()=>setDialogState('proposalDialog',{kind:'confirmation',state:'default',status:'Itinéraire confirmé'}));
  eventBus.on('proposal.rejected',()=>setDialogState('proposalDialog',{kind:'information',state:'default',status:'Aucun changement appliqué'}));
  eventBus.on('gps.updated',()=>setDialogState('locationDialog',{kind:'permission',state:'default',status:'Position autorisée'}));
  for(const type of ['gps.denied','gps.error','gps.unavailable'])eventBus.on(type,()=>setDialogState('locationDialog',{kind:'error',state:'default'}));
}

export function installDialogShell(){
  if(installed)return globalThis.__POCKETGUIDE_V3_DIALOGS__;installed=true;
  for(const [id,kind] of Object.entries(DIALOGS))setDialogState(id,{kind,state:'default'});
  document.getElementById('allowPosition')?.addEventListener('click',()=>setDialogState('locationDialog',{kind:'permission',state:'busy'}));
  document.getElementById('positionLater')?.addEventListener('click',()=>setDialogState('locationDialog',{kind:'permission',state:'default'}));
  installStateBridges();
  const api=Object.freeze({setState:setDialogState,kinds:Object.freeze([...KINDS]),states:Object.freeze([...STATES])});globalThis.__POCKETGUIDE_V3_DIALOGS__=api;return api;
}

import {eventBus} from '../../pg16/core/event-bus.js';
import {companionOrchestrator21} from '../../pg21/companion/companion-orchestrator.js';
import {installDialogShell} from '../ui/dialog-shell.js';
import {cyberneticStateMachine} from '../core/cybernetic-state-machine.js';
import {intentRouter} from '../orchestrator/intent-router.js';
import {installOrchestratorPanel} from '../ui/orchestrator-panel.js';

const VERSION='3.0.0-preview.3';
let installed=false;

function installIntentBridge(v233){
  const avatar=v233?.avatar;if(avatar)avatar.onCommand=(text,meta)=>intentRouter.handle(text,meta);
  const inheritedAsk=companionOrchestrator21.ask.bind(companionOrchestrator21);
  companionOrchestrator21.ask=async function(text,options={}){
    const value=String(text||'').trim();if(!value)return null;const routed=intentRouter.handle(value,{source:options.source||'text'});
    if(!routed.handled)return inheritedAsk(value,options);
    this.turn('user',value,{source:options.source||'text'});avatar?.cancelResponse?.('pg3-text-intent');const result=await routed.completion;
    await v233?.narrate?.(result,{source:options.source||'text'});return{type:'PG3_INTENT',intent:routed.intent,result};
  };
}

function installCompanionStateBridge(){
  eventBus.on('companion.status',payload=>{
    if(intentRouter.current())return;const value=String(payload?.value||'');
    try{if(value==='listening')cyberneticStateMachine.transition('listening',{detail:'Je vous écoute',reason:'liveavatar-listening',source:'liveavatar'});else if(value==='thinking')cyberneticStateMachine.transition('interpreting',{detail:'Je comprends votre demande',reason:'liveavatar-thinking',source:'liveavatar'});else if(['speaking','ready'].includes(value)&&['listening','interpreting'].includes(cyberneticStateMachine.snapshot.value))cyberneticStateMachine.transition('idle',{detail:value==='speaking'?'Je vous réponds':'Prêt',reason:`liveavatar-${value}`,source:'liveavatar'});}catch(error){console.warn('[PocketGuide V3] statut LiveAvatar ignoré',{value,error:String(error?.message||error)});}
  });
}

export function installPocketGuide3(){
  if(installed)return globalThis.__POCKETGUIDE_V3__;installed=true;
  const app=document.getElementById('companionApp');if(app){app.dataset.pgGeneration='3';app.dataset.pgRelease=VERSION;}
  const dialogs=installDialogShell(),v233=globalThis.__POCKETGUIDE_V233__;installIntentBridge(v233);installCompanionStateBridge();const orchestratorPanel=installOrchestratorPanel({router:intentRouter});
  const apple=document.querySelector('meta[name="apple-mobile-web-app-title"]');if(apple)apple.content='PocketGuide 3 Preview';
  const description=document.querySelector('meta[name="description"]');if(description)description.content='PocketGuide V3 — refonte fonctionnelle pilotée par Figma, conservant la couche LiveAvatar et audio éprouvée.';
  const runtime=Object.freeze({version:VERSION,designSource:'Figma',compatibilityRuntime:'2.3.3',dialogs,state:cyberneticStateMachine,intents:intentRouter,orchestratorPanel});globalThis.__POCKETGUIDE_V3__=runtime;
  eventBus.emit('pg3.runtime.ready',{version:VERSION,designSource:'Figma',capabilities:['cybernetic-state','intent-routing']});return runtime;
}

import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {humanGuide} from '../../pg16/guide/human-guide.js';
import {voiceController} from '../../pg16/guide/voice-controller.js';
import {plannerEngine} from '../../pg16/planner/planner-engine.js';
import {proposalManager} from '../../pg16/core/proposal-manager.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {journeyConcierge} from './journey-concierge.js';
import {humanRealtimeCompanion} from './human-realtime-companion.js';

const YES=new Set(['oui','yes','ok','d’accord','daccord','confirme','je confirme','vas-y']);
const NO=new Set(['non','no','annule','annuler','pas maintenant','ne change rien']);
const normalized=value=>String(value||'').trim().toLowerCase();

export class CompanionOrchestrator21{
  constructor(){this.onTurn=null;this.onStatus=null;this.onProposal=null;this.onPlanning=null;this.onPlanReady=null;this.voiceOutput=true;this.remoteAudio=null;this.started=false;}
  install({remoteAudio}={}){
    if(this.started)return this;this.started=true;this.remoteAudio=remoteAudio||null;
    humanRealtimeCompanion.onTurn=(role,text,meta)=>this.turn(role,text,meta);humanRealtimeCompanion.onStatus=payload=>this.onStatus?.(payload);
    voiceController.onTranscript=text=>this.ask(text,{source:'voice-fallback',speak:true});voiceController.onStatus=(status,label)=>this.onStatus?.({value:status==='listening'?'listening':status==='speaking'?'speaking':status==='unsupported'?'degraded':'ready',label:label||'Je suis avec vous',connected:humanRealtimeCompanion.connected,listening:voiceController.listening,local:true});
    eventBus.on('proposal.created',payload=>this.onProposal?.(payload?.after?.proposals?.pending||proposalManager.pending()));eventBus.on('proposal.confirmed',()=>this.onProposal?.(null));eventBus.on('proposal.rejected',()=>this.onProposal?.(null));return this;
  }
  turn(role,text,meta={}){const value=String(text||'').trim();if(value)this.onTurn?.(role,value,meta);}
  async startVoice(){const connected=await humanRealtimeCompanion.connect({remoteAudio:this.remoteAudio,autoListen:true});if(connected)return{mode:'realtime',connected:true};const local=voiceController.start();if(!local)this.onStatus?.({value:'degraded',label:'Écrivez-moi, je reste avec vous',connected:false,local:true});return{mode:'local',connected:false,recognition:Boolean(local)};}
  async toggleListening(){if(humanRealtimeCompanion.connected){if(humanRealtimeCompanion.listening){humanRealtimeCompanion.stopListening();return false;}humanRealtimeCompanion.beginListening();return true;}if(voiceController.listening){voiceController.stop();return false;}const connected=await humanRealtimeCompanion.connect({remoteAudio:this.remoteAudio,autoListen:true});return connected||voiceController.start();}
  interrupt(){humanRealtimeCompanion.interrupt();voiceController.interrupt();}
  speak(text){if(this.voiceOutput&&!humanRealtimeCompanion.connected)voiceController.speak(text);}
  setVoiceOutput(enabled){this.voiceOutput=Boolean(enabled);if(!this.voiceOutput)this.interrupt();return this.voiceOutput;}
  async ask(text,{source='text',speak=false}={}){
    const value=String(text||'').trim();if(!value)return null;const lower=normalized(value);this.turn('user',value,{source});
    if(YES.has(lower))return this.resolveProposal(true,{speak});if(NO.has(lower))return this.resolveProposal(false,{speak});
    if(humanRealtimeCompanion.connected){humanRealtimeCompanion.ask(value);return{type:'REALTIME'};}
    const location=pocketGuideState.select('location')||{},result=journeyConcierge.consume(value,{location:{...location,simulated:Boolean(pocketGuideState.select('session.simulation'))}});
    if(result.handled){this.onPlanning?.(!result.ready);this.turn('companion',result.reply,{source:'concierge'});this.speak(result.reply);if(result.needsLocation)eventBus.emit('ui.location.requested',{});if(!result.ready)return result;
      pocketGuideState.patch({conversation:{status:'thinking'}},{source:'pg21-orchestrator',event:'planner.started'});this.onStatus?.({value:'thinking',label:'Je vérifie votre excursion',connected:false,local:true});
      try{const planned=await plannerEngine.proposeReplacement(result.request),reply=`J’ai préparé « ${planned.plan.pack.title} ». Je vous présente le parcours avant de toucher à votre voyage actuel.`;this.turn('companion',reply,{source:'planner'});this.speak(reply);this.onPlanning?.(false);this.onPlanReady?.(planned);this.onProposal?.(planned.proposal);return planned;}
      catch(error){const reply=`Je n’ai pas pu vérifier cette excursion : ${error.message||error}. Votre voyage actuel reste intact.`;this.turn('companion',reply,{source:'planner-error'});this.speak(reply);this.onPlanning?.(false);this.onStatus?.({value:'degraded',label:'Votre voyage reste disponible',connected:false,local:true});return{error};}
    }
    const reply=await humanGuide.handleText(value,{source});this.turn('companion',reply.text,{source:'local'});if(speak||this.voiceOutput)this.speak(reply.text);if(reply.proposal)this.onProposal?.(reply.proposal);return reply;
  }
  async resolveProposal(confirmed,{speak=true}={}){try{const reply=await humanGuide.confirmPending(Boolean(confirmed));this.turn('companion',reply.text,{source:'confirmation'});if(speak)this.speak(reply.text);return reply;}catch(error){const text=`Je n’ai pas pu appliquer ce changement : ${error.message||error}.`;this.turn('companion',text,{source:'confirmation-error'});if(speak)this.speak(text);return{error};}}
  async analyzeImage(dataUrl){if(!humanRealtimeCompanion.connected)return false;this.turn('user','Qu’est-ce que je regarde ?',{source:'vision'});return humanRealtimeCompanion.askWithImage(dataUrl,'Qu’est-ce que je regarde ?');}
}

export const companionOrchestrator21=new CompanionOrchestrator21();

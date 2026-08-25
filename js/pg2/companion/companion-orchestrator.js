import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {humanGuide} from '../../pg16/guide/human-guide.js';
import {voiceController} from '../../pg16/guide/voice-controller.js';
import {plannerEngine} from '../../pg16/planner/planner-engine.js';
import {proposalManager} from '../../pg16/core/proposal-manager.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {realtimeCompanion} from './realtime-companion.js';

const YES=new Set(['oui','yes','ok','d’accord','daccord','confirme','je confirme','vas-y']);
const NO=new Set(['non','no','annule','annuler','pas maintenant','ne change rien']);
function normalized(value){return String(value||'').trim().toLowerCase();}
function isNewRouteRequest(text){return /\b(cr[eé]e|cr[eé]er|pr[eé]pare|pr[eé]parer|nouvelle|nouveau|autre)\b.*\b(balade|excursion|parcours|itin[eé]raire|routepack)\b/i.test(text)||/\b(balade|excursion|parcours|itin[eé]raire)\b.*\b(autour de moi|ici|à |a )/i.test(text);}

export class CompanionOrchestrator{
  constructor(){this.onTurn=null;this.onStatus=null;this.onProposal=null;this.voiceOutput=true;this.remoteAudio=null;this.started=false;}
  install({remoteAudio}={}){
    if(this.started)return this;this.started=true;this.remoteAudio=remoteAudio||null;
    realtimeCompanion.onTurn=(role,text,meta)=>this.turn(role,text,meta);
    realtimeCompanion.onStatus=payload=>this.onStatus?.(payload);
    voiceController.onTranscript=text=>this.ask(text,{source:'voice-fallback',speak:true});
    voiceController.onStatus=(status,label)=>{
      const mapped=status==='listening'?'listening':status==='speaking'?'speaking':status==='unsupported'?'degraded':'ready';
      this.onStatus?.({value:mapped,label:label||'Je suis avec vous',connected:realtimeCompanion.connected,listening:voiceController.listening,local:true});
    };
    eventBus.on('proposal.created',payload=>this.onProposal?.(payload?.after?.proposals?.pending||proposalManager.pending()));
    eventBus.on('proposal.confirmed',()=>this.onProposal?.(null));eventBus.on('proposal.rejected',()=>this.onProposal?.(null));
    return this;
  }
  turn(role,text,meta={}){const value=String(text||'').trim();if(!value)return;this.onTurn?.(role,value,meta);}
  async startVoice(){
    const connected=await realtimeCompanion.connect({remoteAudio:this.remoteAudio,autoListen:true});
    if(connected)return {mode:'realtime',connected:true};
    const local=voiceController.start();if(!local)this.onStatus?.({value:'degraded',label:'Écrivez-moi, je reste avec vous',connected:false,local:true});
    return {mode:'local',connected:false,recognition:Boolean(local)};
  }
  async toggleListening(){
    if(realtimeCompanion.connected){if(realtimeCompanion.listening){realtimeCompanion.stopListening();return false;}realtimeCompanion.beginListening();return true;}
    if(voiceController.listening){voiceController.stop();return false;}
    const connected=await realtimeCompanion.connect({remoteAudio:this.remoteAudio,autoListen:true});if(connected)return true;
    return voiceController.start();
  }
  interrupt(){realtimeCompanion.interrupt();voiceController.interrupt();}
  speak(text){if(!this.voiceOutput)return;if(realtimeCompanion.connected)return;voiceController.speak(text);}
  setVoiceOutput(enabled){this.voiceOutput=Boolean(enabled);if(!this.voiceOutput)this.interrupt();return this.voiceOutput;}
  async ask(text,{source='text',speak=false}={}){
    const value=String(text||'').trim();if(!value)return null;const lower=normalized(value);
    this.turn('user',value,{source});
    if(YES.has(lower))return this.resolveProposal(true,{speak});
    if(NO.has(lower))return this.resolveProposal(false,{speak});
    if(realtimeCompanion.connected){realtimeCompanion.ask(value);return {type:'REALTIME'};}
    if(isNewRouteRequest(value)&&pocketGuideState.select('device.online')!==false){
      pocketGuideState.patch({conversation:{status:'thinking'}},{source:'pg2-orchestrator',event:'planner.started'});this.onStatus?.({value:'thinking',label:'Je prépare cette excursion',connected:false,local:true});
      try{
        const result=await plannerEngine.proposeReplacement({prompt:value,maxPlaces:5});
        const reply=`J’ai préparé « ${result.plan.pack.title} » avec ${result.plan.pack.places?.length||0} lieux. Je ne remplacerai votre voyage qu’après votre confirmation.`;
        this.turn('companion',reply,{source:'planner'});this.speak(reply);this.onProposal?.(result.proposal);return result;
      }catch(error){
        const reply=`Je n’ai pas pu vérifier cette nouvelle excursion : ${error.message||error}. Votre voyage actuel reste intact.`;this.turn('companion',reply,{source:'planner-error'});this.speak(reply);this.onStatus?.({value:'degraded',label:'Votre voyage reste disponible',connected:false,local:true});return {error};
      }
    }
    const reply=await humanGuide.handleText(value,{source});this.turn('companion',reply.text,{source:'local'});if(speak||this.voiceOutput)this.speak(reply.text);if(reply.proposal)this.onProposal?.(reply.proposal);return reply;
  }
  async resolveProposal(confirmed,{speak=true}={}){
    try{const reply=await humanGuide.confirmPending(Boolean(confirmed));this.turn('companion',reply.text,{source:'confirmation'});if(speak)this.speak(reply.text);return reply;}
    catch(error){const text=`Je n’ai pas pu appliquer ce changement : ${error.message||error}.`;this.turn('companion',text,{source:'confirmation-error'});if(speak)this.speak(text);return {error};}
  }
  async analyzeImage(dataUrl){
    if(!realtimeCompanion.connected)return false;
    this.turn('user','Qu’est-ce que je regarde ?',{source:'vision'});return realtimeCompanion.askWithImage(dataUrl,'Qu’est-ce que je regarde ?');
  }
}

export const companionOrchestrator=new CompanionOrchestrator();
export {isNewRouteRequest};

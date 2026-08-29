import {createCompanionWebSdk} from '../../companion-sdk/companion-web-sdk.js?v=0.2.0';

export class AvatarAudioAdapter{
  constructor({bus,fetchImpl=globalThis.fetch,documentImpl=globalThis.document,locationImpl=globalThis.location,sdkLoader}={}){
    this.bus=bus;this.document=documentImpl;this.commandHandler=null;this.statusHandler=null;
    this.sdk=createCompanionWebSdk({bus,fetchImpl,documentImpl,locationImpl,sdkLoader,clientVersion:'4.0.0-preview.6'});
    this.controller=this.sdk.controller;
  }
  install({root,portrait,host,status,retry,onCommand,onStatus,onTurn}={}){
    this.commandHandler=onCommand||null;this.statusHandler=onStatus||null;
    this.sdk.install({root,portrait,host,status,retry,onTurn,onStatus:payload=>{this.statusHandler?.(payload);this.bus?.emit('pg4.avatar.status',payload);},onCapability:(text,meta)=>this.commandHandler?.(text,meta)||{handled:false}});
    return this;
  }
  startListening(){return this.sdk.startListening();}
  toggleListening(){return this.sdk.toggleListening();}
  interrupt(reason){return this.sdk.interrupt(reason);}
  suspendMicrophone(){return this.sdk.suspendMicrophone();}
  resumeMicrophone(shouldResume=true){return this.sdk.resumeMicrophone(shouldResume);}
  reset(){return this.sdk.reset();}
  narrateEvidence(evidence){return this.sdk.narrateEvidence(evidence);}
  diagnostic(){return this.sdk.diagnostic();}
  destroy(){return this.sdk.destroy();}
}

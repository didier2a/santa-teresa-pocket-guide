import {LiveAvatarRealtimeController} from '../../pg23/avatar/liveavatar-realtime-controller.js?v=4.0.0-preview.4';

export class AvatarAudioAdapter{
  constructor({bus,fetchImpl=globalThis.fetch,documentImpl=globalThis.document}={}){
    this.bus=bus;this.document=documentImpl;this.commandHandler=null;this.statusHandler=null;
    this.controller=new LiveAvatarRealtimeController({bus,fetchImpl,documentImpl});
  }
  install({root,portrait,host,status,retry,onCommand,onStatus,onTurn}={}){
    this.commandHandler=onCommand||null;this.statusHandler=onStatus||null;
    this.controller.install({root,portrait,host,status,retry,onTurn,onStatus:payload=>{this.statusHandler?.(payload);this.bus?.emit('pg4.avatar.status',payload);},onCommand:(text,meta)=>this.commandHandler?.(text,meta)||{handled:false}});
    return this;
  }
  startListening(){return this.controller.startListening();}
  toggleListening(){return this.controller.toggleListening();}
  interrupt(){return this.controller.interrupt();}
  async narrateEvidence(evidence){
    if(!evidence?.speech||!['succeeded','degraded'].includes(evidence.status))return false;
    if(!this.controller.diagnostic().connected)return false;
    return this.controller.narrate(evidence.speech,{intent:evidence.capabilityId,source:evidence.source});
  }
  diagnostic(){return this.controller.diagnostic();}
  destroy(){return this.controller.destroy();}
}

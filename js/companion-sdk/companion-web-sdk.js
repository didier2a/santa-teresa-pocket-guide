import {CompanionController} from './core/companion-controller.js';
import {LiveAvatarV3Provider} from './providers/liveavatar-v3-provider.js';

export const COMPANION_SDK_VERSION='0.2.0';

export class CompanionWebSdk{
  constructor({controller,bus=null}={}){
    if(!controller)throw new TypeError('CompanionWebSdk requiert un contrôleur');
    this.controller=controller;
    this.bus=bus;
  }

  install(options={}){this.controller.install(options);return this;}
  startListening(){return this.controller.startListening();}
  toggleListening(){return this.controller.toggleListening();}
  suspendMicrophone(){return this.controller.suspendMicrophone();}
  resumeMicrophone(shouldResume=true){return this.controller.resumeMicrophone(shouldResume);}
  interrupt(reason='user-action'){return this.controller.interrupt(reason);}
  narrateEvidence(evidence){return this.controller.narrateEvidence(evidence);}
  on(type,handler){return this.bus?.on(type,handler)||(()=>{});}
  destroy(){return this.controller.destroy();}
  reset(){return this.controller.reset();}

  diagnostic(){
    return{
      sdk:'companion-web',
      sdkVersion:COMPANION_SDK_VERSION,
      ...this.controller.diagnostic()
    };
  }
}

export function createCompanionWebSdk({bus,fetchImpl,documentImpl,locationImpl,sdkLoader,sessionEndpoint,clientVersion}={}){
  const provider=new LiveAvatarV3Provider({bus,fetchImpl,documentImpl,locationImpl,sdkLoader,sessionEndpoint,clientVersion});
  const controller=new CompanionController({provider,bus});
  return new CompanionWebSdk({controller,bus});
}

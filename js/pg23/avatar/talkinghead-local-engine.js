import {eventBus} from '../../pg16/core/event-bus.js';

const HEAD_AUDIO_MODULE='../../../vendor/avatar-local/headaudio-0.1.0/headaudio.min.mjs';
const HEAD_AUDIO_WORKLET='./vendor/avatar-local/headaudio-0.1.0/headworklet.min.mjs';
const HEAD_AUDIO_MODEL='./vendor/avatar-local/headaudio-0.1.0/model-en-mixed.bin';
const deadline=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))]);

export class TalkingHeadLocalEngine{
  constructor({bus=eventBus}={}){this.bus=bus;this.id='local';this.host=null;this.portrait=null;this.audioBus=null;this.config=null;this.head=null;this.headAudio=null;this.active=false;this.audioReady=false;this.audioError='';this.lastError='';this.startedAt=0;this.session=0;}
  install({host,portrait,audioBus,config}={}){this.host=host;this.portrait=portrait;this.audioBus=audioBus;this.config=config||{};return this;}
  capabilities(){return{offline:true,networkVideo:false,webgl:Boolean(globalThis.WebGLRenderingContext),audioWorklet:Boolean(globalThis.AudioWorkletNode)};}
  supported(){return Boolean(this.host&&this.capabilities().webgl);}
  async installAudio(session){
    try{
      const audioCtx=this.audioBus?.ensureContext?.();if(!audioCtx||!this.capabilities().audioWorklet)throw new Error('Synchronisation audio indisponible sur ce navigateur');
      const {HeadAudio}=await import(HEAD_AUDIO_MODULE);if(session!==this.session)return;
      await audioCtx.audioWorklet.addModule(HEAD_AUDIO_WORKLET);if(session!==this.session)return;
      const headAudio=new HeadAudio(audioCtx,{parameterData:{vadGateActiveDb:-40,vadGateInactiveDb:-58,speakerMeanHz:220}});await headAudio.loadModel(HEAD_AUDIO_MODEL);if(session!==this.session){try{headAudio.disconnect();}catch{}return;}
      this.headAudio=headAudio;this.headAudio.onvalue=(key,value)=>{const target=this.head?.mtAvatar?.[key];if(target)Object.assign(target,{newvalue:value,needsUpdate:true});};this.headAudio.onstarted=()=>this.bus.emit('pg23.avatar.local.speech.started',{});this.headAudio.onended=()=>this.bus.emit('pg23.avatar.local.speech.ended',{});if(this.head?.opt)this.head.opt.update=this.headAudio.update.bind(this.headAudio);this.audioBus.tap(this.headAudio);this.audioReady=true;this.audioError='';this.bus.emit('pg23.avatar.local.audio.ready',{});
    }catch(error){if(session!==this.session)return;this.audioReady=false;this.audioError=String(error?.message||error);this.bus.emit('pg23.avatar.local.audio.degraded',{message:this.audioError});}
  }
  async activate(){
    if(this.active)return{active:true,reused:true};if(!this.config?.ready)throw new Error('Le modèle 3D local n’est pas prêt');if(!this.supported())throw new Error('WebGL est indisponible sur ce navigateur');
    const session=++this.session;
    try{
      const audioCtx=this.audioBus?.ensureContext?.()||undefined,{TalkingHead}=await deadline(import('talkinghead'),45000,'Chargement Talking Head trop long');if(session!==this.session)throw new Error('Démarrage Claire annulé');
      this.head=new TalkingHead(this.host,{audioCtx,modelFPS:Number(this.config.modelFPS)||24,modelPixelRatio:Number(this.config.modelPixelRatio)||1,cameraView:this.config.cameraView||'upper',cameraRotateEnable:false,cameraPanEnable:false,cameraZoomEnable:false,avatarIdleHeadMove:.28,avatarSpeakingHeadMove:.35});
      await deadline(this.head.showAvatar({url:this.config.modelUrl,body:'F',avatarMood:'neutral',lipsyncLang:'fr',baseline:{headRotateX:-.04,eyeBlinkLeft:.1,eyeBlinkRight:.1}}),45000,'Chargement du modèle Claire trop long');if(session!==this.session)throw new Error('Démarrage Claire annulé');
      this.active=true;this.startedAt=Date.now();this.host.hidden=false;this.host.removeAttribute('aria-hidden');this.portrait?.setAttribute?.('aria-hidden','true');this.bus.emit('pg23.avatar.engine.active',{engine:this.id,identity:'Claire'});void this.installAudio(session);return{active:true,audioPending:true};
    }catch(error){this.lastError=String(error?.message||error);await this.destroy();throw error;}
  }
  setPresence(state){if(!this.head)return;const mood=state==='arrived'?'happy':state==='error'?'sad':'neutral';try{this.head.setMood?.(mood);}catch{}}
  interrupt(){try{this.headAudio?.stop?.();}catch{}try{this.head?.stopSpeaking?.();}catch{}}
  diagnostic(){return{id:this.id,identity:'Claire',active:this.active,ready:Boolean(this.config?.ready),audioReady:this.audioReady,capabilities:this.capabilities(),startedAt:this.startedAt||null,error:this.lastError||null,audioError:this.audioError||null};}
  async destroy(){this.session+=1;this.active=false;this.audioReady=false;if(this.headAudio){this.audioBus?.untap?.(this.headAudio);try{this.headAudio.stop();this.headAudio.disconnect();}catch{}}this.headAudio=null;try{this.head?.stop?.();}catch{}try{this.head?.dispose?.();}catch{}this.head=null;if(this.host){this.host.hidden=true;this.host.setAttribute('aria-hidden','true');this.host.replaceChildren();}this.portrait?.removeAttribute?.('aria-hidden');}
}

import {eventBus} from '../../pg16/core/event-bus.js';

const HEAD_AUDIO_MODULE='../../../vendor/avatar-local/headaudio-0.1.0/headaudio.min.mjs';
const HEAD_AUDIO_WORKLET='./vendor/avatar-local/headaudio-0.1.0/headworklet.min.mjs';
const HEAD_AUDIO_MODEL='./vendor/avatar-local/headaudio-0.1.0/model-en-mixed.bin';

export class TalkingHeadLocalEngine{
  constructor({bus=eventBus}={}){this.bus=bus;this.id='local';this.host=null;this.portrait=null;this.audioBus=null;this.config=null;this.head=null;this.headAudio=null;this.active=false;this.lastError='';this.startedAt=0;}
  install({host,portrait,audioBus,config}={}){this.host=host;this.portrait=portrait;this.audioBus=audioBus;this.config=config||{};return this;}
  capabilities(){return{offline:true,networkVideo:false,webgl:Boolean(globalThis.WebGLRenderingContext),audioWorklet:Boolean(globalThis.AudioWorkletNode)};}
  supported(){const caps=this.capabilities();return Boolean(this.host&&caps.webgl&&caps.audioWorklet&&this.audioBus?.ensureContext?.());}
  async activate(){
    if(this.active)return{active:true,reused:true};if(!this.config?.ready)throw new Error('Le modèle 3D local n’est pas prêt');if(!this.supported())throw new Error('Avatar 3D local non compatible avec ce navigateur');
    try{
      const [{TalkingHead},{HeadAudio}]=await Promise.all([import('talkinghead'),import(HEAD_AUDIO_MODULE)]),audioCtx=this.audioBus.ensureContext();
      this.head=new TalkingHead(this.host,{audioCtx,modelFPS:Number(this.config.modelFPS)||24,modelPixelRatio:Number(this.config.modelPixelRatio)||1,cameraView:this.config.cameraView||'upper',cameraRotateEnable:false,cameraPanEnable:false,cameraZoomEnable:false,avatarIdleHeadMove:.28,avatarSpeakingHeadMove:.35});
      await this.head.showAvatar({url:this.config.modelUrl,body:'F',avatarMood:'neutral',lipsyncLang:'fr',baseline:{headRotateX:-.04,eyeBlinkLeft:.1,eyeBlinkRight:.1}});
      await audioCtx.audioWorklet.addModule(HEAD_AUDIO_WORKLET);this.headAudio=new HeadAudio(audioCtx,{parameterData:{vadGateActiveDb:-40,vadGateInactiveDb:-58,speakerMeanHz:220}});await this.headAudio.loadModel(HEAD_AUDIO_MODEL);
      this.headAudio.onvalue=(key,value)=>{const target=this.head?.mtAvatar?.[key];if(target)Object.assign(target,{newvalue:value,needsUpdate:true});};this.headAudio.onstarted=()=>this.bus.emit('pg23.avatar.local.speech.started',{});this.headAudio.onended=()=>this.bus.emit('pg23.avatar.local.speech.ended',{});this.head.opt.update=this.headAudio.update.bind(this.headAudio);this.audioBus.tap(this.headAudio);
      this.active=true;this.startedAt=Date.now();this.host.hidden=false;this.portrait?.setAttribute?.('aria-hidden','true');this.bus.emit('pg23.avatar.engine.active',{engine:this.id});return{active:true};
    }catch(error){this.lastError=String(error?.message||error);await this.destroy();throw error;}
  }
  setPresence(state){if(!this.head)return;const mood=state==='arrived'?'happy':state==='error'?'sad':'neutral';try{this.head.setMood?.(mood);}catch{}}
  interrupt(){try{this.headAudio?.stop?.();}catch{}try{this.head?.stopSpeaking?.();}catch{}}
  diagnostic(){return{id:this.id,active:this.active,ready:Boolean(this.config?.ready),capabilities:this.capabilities(),startedAt:this.startedAt||null,error:this.lastError||null};}
  async destroy(){this.active=false;if(this.headAudio){this.audioBus?.untap?.(this.headAudio);try{this.headAudio.stop();this.headAudio.disconnect();}catch{}}this.headAudio=null;try{this.head?.stop?.();}catch{}try{this.head?.dispose?.();}catch{}this.head=null;if(this.host){this.host.hidden=true;this.host.replaceChildren();}this.portrait?.removeAttribute?.('aria-hidden');}
}

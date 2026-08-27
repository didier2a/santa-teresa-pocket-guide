import {eventBus} from '../../pg16/core/event-bus.js';
import * as THREE from '../../../vendor/avatar-local/three-0.180.0/build/three.module.min.js';
import {ClaireThreeStage,captureNativePose,restoreNativePose} from './claire-three-stage.js';

const HEAD_AUDIO_MODULE='../../../vendor/avatar-local/headaudio-0.1.0/headaudio.min.mjs';
const TALKING_HEAD_MODULE='../../../vendor/avatar-local/talkinghead-1.7.0/talkinghead.mjs';
const HEAD_AUDIO_WORKLET='./vendor/avatar-local/headaudio-0.1.0/headworklet.min.mjs';
const HEAD_AUDIO_MODEL='./vendor/avatar-local/headaudio-0.1.0/model-en-mixed.bin';
const deadline=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))]);
const nextFrame=()=>new Promise(resolve=>globalThis.requestAnimationFrame?globalThis.requestAnimationFrame(()=>resolve()):setTimeout(resolve,16));
export class TalkingHeadLocalEngine{
  constructor({bus=eventBus}={}){this.bus=bus;this.id='local';this.host=null;this.portrait=null;this.audioBus=null;this.config=null;this.head=null;this.headAudio=null;this.threeStage=null;this.nativePose=[];this.poseStabilizer=null;this.active=false;this.audioReady=false;this.audioError='';this.lastError='';this.frameDiagnostic=null;this.stage='idle';this.startedAt=0;this.session=0;}
  install({host,portrait,audioBus,config}={}){this.host=host;this.portrait=portrait;this.audioBus=audioBus;this.config=config||{};return this;}
  capabilities(){return{offline:true,networkVideo:false,webgl:Boolean(globalThis.WebGLRenderingContext),audioWorklet:Boolean(globalThis.AudioWorkletNode)};}
  supported(){return Boolean(this.host&&this.capabilities().webgl);}
  async prepareHost(){
    this.stage='host-layout';
    this.host.hidden=false;this.host.removeAttribute('aria-hidden');this.host.style.visibility='hidden';this.host.replaceChildren();
    await nextFrame();await nextFrame();
    const rect=this.host.getBoundingClientRect();if(rect.width<2||rect.height<2)throw new Error(`Zone 3D sans dimensions (${Math.round(rect.width)} × ${Math.round(rect.height)})`);
    const canvas=document.createElement('canvas'),options={alpha:true,antialias:false,powerPreference:'low-power',failIfMajorPerformanceCaveat:false};
    this.stage='webgl2-context';const gl=canvas.getContext('webgl2',options);if(!gl)throw new Error(`WebGL2 indisponible (${Math.round(rect.width)} × ${Math.round(rect.height)})`);
    canvas.width=Math.max(1,Math.round(rect.width));canvas.height=Math.max(1,Math.round(rect.height));this.host.style.visibility='';return{rect,canvas,gl};
  }
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
      const prepared=await this.prepareHost();
      let audioCtx;try{audioCtx=this.audioBus?.ensureContext?.()||undefined;}catch(error){this.audioError=String(error?.message||error);audioCtx=undefined;}
      this.stage='talkinghead-module';
      const {TalkingHead}=await deadline(import(TALKING_HEAD_MODULE),45000,'Chargement Talking Head trop long');if(session!==this.session)throw new Error('Démarrage Claire annulé');
      const deviceRatio=Math.max(1,Number(globalThis.devicePixelRatio)||1),configuredRatio=Number(this.config.modelPixelRatio)||1,renderPixelRatio=Math.min(1.35,configuredRatio*deviceRatio),modelFPS=Number(this.config.modelFPS)||24;
      this.stage='three-renderer';this.threeStage=new ClaireThreeStage({THREE,host:this.host,canvas:prepared.canvas,context:prepared.gl,pixelRatio:renderPixelRatio,modelFPS,view:this.config.cameraView||'portrait'});this.head=new TalkingHead(this.host,{audioCtx,lipsyncModules:[],avatarOnly:true,avatarOnlyScene:this.threeStage.scene,avatarOnlyCamera:this.threeStage.camera,modelFPS,avatarIdleHeadMove:.28,avatarSpeakingHeadMove:.35});
      this.stage='claire-model';
      let nativePose=[];await deadline(this.head.showAvatar({url:this.config.modelUrl,body:'F',avatarMood:'neutral',lipsyncLang:'fr',baseline:{headRotateX:-.04,eyeBlinkLeft:.1,eyeBlinkRight:.1}},null,gltf=>{nativePose=captureNativePose(gltf.scene);}),45000,'Chargement du modèle Claire trop long');if(session!==this.session)throw new Error('Démarrage Claire annulé');if(!nativePose.length)throw new Error('Pose native Claire absente');this.nativePose=nativePose;this.poseStabilizer=()=>restoreNativePose(this.nativePose);
      this.stage='first-frame';await nextFrame();if(this.head.isRunning)this.head.animate(1000/modelFPS);this.poseStabilizer();let fit=this.threeStage.fit(this.head.armature,this.config.cameraView||'portrait');const upright=Number(fit.landmarks?.head?.[1])>Number(fit.landmarks?.chest?.[1])+.08;if(fit.view==='portrait'&&!upright)throw new Error('Pose Claire non verticale après stabilisation');this.frameDiagnostic={...this.threeStage.sample(),fit,upright,nativePoseBones:this.nativePose.length,renderer:'three-external'};if(!this.frameDiagnostic.ok){fit=this.threeStage.fit(this.head.armature,'upper');this.frameDiagnostic={...this.threeStage.sample(),fit,upright,fallbackView:'upper',nativePoseBones:this.nativePose.length,renderer:'three-external'};}if(!this.frameDiagnostic.ok)throw new Error(`Rendu 3D transparent (${this.frameDiagnostic.render?.calls||0} appels, ${this.frameDiagnostic.render?.triangles||0} triangles)`);
      this.stage='active';this.active=true;this.startedAt=Date.now();this.threeStage.start(this.head,{afterAnimate:this.poseStabilizer});this.host.hidden=false;this.host.style.visibility='';this.host.removeAttribute('aria-hidden');this.portrait?.setAttribute?.('aria-hidden','true');this.bus.emit('pg23.avatar.engine.active',{engine:this.id,identity:'Claire'});void this.installAudio(session);return{active:true,audioPending:true};
    }catch(error){this.lastError=`${this.stage}: ${String(error?.message||error)}`;console.error('[PocketGuide Claire 3D]',this.lastError);if(this.host)this.host.dataset.avatarError=this.lastError;await this.destroy();throw new Error(this.lastError);}
  }
  setPresence(state){if(!this.head)return;const mood=state==='arrived'?'happy':state==='error'?'sad':'neutral';try{this.head.setMood?.(mood);}catch{}}
  interrupt(){try{this.headAudio?.stop?.();}catch{}try{this.head?.stopSpeaking?.();}catch{}}
  diagnostic(){return{id:this.id,identity:'Claire',active:this.active,ready:Boolean(this.config?.ready),stage:this.stage,audioReady:this.audioReady,nativePoseBones:this.nativePose.length,capabilities:this.capabilities(),startedAt:this.startedAt||null,frame:this.frameDiagnostic,error:this.lastError||null,audioError:this.audioError||null};}
  async destroy(){this.session+=1;this.active=false;this.audioReady=false;if(this.headAudio){this.audioBus?.untap?.(this.headAudio);try{this.headAudio.stop();this.headAudio.disconnect();}catch{}}this.headAudio=null;try{this.threeStage?.stop?.();}catch{}try{this.head?.stop?.();}catch{}try{this.head?.dispose?.();}catch{}this.head=null;this.nativePose=[];this.poseStabilizer=null;try{this.threeStage?.dispose?.();}catch{}this.threeStage=null;if(this.host){this.host.hidden=true;this.host.style.visibility='';this.host.setAttribute('aria-hidden','true');this.host.replaceChildren();}if(this.portrait){this.portrait.hidden=false;this.portrait.removeAttribute('aria-hidden');}}
}

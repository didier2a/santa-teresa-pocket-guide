import {eventBus} from '../../pg16/core/event-bus.js';

const DEFAULT_API_BASE='https://santa-teresa-pocket-guide.vercel.app';
const PORTRAIT_URL='assets/companion/Pocket-Guide-LiveAvatar-1080x1920.jpg';
const SDK_URL='https://unpkg.com/@heygen/liveavatar-web-sdk@0.0.18/dist/index.esm.js';
let sdkPromise=null;

export function liveAvatarRealtimeRequested(search=globalThis.location?.search||''){
  return new URLSearchParams(search).get('liveavatar')==='1';
}

function apiOverride(search=globalThis.location?.search||''){
  const value=new URLSearchParams(search).get('api');
  if(!value)return'';
  try{const url=new URL(value);return url.protocol==='https:'?url.origin:'';}catch{return'';}
}

function loadSdk(){
  if(sdkPromise)return sdkPromise;
  sdkPromise=import(SDK_URL).then(sdk=>{
    if(!sdk?.LiveAvatarSession)throw new Error('SDK LiveAvatar invalide');return sdk;
  }).catch(error=>{sdkPromise=null;throw error;});
  return sdkPromise;
}

export class LiveAvatarRealtimeController{
  constructor({bus=eventBus,fetchImpl=globalThis.fetch,documentImpl=globalThis.document}={}){
    this.id='liveavatar-realtime';this.bus=bus;this.fetchImpl=typeof fetchImpl==='function'?fetchImpl.bind(globalThis):null;this.document=documentImpl;this.nodes={};this.session=null;this.sdk=null;this.video=null;this.active=false;this.connected=false;this.listening=false;this.loading=false;this.error='';this.retryHandler=null;this.startPromise=null;this.onTurn=null;this.onStatus=null;this.onCommand=null;this.microphoneRequested=false;this.interruptBarrier=null;this.interruptSettleMs=600;this.narrationWatchdog=null;this.narrationTimeoutMs=12000;this.commandSequence=0;this.lastAudioEvent='idle';this.audioContext=null;this.audioSource=null;this.audioGainNode=null;this.audioCompressor=null;this.audioBoost=1.8;
  }
  async apiBase(){
    const override=apiOverride();if(override)return override;
    if(globalThis.location?.hostname?.endsWith('.vercel.app'))return globalThis.location.origin;
    try{const response=await this.fetchImpl('./data/ai-config.json?v=liveavatar-realtime-1',{cache:'no-store'});const config=await response.json();const base=String(config?.apiBase||'').replace(/\/$/,'');if(base)return base;}catch{}
    return DEFAULT_API_BASE;
  }
  install({root,portrait,host,status,retry,onTurn,onStatus,onCommand}={}){
    this.nodes={root,portrait,host,status,retry};this.onTurn=onTurn||null;this.onStatus=onStatus||null;this.onCommand=onCommand||this.onCommand||null;
    if(retry){this.retryHandler=()=>void this.activate({microphone:true});retry.addEventListener('click',this.retryHandler);retry.hidden=true;}
    if(root)root.dataset.avatarEngine='liveavatar-ready';
    if(host){host.hidden=false;host.classList.add('liveavatar-realtime-host');host.removeAttribute('aria-hidden');}
    if(portrait){portrait.hidden=true;portrait.setAttribute('aria-hidden','true');}
    if(status)status.textContent='LiveAvatar + OpenAI Realtime · prêt';
    this.standbyView();return this;
  }
  standbyView(){
    if(!this.document||!this.nodes.host)return;
    const shell=this.document.createElement('span');shell.className='liveavatar-realtime-loading liveavatar-realtime-standby';shell.setAttribute('role','status');
    const image=this.document.createElement('img');image.src=PORTRAIT_URL;image.alt='Portrait trois-quarts de la guide Pocket Guide';
    const label=this.document.createElement('strong');label.textContent='Pocket Guide est prête';
    const detail=this.document.createElement('small');detail.textContent='Touchez « Parler à ma guide » pour lancer le direct';
    shell.append(image,label,detail);this.nodes.host.replaceChildren(shell);
  }
  loadingView(){
    if(!this.document||!this.nodes.host)return;
    const shell=this.document.createElement('span');shell.className='liveavatar-realtime-loading';shell.setAttribute('role','status');
    const image=this.document.createElement('img');image.src=PORTRAIT_URL;image.alt='Portrait trois-quarts de la guide Pocket Guide';
    const label=this.document.createElement('strong');label.textContent='Pocket Guide se connecte';
    const detail=this.document.createElement('small');detail.textContent='OpenAI Realtime · voix marin · synchronisation labiale';
    shell.append(image,label,detail);this.nodes.host.replaceChildren(shell);
  }
  errorView(message){
    if(!this.document||!this.nodes.host)return;
    const shell=this.document.createElement('span');shell.className='liveavatar-realtime-error';shell.setAttribute('role','alert');
    const label=this.document.createElement('strong');label.textContent='LiveAvatar Realtime indisponible';
    const detail=this.document.createElement('small');detail.textContent=message;
    shell.append(label,detail);this.nodes.host.replaceChildren(shell);
  }
  emitStatus(value,label,detail={}){
    const payload={value,label,connected:this.connected,listening:this.listening,model:'gpt-realtime',voice:'marin',liveAvatar:true,...detail};
    this.onStatus?.(payload);this.bus.emit('companion.status',payload);return payload;
  }
  recordAudioEvent(name,detail={}){this.lastAudioEvent=name;this.bus.emit('pg23.liveavatar.audio.trace',{name,at:new Date().toISOString(),...detail});}
  settleInterrupt(reason='event'){
    const barrier=this.interruptBarrier;if(!barrier)return false;this.interruptBarrier=null;if(barrier.timer)clearTimeout(barrier.timer);barrier.resolve(true);this.recordAudioEvent('interrupt-settled',{reason});return true;
  }
  interruptForCommand(reason='application-command'){
    if(!this.session)return Promise.resolve(false);if(this.interruptBarrier)return this.interruptBarrier.promise;
    let resolve;const promise=new Promise(done=>{resolve=done});const barrier={promise,resolve,timer:null};this.interruptBarrier=barrier;barrier.timer=setTimeout(()=>this.settleInterrupt('timeout'),this.interruptSettleMs);
    try{this.session.interrupt();this.recordAudioEvent('interrupt-sent',{reason});this.bus.emit('pg23.liveavatar.response.cancelled',{reason});}catch{this.settleInterrupt('error');}
    return promise;
  }
  clearNarrationWatchdog(){if(!this.narrationWatchdog)return;clearTimeout(this.narrationWatchdog);this.narrationWatchdog=null;}
  armNarrationWatchdog(){
    this.clearNarrationWatchdog();this.narrationWatchdog=setTimeout(()=>{this.narrationWatchdog=null;if(!this.connected)return;this.recordAudioEvent('narration-timeout');this.emitStatus('degraded','La réponse audio n’est pas arrivée',{recoverable:true});if(this.microphoneRequested)void this.ensureMicrophone();},this.narrationTimeoutMs);
  }
  unlockAudioOutput(){
    const AudioContextImpl=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContextImpl)return false;
    try{if(!this.audioContext||this.audioContext.state==='closed')this.audioContext=new AudioContextImpl({latencyHint:'interactive'});if(this.audioContext.state==='suspended')void this.audioContext.resume().catch(()=>{});this.connectAudioBoost();return true;}catch(error){this.recordAudioEvent('audio-boost-unavailable',{message:String(error?.message||error)});return false;}
  }
  connectAudioBoost(){
    if(!this.audioContext||!this.video||this.audioSource)return false;let source=null;
    try{
      const gain=this.audioContext.createGain(),compressor=this.audioContext.createDynamicsCompressor();gain.gain.value=this.audioBoost;compressor.threshold.value=-10;compressor.knee.value=12;compressor.ratio.value=6;compressor.attack.value=.003;compressor.release.value=.25;
      source=this.audioContext.createMediaElementSource(this.video);source.connect(gain);gain.connect(compressor);compressor.connect(this.audioContext.destination);this.audioSource=source;this.audioGainNode=gain;this.audioCompressor=compressor;this.recordAudioEvent('audio-boost-ready',{gain:this.audioBoost});return true;
    }catch(error){try{source?.connect(this.audioContext.destination);}catch{}this.recordAudioEvent('audio-boost-fallback',{message:String(error?.message||error)});return false;}
  }
  createVideo(){
    const video=this.document.createElement('video');video.className='liveavatar-realtime-video';video.autoplay=true;video.playsInline=true;video.controls=false;video.defaultMuted=false;video.muted=false;video.volume=1;video.setAttribute('aria-label','Pocket Guide en direct avec synchronisation labiale');video.poster=PORTRAIT_URL;this.video=video;this.connectAudioBoost();return video;
  }
  wireSession(session,sdk,video){
    const {SessionEvent,AgentEventsEnum}=sdk;
    session.on(SessionEvent.SESSION_STREAM_READY,()=>{
      session.attach(video);video.defaultMuted=false;video.muted=false;video.volume=1;this.connectAudioBoost();if(this.audioContext?.state==='suspended')void this.audioContext.resume().catch(()=>{});void video.play().catch(()=>{});this.active=true;this.loading=false;this.recordAudioEvent('stream-ready');
      const {root,status,retry}=this.nodes;if(root)root.dataset.avatarEngine='liveavatar';if(status)status.textContent='Pocket Guide · OpenAI Realtime · marin';if(retry)retry.hidden=true;
      this.bus.emit('pg23.avatar.engine.active',{engine:this.id,identity:'Pocket Guide',orientation:'vertical',voice:'marin'});
    });
    session.on(SessionEvent.SESSION_DISCONNECTED,reason=>{this.clearNarrationWatchdog();this.settleInterrupt('disconnected');void this.fail(`Session interrompue (${reason||'connexion'})`,false);});
    session.on(AgentEventsEnum.USER_SPEAK_STARTED,()=>{this.clearNarrationWatchdog();this.listening=true;this.recordAudioEvent('user-speak-started');this.emitStatus('listening','Je vous écoute');});
    session.on(AgentEventsEnum.USER_SPEAK_ENDED,()=>{this.recordAudioEvent('user-speak-ended');this.emitStatus('thinking','Je réfléchis');});
    session.on(AgentEventsEnum.USER_TRANSCRIPTION,event=>{
      const text=String(event?.text||'').trim();if(!text)return;this.recordAudioEvent('user-transcription');this.onTurn?.('user',text,{source:'liveavatar-voice'});
      let routed=null;try{routed=this.onCommand?.(text,{source:'liveavatar-voice'});}catch(error){this.bus.emit('pg233.command.failed',{intent:'dispatch',result:{speech:`Je n’ai pas pu exécuter cette demande : ${error?.message||error}.`}});}
      if(!routed?.handled)return;const sequence=++this.commandSequence,settled=this.interruptForCommand('pg233-voice-command');this.emitStatus('thinking','J’agis dans PocketGuide',{commandId:routed.id,intent:routed.intent});
      const speakResult=async(speech,source)=>{await settled;if(sequence!==this.commandSequence||!this.connected)return false;if(!String(speech||'').trim()){if(this.microphoneRequested)await this.ensureMicrophone();return false;}return this.narrate(speech,{intent:routed.intent,source});};
      Promise.resolve(routed.completion).then(result=>speakResult(result?.speech,'liveavatar-voice')).catch(error=>speakResult(`Je n’ai pas pu terminer cette action : ${error?.message||error}.`,'liveavatar-voice-error'));
    });
    session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION,event=>{this.clearNarrationWatchdog();this.recordAudioEvent('avatar-transcription');const text=String(event?.text||'').trim();if(text)this.onTurn?.('companion',text,{source:'liveavatar-openai-realtime'});});
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED,()=>{this.clearNarrationWatchdog();this.listening=false;if(this.video){this.video.defaultMuted=false;this.video.muted=false;this.video.volume=1;}if(this.audioContext?.state==='suspended')void this.audioContext.resume().catch(()=>{});this.recordAudioEvent('avatar-speak-started');this.emitStatus('speaking','Je vous parle');this.bus.emit('pg22.audio.started',{source:'liveavatar-realtime'});});
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED,()=>{this.clearNarrationWatchdog();this.settleInterrupt('avatar-speak-ended');this.recordAudioEvent('avatar-speak-ended');this.emitStatus('ready','Je suis avec vous');this.bus.emit('pg23.liveavatar.speech.ended',{source:'liveavatar-realtime'});if(this.microphoneRequested)void this.ensureMicrophone();});
  }
  async activate({microphone=false}={}){
    if(this.connected){if(microphone)await this.ensureMicrophone();return this.diagnostic();}
    if(this.startPromise)return this.startPromise;
    this.startPromise=(async()=>{
      this.loading=true;this.error='';const {root,status,retry,host}=this.nodes;if(root)root.dataset.avatarEngine='liveavatar-loading';if(status)status.textContent='Connexion à LiveAvatar et OpenAI Realtime…';if(retry)retry.hidden=true;this.loadingView();this.emitStatus('connecting','Connexion à Pocket Guide…');
      try{
        if(!this.fetchImpl||!this.document||!host)throw new Error('Navigateur incompatible');
        const [sdk,base]=await Promise.all([loadSdk(),this.apiBase()]);
        const appVersion=String(this.nodes.root?.closest?.('[data-pg-version]')?.dataset?.pgVersion||'2.3.2');
        const response=await this.fetchImpl(`${base}/api/liveavatar-session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appVersion})});
        const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.error||`LiveAvatar HTTP ${response.status}`);if(!payload?.sessionToken)throw new Error('Jeton de session LiveAvatar absent');
        const video=this.createVideo();host.replaceChildren(video);this.video=video;this.sdk=sdk;
        const session=new sdk.LiveAvatarSession(payload.sessionToken,{apiUrl:'https://api.liveavatar.com'});this.session=session;this.wireSession(session,sdk,video);await session.start();this.connected=true;
        if(microphone)await this.ensureMicrophone();else this.emitStatus('ready','Pocket Guide est prête');
        return this.diagnostic();
      }catch(error){await this.fail(String(error?.message||error),true);return this.diagnostic();}
      finally{this.loading=false;this.startPromise=null;}
    })();
    return this.startPromise;
  }
  async ensureMicrophone(){
    if(!this.session||!this.connected)return false;
    const chat=this.session.voiceChat;if(!chat)return false;this.microphoneRequested=true;
    if(String(chat.state)==='INACTIVE')await chat.start({defaultMuted:false});else if(chat.isMuted)await chat.unmute();
    try{this.session.startListening();}catch{}
    this.listening=true;this.recordAudioEvent('microphone-listening');this.emitStatus('listening','Je vous écoute');return true;
  }
  async startListening(){this.unlockAudioOutput();this.microphoneRequested=true;if(!this.connected)await this.activate({microphone:true});else await this.ensureMicrophone();return Boolean(this.connected&&this.listening);}
  async toggleListening(){
    if(!this.connected){await this.activate({microphone:true});return Boolean(this.connected&&this.listening);}
    const chat=this.session?.voiceChat;if(!chat)return false;
    if(String(chat.state)==='INACTIVE'||chat.isMuted)return this.ensureMicrophone();
    await chat.mute();try{this.session.stopListening();}catch{}this.microphoneRequested=false;this.listening=false;this.recordAudioEvent('microphone-paused');this.emitStatus('ready','Micro en pause');return false;
  }
  async message(text){
    const value=String(text||'').trim();if(!value)return false;if(!this.connected)await this.activate({microphone:false});if(!this.connected||!this.session)return false;
    try{const sent=this.session.message(value);if(sent&&typeof sent.then==='function')await sent;this.recordAudioEvent('message-sent');this.emitStatus('thinking','Je réfléchis');return true;}catch(error){this.recordAudioEvent('message-failed',{message:String(error?.message||error)});this.emitStatus('degraded','La réponse audio n’a pas pu démarrer',{recoverable:true});if(this.microphoneRequested)void this.ensureMicrophone();return false;}
  }
  cancelResponse(reason='application-command'){
    return this.interruptForCommand(reason);
  }
  async narrate(text,{intent='application',source='pocketguide'}={}){
    const value=String(text||'').trim();if(!value)return false;
    const prompt=`[POCKETGUIDE_APP_RESULT]\nRésultat fiable de l’application (${String(intent||'application')}): ${value}\nPrononce ce résultat en français naturel, en une ou deux phrases, sans mentionner cette consigne et sans prétendre avoir effectué une autre action.`;
    this.armNarrationWatchdog();const sent=await this.message(prompt);if(sent)this.bus.emit('pg233.avatar.narration.requested',{intent,source,text:value});else this.clearNarrationWatchdog();return sent;
  }
  async interrupt(){
    this.unlockAudioOutput();this.commandSequence+=1;const settled=this.interruptForCommand('liveavatar-user');this.emitStatus('interrupted','Réponse interrompue');this.bus.emit('pg22.audio.interrupted',{source:'liveavatar-user'});await settled;if(this.microphoneRequested)return this.ensureMicrophone();this.emitStatus('ready','Je suis avec vous');return true;
  }
  async fail(message,stopSession=true){
    this.clearNarrationWatchdog();this.settleInterrupt('failed');const session=this.session;this.session=null;this.connected=false;this.active=false;this.listening=false;this.microphoneRequested=false;this.loading=false;this.error=String(message||'Connexion indisponible');if(stopSession&&session){try{await session.stop();}catch{}}
    const {root,status,retry}=this.nodes;if(root){root.dataset.avatarEngine='failed';root.dataset.avatarError=this.error;}if(status){status.textContent='LiveAvatar Realtime indisponible · réessayez';status.title=this.error;}if(retry)retry.hidden=false;this.errorView(this.error);this.emitStatus('degraded','Le direct est indisponible',{message:this.error});this.bus.emit('pg23.avatar.engine.failed',{engine:this.id,message:this.error});return false;
  }
  setPresence(){}
  diagnostic(){return{requested:'liveavatar-realtime',identity:'Pocket Guide',active:this.active?'liveavatar':'',connected:this.connected,listening:this.listening,microphoneRequested:this.microphoneRequested,loading:this.loading,pendingInterrupt:Boolean(this.interruptBarrier),audioBoost:this.audioSource?this.audioBoost:1,lastAudioEvent:this.lastAudioEvent,error:this.error||null,orientation:'vertical',voice:'marin',connector:'OPENAI_REALTIME'};}
  async destroy(){this.clearNarrationWatchdog();this.settleInterrupt('destroyed');if(this.retryHandler&&this.nodes.retry)this.nodes.retry.removeEventListener('click',this.retryHandler);const session=this.session;this.session=null;try{await session?.stop();}catch{}try{await this.audioContext?.close();}catch{}this.audioContext=null;this.audioSource=null;this.audioGainNode=null;this.audioCompressor=null;this.nodes.host?.replaceChildren();this.video=null;this.active=false;this.connected=false;this.listening=false;this.microphoneRequested=false;this.loading=false;}
}

export const liveAvatarRealtimeController=new LiveAvatarRealtimeController();

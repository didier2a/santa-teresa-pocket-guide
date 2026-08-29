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
    this.id='liveavatar-realtime';this.bus=bus;this.fetchImpl=typeof fetchImpl==='function'?fetchImpl.bind(globalThis):null;this.document=documentImpl;this.nodes={};this.session=null;this.sdk=null;this.video=null;this.active=false;this.connected=false;this.listening=false;this.loading=false;this.error='';this.retryHandler=null;this.startPromise=null;this.onTurn=null;this.onStatus=null;this.onCommand=null;
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
  createVideo(){
    const video=this.document.createElement('video');video.className='liveavatar-realtime-video';video.autoplay=true;video.playsInline=true;video.controls=false;video.setAttribute('aria-label','Pocket Guide en direct avec synchronisation labiale');video.poster=PORTRAIT_URL;return video;
  }
  wireSession(session,sdk,video){
    const {SessionEvent,AgentEventsEnum}=sdk;
    session.on(SessionEvent.SESSION_STREAM_READY,()=>{
      session.attach(video);void video.play().catch(()=>{});this.active=true;this.loading=false;
      const {root,status,retry}=this.nodes;if(root)root.dataset.avatarEngine='liveavatar';if(status)status.textContent='Pocket Guide · OpenAI Realtime · marin';if(retry)retry.hidden=true;
      this.bus.emit('pg23.avatar.engine.active',{engine:this.id,identity:'Pocket Guide',orientation:'vertical',voice:'marin'});
    });
    session.on(SessionEvent.SESSION_DISCONNECTED,reason=>this.fail(`Session interrompue (${reason||'connexion'})`,false));
    session.on(AgentEventsEnum.USER_SPEAK_STARTED,()=>{this.listening=true;this.emitStatus('listening','Je vous écoute');});
    session.on(AgentEventsEnum.USER_SPEAK_ENDED,()=>this.emitStatus('thinking','Je réfléchis'));
    session.on(AgentEventsEnum.USER_TRANSCRIPTION,event=>{
      const text=String(event?.text||'').trim();if(!text)return;this.onTurn?.('user',text,{source:'liveavatar-voice'});
      let routed=null;try{routed=this.onCommand?.(text,{source:'liveavatar-voice'});}catch(error){this.bus.emit('pg233.command.failed',{intent:'dispatch',result:{speech:`Je n’ai pas pu exécuter cette demande : ${error?.message||error}.`}});}
      if(!routed?.handled)return;this.cancelResponse('pg233-voice-command');this.emitStatus('thinking','J’agis dans PocketGuide',{commandId:routed.id,intent:routed.intent});
      Promise.resolve(routed.completion).then(result=>this.narrate(result?.speech,{intent:routed.intent,source:'liveavatar-voice'})).catch(error=>this.narrate(`Je n’ai pas pu terminer cette action : ${error?.message||error}.`,{intent:routed.intent,source:'liveavatar-voice-error'}));
    });
    session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION,event=>{const text=String(event?.text||'').trim();if(text)this.onTurn?.('companion',text,{source:'liveavatar-openai-realtime'});});
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED,()=>{this.listening=false;this.emitStatus('speaking','Je vous parle');this.bus.emit('pg22.audio.started',{source:'liveavatar-realtime'});});
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED,()=>{this.emitStatus('ready','Je suis avec vous');this.bus.emit('pg23.liveavatar.speech.ended',{source:'liveavatar-realtime'});});
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
    const chat=this.session.voiceChat;if(!chat)return false;
    if(String(chat.state)==='INACTIVE')await chat.start({defaultMuted:false});else if(chat.isMuted)await chat.unmute();
    try{this.session.startListening();}catch{}
    this.listening=true;this.emitStatus('listening','Je vous écoute');return true;
  }
  async toggleListening(){
    if(!this.connected){await this.activate({microphone:true});return Boolean(this.connected&&this.listening);}
    const chat=this.session?.voiceChat;if(!chat)return false;
    if(String(chat.state)==='INACTIVE'||chat.isMuted)return this.ensureMicrophone();
    await chat.mute();try{this.session.stopListening();}catch{}this.listening=false;this.emitStatus('ready','Micro en pause');return false;
  }
  async message(text){
    const value=String(text||'').trim();if(!value)return false;if(!this.connected)await this.activate({microphone:false});if(!this.connected||!this.session)return false;
    this.session.message(value);this.emitStatus('thinking','Je réfléchis');return true;
  }
  cancelResponse(reason='application-command'){
    try{this.session?.interrupt();this.bus.emit('pg23.liveavatar.response.cancelled',{reason});return true;}catch{return false;}
  }
  async narrate(text,{intent='application',source='pocketguide'}={}){
    const value=String(text||'').trim();if(!value)return false;
    const prompt=`[POCKETGUIDE_APP_RESULT]\nRésultat fiable de l’application (${String(intent||'application')}): ${value}\nPrononce ce résultat en français naturel, en une ou deux phrases, sans mentionner cette consigne et sans prétendre avoir effectué une autre action.`;
    const sent=await this.message(prompt);if(sent)this.bus.emit('pg233.avatar.narration.requested',{intent,source,text:value});return sent;
  }
  interrupt(){
    try{this.session?.interrupt();}catch{}this.emitStatus('interrupted','Réponse interrompue');this.bus.emit('pg22.audio.interrupted',{source:'liveavatar-user'});setTimeout(()=>this.emitStatus(this.listening?'listening':'ready',this.listening?'Je vous écoute':'Je suis avec vous'),120);
  }
  async fail(message,stopSession=true){
    const session=this.session;this.session=null;this.connected=false;this.active=false;this.listening=false;this.loading=false;this.error=String(message||'Connexion indisponible');if(stopSession&&session){try{await session.stop();}catch{}}
    const {root,status,retry}=this.nodes;if(root){root.dataset.avatarEngine='failed';root.dataset.avatarError=this.error;}if(status){status.textContent='LiveAvatar Realtime indisponible · réessayez';status.title=this.error;}if(retry)retry.hidden=false;this.errorView(this.error);this.emitStatus('degraded','Le direct est indisponible',{message:this.error});this.bus.emit('pg23.avatar.engine.failed',{engine:this.id,message:this.error});return false;
  }
  setPresence(){}
  diagnostic(){return{requested:'liveavatar-realtime',identity:'Pocket Guide',active:this.active?'liveavatar':'',connected:this.connected,listening:this.listening,loading:this.loading,error:this.error||null,orientation:'vertical',voice:'marin',connector:'OPENAI_REALTIME'};}
  async destroy(){if(this.retryHandler&&this.nodes.retry)this.nodes.retry.removeEventListener('click',this.retryHandler);const session=this.session;this.session=null;try{await session?.stop();}catch{}this.nodes.host?.replaceChildren();this.active=false;this.connected=false;this.listening=false;this.loading=false;}
}

export const liveAvatarRealtimeController=new LiveAvatarRealtimeController();

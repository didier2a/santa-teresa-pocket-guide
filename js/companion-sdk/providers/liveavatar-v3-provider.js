const DEFAULT_API_BASE='https://santa-teresa-pocket-guide.vercel.app';
const PORTRAIT_URL='assets/companion/Pocket-Guide-LiveAvatar-1080x1920.jpg';
const SDK_URL='https://unpkg.com/@heygen/liveavatar-web-sdk@0.0.18/dist/index.esm.js';

let sharedSdkPromise=null;

function defaultSdkLoader(){
  if(sharedSdkPromise)return sharedSdkPromise;
  sharedSdkPromise=import(SDK_URL).then(sdk=>{
    if(!sdk?.LiveAvatarSession)throw new Error('SDK LiveAvatar invalide');
    return sdk;
  }).catch(error=>{
    sharedSdkPromise=null;
    throw error;
  });
  return sharedSdkPromise;
}

function safeText(value){return String(value||'').trim();}

export class LiveAvatarV3Provider{
  constructor({
    bus=null,
    fetchImpl=globalThis.fetch,
    documentImpl=globalThis.document,
    locationImpl=globalThis.location,
    sdkLoader=defaultSdkLoader,
    sessionEndpoint='/api/companion-session',
    clientVersion='4.0.0-preview.6',
    appVersion='2.3.3'
  }={}){
    this.id='liveavatar-v3';
    this.bus=bus;
    this.fetchImpl=typeof fetchImpl==='function'?fetchImpl.bind(globalThis):null;
    this.document=documentImpl;
    this.location=locationImpl;
    this.sdkLoader=sdkLoader;
    this.sessionEndpoint=sessionEndpoint;
    this.clientVersion=clientVersion;
    this.appVersion=safeText(appVersion)||'2.3.3';
    this.nodes={};
    this.session=null;
    this.sdk=null;
    this.video=null;
    this.active=false;
    this.connected=false;
    this.listening=false;
    this.microphoneRequested=false;
    this.loading=false;
    this.error='';
    this.startPromise=null;
    this.retryHandler=null;
    this.onTurn=null;
    this.onStatus=null;
    this.onCommand=null;
    this.lastMediaEvent='idle';
  }

  async apiBase(){
    if(this.location?.hostname?.endsWith('.vercel.app'))return this.location.origin;
    try{
      const response=await this.fetchImpl('./data/ai-config.json?v=companion-sdk-v1',{cache:'no-store'});
      const config=await response.json();
      const base=safeText(config?.apiBase).replace(/\/$/,'');
      if(base)return base;
    }catch{}
    return DEFAULT_API_BASE;
  }

  install({root,portrait,host,status,retry,onTurn,onStatus,onCommand}={}){
    this.nodes={root,portrait,host,status,retry};
    this.onTurn=onTurn||null;
    this.onStatus=onStatus||null;
    this.onCommand=onCommand||null;
    if(retry){
      this.retryHandler=()=>void this.startListening();
      retry.addEventListener('click',this.retryHandler);
      retry.hidden=true;
    }
    if(root)root.dataset.avatarEngine='liveavatar-v3-ready';
    if(host){host.hidden=false;host.classList.add('liveavatar-realtime-host');host.removeAttribute('aria-hidden');}
    if(portrait){portrait.hidden=true;portrait.setAttribute('aria-hidden','true');}
    if(status)status.textContent='Companion SDK · moteur LiveAvatar V3 prêt';
    this.renderStandby();
    return this;
  }

  renderStandby(){
    if(!this.document||!this.nodes.host)return;
    const shell=this.document.createElement('span');
    shell.className='liveavatar-realtime-loading liveavatar-realtime-standby';
    shell.setAttribute('role','status');
    const image=this.document.createElement('img');image.src=PORTRAIT_URL;image.alt='Portrait de la guide Pocket Guide';
    const label=this.document.createElement('strong');label.textContent='Pocket Guide est prête';
    const detail=this.document.createElement('small');detail.textContent='Moteur conversationnel V3 éprouvé';
    shell.append(image,label,detail);
    this.nodes.host.replaceChildren(shell);
  }

  renderLoading(){
    if(!this.document||!this.nodes.host)return;
    const shell=this.document.createElement('span');
    shell.className='liveavatar-realtime-loading';
    shell.setAttribute('role','status');
    const image=this.document.createElement('img');image.src=PORTRAIT_URL;image.alt='Portrait de la guide Pocket Guide';
    const label=this.document.createElement('strong');label.textContent='Pocket Guide se connecte';
    const detail=this.document.createElement('small');detail.textContent='LiveAvatar · OpenAI Realtime · voix marin';
    shell.append(image,label,detail);
    this.nodes.host.replaceChildren(shell);
  }

  renderError(message){
    if(!this.document||!this.nodes.host)return;
    const shell=this.document.createElement('span');
    shell.className='liveavatar-realtime-error';
    shell.setAttribute('role','alert');
    const label=this.document.createElement('strong');label.textContent='Companion indisponible';
    const detail=this.document.createElement('small');detail.textContent=message;
    shell.append(label,detail);
    this.nodes.host.replaceChildren(shell);
  }

  emitStatus(value,label,detail={}){
    const payload={
      value,label,
      connected:this.connected,
      listening:this.listening,
      provider:this.id,
      model:'gpt-realtime',
      voice:'marin',
      liveAvatar:true,
      ...detail
    };
    this.onStatus?.(payload);
    this.bus?.emit('companion.status',payload);
    return payload;
  }

  trace(name,detail={}){
    this.lastMediaEvent=name;
    this.bus?.emit('companion.media.trace',{name,provider:this.id,at:new Date().toISOString(),...detail});
  }

  createVideo(){
    const video=this.document.createElement('video');
    video.className='liveavatar-realtime-video';
    video.autoplay=true;
    video.playsInline=true;
    video.controls=false;
    video.defaultMuted=false;
    video.muted=false;
    video.volume=1;
    video.setAttribute('aria-label','Pocket Guide en direct avec synchronisation labiale');
    video.poster=PORTRAIT_URL;
    return video;
  }

  observeCommand(text,meta){
    let routed=null;
    try{routed=this.onCommand?.(text,meta);}catch(error){
      this.bus?.emit('companion.capability.failed',{provider:this.id,error:String(error?.message||error)});
      return;
    }
    if(!routed?.handled)return;
    this.bus?.emit('companion.capability.accepted',{provider:this.id,id:routed.id,intent:routed.intent});
    Promise.resolve(routed.completion).then(result=>{
      this.bus?.emit('companion.capability.completed',{provider:this.id,id:routed.id,intent:routed.intent,result});
    }).catch(error=>{
      this.bus?.emit('companion.capability.failed',{provider:this.id,id:routed.id,intent:routed.intent,error:String(error?.message||error)});
    });
  }

  wireSession(session,sdk,video){
    const {SessionEvent,AgentEventsEnum}=sdk;
    session.on(SessionEvent.SESSION_STREAM_READY,()=>{
      session.attach(video);
      video.defaultMuted=false;video.muted=false;video.volume=1;
      void video.play().catch(()=>{});
      this.active=true;this.loading=false;
      this.trace('stream-ready');
      const {root,status,retry}=this.nodes;
      if(root)root.dataset.avatarEngine='liveavatar-v3';
      if(status)status.textContent='Pocket Guide · moteur V3 · OpenAI Realtime';
      if(retry)retry.hidden=true;
      this.bus?.emit('companion.provider.active',{provider:this.id,orientation:'vertical',voice:'marin'});
    });
    session.on(SessionEvent.SESSION_DISCONNECTED,reason=>void this.fail(`Session interrompue (${reason||'connexion'})`,false));
    session.on(AgentEventsEnum.USER_SPEAK_STARTED,()=>{
      this.listening=true;this.trace('user-speak-started');this.emitStatus('listening','Je vous écoute');
    });
    session.on(AgentEventsEnum.USER_SPEAK_ENDED,()=>{
      this.trace('user-speak-ended');this.emitStatus('thinking','Je réfléchis');
    });
    session.on(AgentEventsEnum.USER_TRANSCRIPTION,event=>{
      const text=safeText(event?.text);if(!text)return;
      this.trace('user-transcription');
      const meta={source:'liveavatar-voice',provider:this.id};
      this.onTurn?.('user',text,meta);
      this.observeCommand(text,meta);
    });
    session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION,event=>{
      const text=safeText(event?.text);if(!text)return;
      this.trace('avatar-transcription');
      this.onTurn?.('companion',text,{source:'liveavatar-openai-realtime',provider:this.id});
    });
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED,()=>{
      this.listening=false;
      video.defaultMuted=false;video.muted=false;video.volume=1;
      this.trace('avatar-speak-started');
      this.emitStatus('speaking','Je vous parle');
      this.bus?.emit('pg22.audio.started',{source:'liveavatar-v3'});
    });
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED,()=>{
      this.trace('avatar-speak-ended');
      this.emitStatus('ready','Je suis avec vous');
      this.bus?.emit('pg23.liveavatar.speech.ended',{source:'liveavatar-v3'});
      if(this.microphoneRequested)void this.ensureMicrophone();
    });
  }

  async activate({microphone=false}={}){
    if(this.connected){if(microphone)await this.ensureMicrophone();return this.diagnostic();}
    if(this.startPromise)return this.startPromise;
    this.startPromise=(async()=>{
      this.loading=true;this.error='';
      const {root,status,retry,host}=this.nodes;
      if(root)root.dataset.avatarEngine='liveavatar-v3-loading';
      if(status)status.textContent='Connexion au moteur Companion V3…';
      if(retry)retry.hidden=true;
      this.renderLoading();
      this.emitStatus('connecting','Connexion à Pocket Guide…');
      try{
        if(!this.fetchImpl||!this.document||!host)throw new Error('Navigateur incompatible');
        const [sdk,base]=await Promise.all([this.sdkLoader(),this.apiBase()]);
        const response=await this.fetchImpl(`${base}${this.sessionEndpoint}`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({appVersion:this.appVersion,clientVersion:this.clientVersion,engine:this.id})
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload?.error||`Companion HTTP ${response.status}`);
        if(!payload?.sessionToken)throw new Error('Jeton de session Companion absent');
        const video=this.createVideo();host.replaceChildren(video);
        this.video=video;this.sdk=sdk;
        const session=new sdk.LiveAvatarSession(payload.sessionToken,{apiUrl:'https://api.liveavatar.com'});
        this.session=session;
        this.wireSession(session,sdk,video);
        await session.start();
        this.connected=true;
        this.trace('session-started',{sessionId:safeText(payload.sessionId)});
        if(microphone)await this.ensureMicrophone();else this.emitStatus('ready','Pocket Guide est prête');
        return this.diagnostic();
      }catch(error){
        await this.fail(String(error?.message||error),true);
        return this.diagnostic();
      }finally{
        this.loading=false;this.startPromise=null;
      }
    })();
    return this.startPromise;
  }

  async ensureMicrophone(){
    if(!this.session||!this.connected)return false;
    const chat=this.session.voiceChat;if(!chat)return false;
    this.microphoneRequested=true;
    if(String(chat.state)==='INACTIVE')await chat.start({defaultMuted:false});
    else if(chat.isMuted)await chat.unmute();
    try{this.session.startListening();}catch{}
    this.listening=true;
    this.trace('microphone-listening');
    this.emitStatus('listening','Je vous écoute');
    return true;
  }

  async startListening(){
    this.microphoneRequested=true;
    if(this.video){this.video.defaultMuted=false;this.video.muted=false;this.video.volume=1;void this.video.play().catch(()=>{});}
    if(!this.connected)await this.activate({microphone:true});else await this.ensureMicrophone();
    return Boolean(this.connected&&this.listening);
  }

  async toggleListening(){
    if(!this.connected)return this.startListening();
    const chat=this.session?.voiceChat;if(!chat)return false;
    if(String(chat.state)==='INACTIVE'||chat.isMuted)return this.ensureMicrophone();
    await chat.mute();
    try{this.session.stopListening();}catch{}
    this.microphoneRequested=false;this.listening=false;
    this.trace('microphone-paused');
    this.emitStatus('ready','Micro en pause');
    return false;
  }

  async suspendMicrophone(){
    const resume=this.microphoneRequested;
    const chat=this.session?.voiceChat;
    if(chat&&String(chat.state)!=='INACTIVE'&&!chat.isMuted){try{await chat.mute();}catch{}}
    try{this.session?.stopListening?.();}catch{}
    this.microphoneRequested=false;this.listening=false;
    this.trace('microphone-suspended');this.emitStatus('ready','Micro réservé à la dictée');
    return resume;
  }

  async resumeMicrophone(shouldResume=true){
    if(!shouldResume)return false;
    this.microphoneRequested=true;
    return this.ensureMicrophone();
  }

  async interrupt(reason='user-action'){
    if(!this.session)return false;
    try{
      this.session.interrupt();
      this.trace('explicit-interrupt',{reason});
      this.emitStatus('interrupted','Réponse interrompue');
      this.bus?.emit('pg22.audio.interrupted',{source:'liveavatar-v3',reason});
      if(this.microphoneRequested)await this.ensureMicrophone();
      return true;
    }catch{return false;}
  }

  async narrateEvidence(evidence){
    this.bus?.emit('companion.narration.deferred',{
      provider:this.id,
      capabilityId:evidence?.capabilityId||null,
      reason:'native-conversation-protected'
    });
    return false;
  }

  async fail(message,stopSession=true){
    const session=this.session;
    this.session=null;this.connected=false;this.active=false;this.listening=false;this.microphoneRequested=false;this.loading=false;
    this.error=safeText(message)||'Connexion indisponible';
    if(stopSession&&session){try{await session.stop();}catch{}}
    const {root,status,retry}=this.nodes;
    if(root){root.dataset.avatarEngine='failed';root.dataset.avatarError=this.error;}
    if(status){status.textContent='Companion indisponible · réessayez';status.title=this.error;}
    if(retry)retry.hidden=false;
    this.renderError(this.error);
    this.emitStatus('degraded','Le direct est indisponible',{message:this.error});
    this.bus?.emit('companion.provider.failed',{provider:this.id,message:this.error});
    return false;
  }

  diagnostic(){
    return{
      provider:this.id,
      appVersion:this.appVersion,
      baseline:'v3-proven',
      active:this.active,
      connected:this.connected,
      listening:this.listening,
      microphoneRequested:this.microphoneRequested,
      loading:this.loading,
      nativeAudio:true,
      conversationOwner:'liveavatar-openai-realtime',
      applicationNarration:'deferred',
      lastMediaEvent:this.lastMediaEvent,
      error:this.error||null,
      orientation:'vertical',
      voice:'marin'
    };
  }

  async destroy(){
    if(this.retryHandler&&this.nodes.retry)this.nodes.retry.removeEventListener('click',this.retryHandler);
    const session=this.session;this.session=null;
    try{await session?.stop();}catch{}
    this.nodes.host?.replaceChildren();
    this.video=null;this.active=false;this.connected=false;this.listening=false;this.microphoneRequested=false;this.loading=false;
  }
}

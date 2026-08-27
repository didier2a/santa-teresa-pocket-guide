import {eventBus} from '../../pg16/core/event-bus.js';
import {ACTIVE_VISEMES,visemeForCharacter} from '../../pg22/avatar/avatar-runtime.js';

export const PORTRAIT_SOURCE=Object.freeze({width:820,height:852});
export const PRESENCE_STATES=Object.freeze(['ready','listening','thinking','speaking','presenting','walking','arrived','interrupted','degraded','error']);

export function fittedPortraitRect(containerWidth,containerHeight,{width=PORTRAIT_SOURCE.width,height=PORTRAIT_SOURCE.height,fit='contain'}={}){
  const availableWidth=Math.max(0,Number(containerWidth)||0),availableHeight=Math.max(0,Number(containerHeight)||0);if(!availableWidth||!availableHeight)return{x:0,y:0,width:0,height:0,scale:0};
  const scale=(fit==='cover'?Math.max:Math.min)(availableWidth/width,availableHeight/height),renderedWidth=width*scale,renderedHeight=height*scale;return{x:(availableWidth-renderedWidth)/2,y:availableHeight-renderedHeight,width:renderedWidth,height:renderedHeight,scale,fit};
}

export function visibilityVerdict({display='block',visibility='visible',opacity=1,mouthRect,portraitRect,changes=0}={}){
  if(display==='none'||visibility==='hidden'||Number(opacity)<=0)return{ok:false,code:'hidden',label:'Masqué'};
  if(!mouthRect||!portraitRect||mouthRect.width<=0||mouthRect.height<=0)return{ok:false,code:'hidden',label:'Masqué'};
  const intersects=mouthRect.right>portraitRect.left&&mouthRect.left<portraitRect.right&&mouthRect.bottom>portraitRect.top&&mouthRect.top<portraitRect.bottom;if(!intersects)return{ok:false,code:'out-of-frame',label:'Hors cadre'};
  if(Number(changes)<2)return{ok:false,code:'still',label:'Immobile'};return{ok:true,code:'visible',label:'Visible et mobile'};
}

function now(){return globalThis.performance?.now?.()||Date.now();}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

export class LivingAvatarRuntime{
  constructor({bus=eventBus,clock=now}={}){this.bus=bus;this.clock=clock;this.root=null;this.portrait=null;this.mouth=null;this.observer=null;this.resizeObserver=null;this.resizeHandler=null;this.lastViseme='neutral';this.changes=0;this.source='idle';this.installed=false;this.unsubs=[];this.speechActive=false;this.speechSignalAt=null;this.firstMovementMs=null;this.lastStopAt=null;}
  install({root,portrait,mouth}={}){
    if(this.installed)return this;this.installed=true;this.root=root;this.portrait=portrait;this.mouth=mouth;this.fit();
    if(typeof ResizeObserver==='function'&&root){this.resizeObserver=new ResizeObserver(()=>this.fit());this.resizeObserver.observe(root);}else{this.resizeHandler=()=>this.fit();globalThis.addEventListener?.('resize',this.resizeHandler,{passive:true});}
    if(typeof MutationObserver==='function'&&mouth){this.observer=new MutationObserver(()=>this.captureFrame('dom'));this.observer.observe(mouth,{attributes:true,attributeFilter:['data-viseme','style','class']});}
    this.unsubs.push(
      this.bus.on('pg22.avatar.lipsync',payload=>{this.source=payload?.mode||payload?.source||'pg22';if(payload?.active===true&&!this.speechActive)this.signalSpeech(this.source);if(payload?.active===false)this.stopSpeech(payload?.mode||'neutral');}),
      this.bus.on('pg22.audio.started',payload=>this.signalSpeech(payload?.source||'tts')),
      this.bus.on('pg22.audio.transcript.delta',()=>{if(!this.speechActive)this.signalSpeech('realtime-transcript');}),
      this.bus.on('pg22.audio.interrupted',()=>this.stopSpeech('interrupted')),
      this.bus.on('pg22.audio.ended',()=>this.stopSpeech('ended')),
      this.bus.on('companion.status',payload=>this.setPresence(payload?.value,payload?.label))
    );
    this.captureFrame('install');return this;
  }
  fit(){if(!this.root||!this.portrait)return null;const mode=globalThis.document?.querySelector?.('#companionApp')?.dataset?.portrait||'hero',width=this.root.clientWidth||this.root.getBoundingClientRect?.().width,height=this.root.clientHeight||this.root.getBoundingClientRect?.().height,fit=mode==='hero'&&height>width?'cover':'contain',rect=fittedPortraitRect(width,height,{fit});if(rect.width&&rect.height){this.portrait.style.width=`${rect.width}px`;this.portrait.style.height=`${rect.height}px`;this.portrait.style.left=`${rect.x+rect.width/2}px`;this.portrait.style.bottom='0px';}this.bus.emit('pg23.avatar.geometry',{...rect,mode});return rect;}
  setPresence(state,label=''){
    const mapped=state==='planning'?'thinking':state==='connecting'?'thinking':PRESENCE_STATES.includes(state)?state:'ready';if(this.root)this.root.dataset.avatarState=mapped;this.bus.emit('pg23.presence.changed',{state:mapped,label:String(label||''),at:new Date().toISOString()});return mapped;
  }
  signalSpeech(source='audio'){
    if(this.speechActive)return this.speechSignalAt;this.speechActive=true;this.source=source;this.speechSignalAt=this.clock();this.firstMovementMs=null;this.bus.emit('pg23.lipsync.started',{source,state:this.root?.dataset?.avatarState||'speaking',at:this.speechSignalAt});return this.speechSignalAt;
  }
  stopSpeech(reason='ended'){
    const wasActive=this.speechActive;this.speechActive=false;this.lastStopAt=this.clock();if(this.mouth&&this.mouth.dataset.viseme!=='neutral'){this.mouth.dataset.viseme='neutral';this.mouth.style.setProperty('--viseme-index','0');}const frame=this.captureFrame('stopped');if(wasActive)this.bus.emit('pg23.lipsync.stopped',{reason,source:this.source,at:this.lastStopAt,firstMovementMs:this.firstMovementMs,frame});return frame;
  }
  captureFrame(source='runtime'){
    const viseme=this.mouth?.dataset?.viseme||'neutral';if(viseme!==this.lastViseme){this.lastViseme=viseme;this.changes+=1;if(this.speechActive&&viseme!=='neutral'&&this.firstMovementMs==null)this.firstMovementMs=Math.max(0,this.clock()-this.speechSignalAt);}const detail={viseme,changes:this.changes,source:this.source||source,state:this.root?.dataset?.avatarState||'ready',active:this.speechActive,firstMovementMs:this.firstMovementMs,at:this.clock()};this.bus.emit('pg23.lipsync.frame',detail);return detail;
  }
  diagnostic(){
    if(!this.root||!this.portrait||!this.mouth)return{ok:false,code:'missing',label:'Calque absent',changes:this.changes};const style=getComputedStyle(this.mouth),mouthRect=this.mouth.getBoundingClientRect(),portraitRect=this.portrait.getBoundingClientRect(),verdict=visibilityVerdict({display:style.display,visibility:style.visibility,opacity:style.opacity,mouthRect,portraitRect,changes:this.changes}),result={...verdict,version:globalThis.document?.querySelector?.('#companionApp')?.dataset?.pgVersion||'2.3.2',changes:this.changes,viseme:this.mouth.dataset.viseme||'neutral',state:this.root.dataset.avatarState||'ready',mode:globalThis.document?.querySelector?.('#companionApp')?.dataset?.portrait||'hero',source:this.source,audioActive:this.speechActive,firstMovementMs:this.firstMovementMs,mouth:{left:mouthRect.left,top:mouthRect.top,width:mouthRect.width,height:mouthRect.height},portrait:{left:portraitRect.left,top:portraitRect.top,width:portraitRect.width,height:portraitRect.height}};this.bus.emit('pg23.lipsync.diagnostic',result);return result;
  }
  destroy(){this.observer?.disconnect();this.resizeObserver?.disconnect();if(this.resizeHandler)globalThis.removeEventListener?.('resize',this.resizeHandler);this.resizeHandler=null;this.unsubs.splice(0).forEach(off=>off?.());this.installed=false;}
}

export class LipSyncLabRuntime{
  constructor({bus=eventBus,voiceService=null,stepMs=165}={}){this.bus=bus;this.voiceService=voiceService;this.stepMs=stepMs;this.root=null;this.portrait=null;this.mouth=null;this.readout={};this.changes=0;this.last='neutral';this.running=false;}
  install({root,portrait,mouth,readout={}}={}){this.root=root;this.portrait=portrait;this.mouth=mouth;this.readout=readout;this.fit();this.renderMeta({source:'silencieux',state:'ready',mode:'lab',version:'2.3.2'});return this;}
  fit(){if(!this.root||!this.portrait)return null;const rect=fittedPortraitRect(this.root.clientWidth||this.root.getBoundingClientRect?.().width,this.root.clientHeight||this.root.getBoundingClientRect?.().height);if(rect.width&&rect.height){this.portrait.style.width=`${rect.width}px`;this.portrait.style.height=`${rect.height}px`;this.portrait.style.left=`${rect.x+rect.width/2}px`;this.portrait.style.bottom='0px';}return rect;}
  setViseme(viseme){const value=ACTIVE_VISEMES.includes(viseme)?viseme:'neutral';if(value!==this.last){this.changes+=1;this.last=value;}if(this.mouth){this.mouth.dataset.viseme=value;this.mouth.style.setProperty('--viseme-index',String(ACTIVE_VISEMES.indexOf(value)));}if(this.readout.viseme)this.readout.viseme.textContent=value;if(this.readout.changes)this.readout.changes.textContent=String(this.changes);this.bus.emit('pg23.lipsync.frame',{viseme:value,changes:this.changes,source:'lab',at:now()});return value;}
  renderMeta({source,state,mode,version,audio}={}){if(this.readout.source&&source)this.readout.source.textContent=source;if(this.readout.state&&state)this.readout.state.textContent=state;if(this.readout.mode&&mode)this.readout.mode.textContent=mode;if(this.readout.version&&version)this.readout.version.textContent=version;if(this.readout.audio&&audio)this.readout.audio.textContent=audio;}
  measure(){if(!this.mouth||!this.portrait)return{ok:false,code:'missing',label:'Calque absent',changes:this.changes};const style=getComputedStyle(this.mouth),verdict=visibilityVerdict({display:style.display,visibility:style.visibility,opacity:style.opacity,mouthRect:this.mouth.getBoundingClientRect(),portraitRect:this.portrait.getBoundingClientRect(),changes:this.changes});const result={...verdict,changes:this.changes,viseme:this.last};if(this.readout.verdict){this.readout.verdict.textContent=result.label;this.readout.verdict.dataset.result=result.ok?'pass':'fail';}if(this.readout.visibility)this.readout.visibility.textContent=result.code;if(this.readout.status)this.readout.status.textContent=result.ok?'Le calque est visible et les formes ont changé. Vérifiez maintenant que vous les voyez réellement sur les lèvres.':`Échec local : ${result.label}.`;this.bus.emit('pg23.lipsync.diagnostic',result);return result;}
  async runSequence(sequence,{label='Test silencieux'}={}){if(this.running)return{ok:false,code:'busy',label:'Test déjà en cours'};this.running=true;this.changes=0;this.last='neutral';if(this.root)this.root.dataset.avatarState='speaking';this.renderMeta({source:label,state:'speaking',mode:'lab',audio:'Sans audio'});if(this.readout.status)this.readout.status.textContent=`${label} en cours…`;this.bus.emit('pg23.lab.started',{label});for(const viseme of sequence){this.setViseme(viseme);await wait(this.stepMs);}this.setViseme('neutral');const result=this.measure();this.running=false;this.renderMeta({state:'ready'});this.bus.emit('pg23.lab.completed',{...result,label});return result;}
  runSilent(){return this.runSequence([...ACTIVE_VISEMES.slice(1),...ACTIVE_VISEMES.slice(1).reverse()],{label:'Huit positions de bouche'});}
  runFrench(text='Bonjour, je suis votre guide audiovisuelle.'){const sequence=[...String(text)].map(visemeForCharacter).filter(value=>value!=='neutral');return this.runSequence(sequence,{label:'Phrase française'});}
  failMarin(label,voice={spoken:false}){const result={ok:false,code:'voice-unavailable',label,changes:this.changes,viseme:this.last,voice};if(this.readout.verdict){this.readout.verdict.textContent=label;this.readout.verdict.dataset.result='fail';}if(this.readout.visibility)this.readout.visibility.textContent='audio absent';if(this.readout.status)this.readout.status.textContent='Le test marin échoue honnêtement : aucune synchronisation audio réelle n’a été démontrée.';this.renderMeta({source:'marin',state:'degraded',mode:'lab',audio:'Non lu'});this.bus.emit('pg23.lab.completed',{...result,label:'Voix marin'});return result;}
  async runMarin(text='Bonjour, je suis votre guide audiovisuelle.'){
    if(this.running)return{ok:false,code:'busy',label:'Test déjà en cours'};this.running=true;this.changes=0;this.last='neutral';if(this.root)this.root.dataset.avatarState='speaking';this.renderMeta({source:'marin',state:'speaking',mode:'lab',version:'2.3.2',audio:'Démarrage…'});if(this.readout.status)this.readout.status.textContent='Voix marin et visage principal en cours de contrôle…';this.bus.emit('pg23.lab.started',{label:'Voix marin'});
    let ended=false,cancelCompletion=()=>{};const completion=new Promise(resolve=>{let settled=false,timer=0;const offs=[],done=value=>{if(settled)return;settled=true;clearTimeout(timer);offs.forEach(off=>off());resolve(value);};offs.push(this.bus.on('pg22.audio.ended',()=>{ended=true;done('ended');}),this.bus.on('pg22.audio.interrupted',()=>done('interrupted')));timer=setTimeout(()=>done('timeout'),16000);cancelCompletion=()=>done('cancelled');});
    const mirror=this.bus.on('pg23.lipsync.frame',frame=>{if(frame?.source!=='lab'&&frame?.viseme){this.setViseme(frame.viseme);if(this.readout.latency&&Number.isFinite(frame.firstMovementMs))this.readout.latency.textContent=`${Math.round(frame.firstMovementMs)} ms`;}});let voice;
    try{voice=await(this.voiceService?.speak?.(text,{routeId:'pg23-lab',key:'lip-sync-test'})||Promise.resolve({spoken:false}));}catch(error){voice={spoken:false,error};}
    if(!voice?.spoken){mirror();cancelCompletion();this.running=false;return this.failMarin('Voix marin non lue',voice);}
    this.renderMeta({audio:'Lecture réelle'});await completion;mirror();this.setViseme('neutral');const visual=this.measure();this.running=false;const ok=Boolean(visual.ok&&voice.spoken&&(ended||this.changes>=2)),result={...visual,ok,code:ok?'visible-audio':ended?'still-with-audio':'audio-timeout',label:ok?'Voix et lèvres validées':'Synchronisation non démontrée',voice,audioEnded:ended};if(this.readout.verdict){this.readout.verdict.textContent=result.label;this.readout.verdict.dataset.result=ok?'pass':'fail';}if(this.readout.status)this.readout.status.textContent=ok?'La voix marin a réellement été lue et plusieurs visèmes ont suivi le signal du personnage principal.':'La voix a démarré, mais le mouvement labial réel reste insuffisant.';this.renderMeta({state:ok?'ready':'degraded',audio:ended?'Terminée':'Lecture détectée'});this.bus.emit('pg23.lab.completed',{...result,label:'Voix marin'});return result;
  }
}

export const livingAvatarRuntime=new LivingAvatarRuntime();

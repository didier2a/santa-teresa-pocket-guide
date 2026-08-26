import {eventBus} from '../../pg16/core/event-bus.js';

export const ACTIVE_VISEMES=['neutral','mbp','fv','a','ei','o','u','lt'];
const LETTER_VISEMES={mbp:/[mbp]/i,fv:/[fv]/i,a:/[aàâä]/i,ei:/[eéèêëiîïy]/i,o:/[oôö]/i,u:/[uùûü]/i,lt:/[ltdnrszcjgkqxç]/i};

export function visemeForCharacter(character){const value=String(character||'');for(const [viseme,pattern] of Object.entries(LETTER_VISEMES))if(pattern.test(value))return viseme;return 'neutral';}

export class AvatarRuntime{
  constructor({clock=()=>globalThis.performance?.now?.()||Date.now(),setIntervalImpl=globalThis.setInterval,clearIntervalImpl=globalThis.clearInterval,setTimeoutImpl=globalThis.setTimeout,clearTimeoutImpl=globalThis.clearTimeout}={}){this.root=null;this.mouth=null;this.label=null;this.state='ready';this.viseme='neutral';this.lastVisemeAt=0;this.lastAudioLevelAt=0;this.unsubscribe=[];this.transcript='';this.transcriptCursor=0;this.fallbackTimer=0;this.readyTimer=0;this.clock=clock;this.setIntervalImpl=setIntervalImpl;this.clearIntervalImpl=clearIntervalImpl;this.setTimeoutImpl=setTimeoutImpl;this.clearTimeoutImpl=clearTimeoutImpl;}
  install({root,mouth,label}={}){
    this.root=root;this.mouth=mouth;this.label=label;this.setState('ready','Je suis avec vous');this.unsubscribe.push(
      eventBus.on('pg22.planning.stage',payload=>this.setState(payload?.running?'thinking':'ready',payload?.stage?.label)),
      eventBus.on('pg22.planning.cancelled',()=>this.setState('ready','Préparation annulée')),
      eventBus.on('pg22.audio.started',payload=>this.beginSpeaking(payload?.text||'',payload?.source||'tts')),
      eventBus.on('pg22.audio.transcript.delta',payload=>this.feedTranscript(payload?.delta||payload?.text||'',{source:'realtime'})),
      eventBus.on('pg22.audio.transcript.done',payload=>this.feedTranscript(payload?.text||'',{replace:Boolean(payload?.text),source:'realtime'})),
      eventBus.on('pg22.audio.realtime.done',()=>this.scheduleReady(650,'Je suis avec vous')),
      eventBus.on('pg22.audio.ended',()=>this.finishSpeaking('Je suis avec vous')),
      eventBus.on('pg22.audio.interrupted',()=>this.finishSpeaking('Je vous écoute'))
    );return this;
  }
  setState(state,label=''){this.state=state;this.root?.setAttribute('data-avatar-state',state);if(this.label&&label)this.label.textContent=label;if(state==='speaking')this.startFallback();else{this.stopFallback();this.setViseme('neutral');}return state;}
  setViseme(viseme){const value=ACTIVE_VISEMES.includes(viseme)?viseme:'neutral';this.viseme=value;if(this.mouth){this.mouth.dataset.viseme=value;this.mouth.style.setProperty('--viseme-index',String(ACTIVE_VISEMES.indexOf(value)));}return value;}
  beginSpeaking(text='',source='unknown'){this.cancelReady();this.transcript=String(text||'').trim();this.transcriptCursor=0;this.setState('speaking','Je vous parle');eventBus.emit('pg22.avatar.lipsync',{active:true,source,mode:this.lastAudioLevelAt?'hybrid':'transcript-fallback'});return this.state;}
  feedTranscript(text,{replace=false,source='realtime'}={}){const value=String(text||'');if(!value)return this.viseme;this.cancelReady();if(replace){this.transcript=value;this.transcriptCursor=0;}else this.transcript+=value;if(this.state!=='speaking')this.setState('speaking','Je vous parle');else this.startFallback();eventBus.emit('pg22.avatar.lipsync',{active:true,source,mode:'transcript-fallback',characters:this.transcript.length});return this.tickFallback();}
  nextTranscriptViseme(){if(!this.transcript)return ACTIVE_VISEMES[1+Math.floor((this.clock()/103)%7)];for(let attempts=0;attempts<this.transcript.length;attempts+=1){const character=this.transcript[this.transcriptCursor%this.transcript.length];this.transcriptCursor=(this.transcriptCursor+1)%Math.max(1,this.transcript.length);const viseme=visemeForCharacter(character);if(viseme!=='neutral')return viseme;}return 'neutral';}
  tickFallback(){if(this.state!=='speaking')return this.setViseme('neutral');if(this.lastAudioLevelAt&&this.clock()-this.lastAudioLevelAt<180)return this.viseme;return this.setViseme(this.nextTranscriptViseme());}
  startFallback(){if(this.fallbackTimer||typeof this.setIntervalImpl!=='function')return;this.fallbackTimer=this.setIntervalImpl(()=>this.tickFallback(),96);}
  stopFallback(){if(this.fallbackTimer&&typeof this.clearIntervalImpl==='function')this.clearIntervalImpl(this.fallbackTimer);this.fallbackTimer=0;}
  drive(level=0){const energy=Math.max(0,Math.min(1,Number(level)||0)),now=this.clock();if(energy<0.025)return;this.lastAudioLevelAt=now;this.cancelReady();if(this.state!=='speaking')this.setState('speaking','Je vous parle');if(now-this.lastVisemeAt<72)return;this.lastVisemeAt=now;const index=energy>.78?3:energy>.55?5:energy>.32?4:1+Math.floor((now/97)%7);this.setViseme(ACTIVE_VISEMES[Math.max(1,Math.min(7,index))]);}
  scheduleReady(delay=500,label='Je suis avec vous'){this.cancelReady();if(typeof this.setTimeoutImpl!=='function')return this.finishSpeaking(label);this.readyTimer=this.setTimeoutImpl(()=>{this.readyTimer=0;if(this.lastAudioLevelAt&&this.clock()-this.lastAudioLevelAt<320){this.scheduleReady(320,label);return;}this.finishSpeaking(label);},delay);}
  cancelReady(){if(this.readyTimer&&typeof this.clearTimeoutImpl==='function')this.clearTimeoutImpl(this.readyTimer);this.readyTimer=0;}
  finishSpeaking(label='Je suis avec vous'){this.cancelReady();this.transcript='';this.transcriptCursor=0;this.setState('ready',label);eventBus.emit('pg22.avatar.lipsync',{active:false,mode:'neutral'});return this.state;}
  interrupt(){return this.finishSpeaking('Je vous écoute');}
  async selfTest({stepMs=125}={}){this.beginSpeaking('Bonjour, je suis votre guide audiovisuelle.','self-test');for(const viseme of ACTIVE_VISEMES.slice(1)){this.setViseme(viseme);await new Promise(resolve=>this.setTimeoutImpl(resolve,stepMs));}this.finishSpeaking('Test des lèvres terminé');return true;}
  destroy(){this.unsubscribe.splice(0).forEach(off=>off?.());this.cancelReady();this.stopFallback();this.setViseme('neutral');}
}

export const avatarRuntime=new AvatarRuntime();

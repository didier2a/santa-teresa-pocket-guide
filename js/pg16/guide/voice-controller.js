import {pocketGuideState} from '../core/pocketguide-state.js';

const Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;

export class VoiceController{
  constructor(){this.recognition=null;this.listening=false;this.onTranscript=null;this.onStatus=null;}
  supported(){return Boolean(Recognition);}
  setStatus(status,label=''){
    this.listening=status==='listening';
    pocketGuideState.patch({conversation:{status}},{source:'voice-controller',event:`voice.${status}`});
    this.onStatus?.(status,label);
  }
  start(){
    if(!Recognition){this.onStatus?.('unsupported','Reconnaissance vocale indisponible');return false;}
    if(this.listening){this.stop();return true;}
    const recognition=new Recognition();this.recognition=recognition;
    recognition.lang='fr-FR';recognition.interimResults=false;recognition.continuous=false;recognition.maxAlternatives=1;
    recognition.onstart=()=>this.setStatus('listening','Je vous écoute…');
    recognition.onresult=event=>{
      const text=event.results?.[0]?.[0]?.transcript?.trim();
      if(text)this.onTranscript?.(text);
    };
    recognition.onerror=event=>{
      const label=event.error==='not-allowed'?'Autorisez le micro dans Chrome.':`Micro : ${event.error||'erreur'}`;
      this.setStatus('idle',label);
    };
    recognition.onend=()=>{if(this.listening)this.setStatus('idle','Parlez à votre guide');};
    try{recognition.start();return true}catch{return false;}
  }
  stop(){try{this.recognition?.stop()}catch{}this.setStatus('idle','Parlez à votre guide');}
  speak(text){
    const value=String(text||'').trim();if(!value||!('speechSynthesis'in globalThis))return;
    try{speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(value);utterance.lang='fr-FR';utterance.rate=1;utterance.pitch=1;
      utterance.onstart=()=>this.setStatus('speaking','Votre guide vous répond…');
      utterance.onend=()=>this.setStatus('idle','Parlez à votre guide');
      utterance.onerror=()=>this.setStatus('idle','Parlez à votre guide');
      speechSynthesis.speak(utterance);
    }catch{}
  }
  interrupt(){
    try{speechSynthesis?.cancel()}catch{}
    this.stop();
  }
}

export const voiceController=new VoiceController();

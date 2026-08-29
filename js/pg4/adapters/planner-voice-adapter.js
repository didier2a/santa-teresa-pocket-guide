function clean(value){return String(value||'').replace(/\s+/g,' ').trim();}
function join(a,b){return[clean(a),clean(b)].filter(Boolean).join(' ');}
function preferredMime(Recorder){for(const type of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'])if(Recorder?.isTypeSupported?.(type))return type;return'';}
async function blobBase64(blob){const buffer=await blob.arrayBuffer();let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);return btoa(binary);}

export class PlannerVoiceAdapter{
  constructor({windowImpl=globalThis.window,navigatorImpl=globalThis.navigator,fetchImpl=globalThis.fetch,companion=null,endpoint='/api/transcribe',watchdogMs=7000,onStatus=null}={}){
    this.window=windowImpl;this.navigator=navigatorImpl;this.fetchImpl=fetchImpl;this.companion=companion;this.endpoint=endpoint;this.watchdogMs=watchdogMs;this.onStatus=onStatus;
    this.field=null;this.button=null;this.statusNode=null;this.recognition=null;this.recorder=null;this.stream=null;this.chunks=[];this.wanted=false;this.mode='idle';this.baseText='';this.finalText='';this.watchdog=0;this.resumeCompanion=false;
  }
  install({field,button,status}={}){this.field=field;this.button=button;this.statusNode=status;button?.addEventListener?.('click',()=>void this.toggle());this.render('idle');return this;}
  setStatus(message){if(this.statusNode)this.statusNode.textContent=message;this.onStatus?.({mode:this.mode,message});}
  render(mode,message=''){
    this.mode=mode;const active=['starting','speech','recorder','transcribing'].includes(mode);
    if(this.button){this.button.disabled=mode==='transcribing';this.button.setAttribute('aria-pressed',String(active));this.button.dataset.voiceState=mode;this.button.textContent=mode==='transcribing'?'… Transcription':active?'■ Arrêter la dictée':'🎙️ Décrire par la voix';}
    this.setStatus(message||(active?'Écoute en cours… appuyez pour arrêter.':'Dictée vocale prête · navigateur + secours MediaRecorder.'));
  }
  async toggle(){return this.wanted?this.stop():this.start();}
  async start(){
    if(this.wanted)return true;this.wanted=true;this.baseText=clean(this.field?.value);this.finalText='';this.render('starting','Activation du micro…');
    try{this.resumeCompanion=Boolean(await this.companion?.suspendMicrophone?.());}catch{this.resumeCompanion=false;}
    const Recognition=this.window?.SpeechRecognition||this.window?.webkitSpeechRecognition;
    if(Recognition)return this.startRecognition(Recognition);
    return this.startRecorder('Reconnaissance navigateur absente : enregistrement de secours actif.');
  }
  startRecognition(Recognition){
    if(!this.wanted)return false;
    try{
      const recognition=new Recognition();this.recognition=recognition;recognition.lang='fr-FR';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
      recognition.onstart=()=>{this.render('speech');this.watchdog=this.window.setTimeout(()=>{if(this.wanted&&!this.finalText)void this.startRecorder('Aucune transcription navigateur : secours audio actif.')},this.watchdogMs);};
      recognition.onresult=event=>{this.window.clearTimeout(this.watchdog);let interim='';for(let index=event.resultIndex||0;index<event.results.length;index++){const text=clean(event.results[index]?.[0]?.transcript);if(event.results[index].isFinal)this.finalText=join(this.finalText,text);else interim=join(interim,text);}if(this.field){this.field.value=join(this.baseText,join(this.finalText,interim));this.field.dispatchEvent(new Event('input',{bubbles:true}));}this.render('speech',interim?`Écoute… ${interim}`:'Écoute en cours…');};
      recognition.onerror=event=>{if(!this.wanted||event.error==='aborted')return;if(['not-allowed','service-not-allowed'].includes(event.error)){this.wanted=false;this.render('error','Accès au micro refusé.');void this.resume();return;}void this.startRecorder(`Reconnaissance indisponible (${event.error}) : secours audio actif.`);};
      recognition.onend=()=>{this.recognition=null;if(this.wanted&&this.mode==='speech')this.window.setTimeout(()=>this.startRecognition(Recognition),250);};
      recognition.start();return true;
    }catch{return this.startRecorder('Reconnaissance indisponible : secours audio actif.');}
  }
  async startRecorder(message){
    if(!this.wanted)return false;this.window.clearTimeout(this.watchdog);try{this.recognition?.abort?.()}catch{}this.recognition=null;this.render('starting',message);
    const Recorder=this.window?.MediaRecorder;if(!Recorder||!this.navigator?.mediaDevices?.getUserMedia){this.wanted=false;this.render('error','La dictée vocale n’est pas disponible sur ce navigateur.');await this.resume();return false;}
    try{this.stream=await this.navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});this.chunks=[];const mime=preferredMime(Recorder);this.recorder=new Recorder(this.stream,mime?{mimeType:mime}:undefined);this.recorder.ondataavailable=event=>{if(event.data?.size)this.chunks.push(event.data);};this.recorder.onerror=()=>{this.render('error','Enregistrement vocal interrompu.');void this.cleanup();};this.recorder.start(1000);this.render('recorder',message);return true;}catch(error){this.wanted=false;this.render('error',`Micro indisponible : ${error.message||error}`);await this.resume();return false;}
  }
  async transcribe(blob){
    const audio=await blobBase64(blob);const response=await this.fetchImpl(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio,mimeType:blob.type||'audio/webm'})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);if(!clean(payload.text))throw new Error('Aucun texte reconnu');return clean(payload.text);
  }
  async finishRecorder(){
    const recorder=this.recorder;if(!recorder)return'';const stopped=new Promise(resolve=>recorder.addEventListener('stop',resolve,{once:true}));try{recorder.stop()}catch{}await stopped;const mime=recorder.mimeType||this.chunks[0]?.type||'audio/webm';const blob=new Blob(this.chunks,{type:mime});this.cleanupStream();if(!blob.size)return'';this.render('transcribing','Transcription de votre description…');const text=await this.transcribe(blob);if(this.field){this.field.value=join(this.baseText,text);this.field.dispatchEvent(new Event('input',{bubbles:true}));}return text;
  }
  cleanupStream(){try{this.stream?.getTracks?.().forEach(track=>track.stop())}catch{}this.stream=null;this.recorder=null;this.chunks=[];}
  async cleanup(){this.wanted=false;this.window.clearTimeout(this.watchdog);try{this.recognition?.abort?.()}catch{}this.recognition=null;this.cleanupStream();await this.resume();}
  async resume(){if(this.resumeCompanion){try{await this.companion?.resumeMicrophone?.(true)}catch{}}this.resumeCompanion=false;}
  async stop(){
    if(!this.wanted&&this.mode==='idle')return'';this.wanted=false;this.window.clearTimeout(this.watchdog);try{this.recognition?.stop?.()}catch{}this.recognition=null;let text='';try{if(this.recorder)text=await this.finishRecorder();else if(this.field&&this.finalText)this.field.value=join(this.baseText,this.finalText);this.render('idle','Dictée terminée. Vous pouvez corriger le texte.');}catch(error){this.render('error',`Transcription de secours indisponible : ${error.message||error}`);}await this.resume();return text;
  }
  diagnostic(){return{speechRecognition:Boolean(this.window?.SpeechRecognition||this.window?.webkitSpeechRecognition),mediaRecorder:Boolean(this.window?.MediaRecorder),fallbackEndpoint:this.endpoint,mode:this.mode};}
}

export {blobBase64,preferredMime};

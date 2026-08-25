const button=document.querySelector('#planVoiceBtn');
const field=document.querySelector('#planPrompt');
const status=document.querySelector('#planVoiceStatus');
const planButton=document.querySelector('#planBtn');
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;

if(button&&field&&status){
  const cfg=await fetch('./data/v2-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():({})).catch(()=>({}));
  const apiBase=String(cfg.apiBase||'').replace(/\/$/,'');
  let recognition=null;
  let wanted=false;
  let baseText='';
  let sessionFinal='';
  let restartTimer=0;
  let speechWatchdog=0;
  let suspendedRealtimeTracks=[];
  let recorder=null;
  let recorderStream=null;
  let recorderChunks=[];
  let mode='idle';
  let gotSpeechResult=false;
  let replayPlanClick=false;
  let stopPromise=null;

  const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
  const join=(a,b)=>[clean(a),clean(b)].filter(Boolean).join(' ').trim();
  const likelyIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

  function dedupeTranscript(text){
    const words=clean(text).split(' ').filter(Boolean);
    if(words.length<2)return words.join(' ');
    const norm=w=>w.toLocaleLowerCase('fr-FR').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');
    for(let size=Math.min(8,Math.floor(words.length/2));size>=1;size--){
      let i=0;
      while(i+size*2<=words.length){
        const a=words.slice(i,i+size).map(norm).join(' ');
        const b=words.slice(i+size,i+size*2).map(norm).join(' ');
        if(a&&a===b)words.splice(i+size,size);else i++;
      }
    }
    return words.join(' ');
  }

  function setUi(next,message=''){
    mode=next;
    const active=['speech','starting','recorder','transcribing'].includes(next);
    button.setAttribute('aria-pressed',String(active));
    button.disabled=next==='transcribing';
    button.textContent=next==='transcribing'?'… Transcription':active?'■ Arrêter la dictée':'🎙️ Décrire par la voix';
    button.dataset.voiceState=next;
    status.textContent=message||(active?'Écoute en cours… parlez naturellement, puis appuyez pour arrêter.':'Dictée vocale prête · vous pouvez parler aussi longtemps que nécessaire.');
  }

  function suspendRealtimeMic(){
    const app=window.__POCKETGUIDE_15__;
    try{if(app?.state?.responding)app.sendEvent?.({type:'response.cancel'})}catch{}
    suspendedRealtimeTracks=[...(app?.state?.micStream?.getAudioTracks?.()||[])];
    for(const track of suspendedRealtimeTracks)track.enabled=false;
  }
  function resumeRealtimeMic(){for(const track of suspendedRealtimeTracks){try{if(track.readyState==='live')track.enabled=true}catch{}}suspendedRealtimeTracks=[]}

  function commitFinal(){
    if(sessionFinal)baseText=join(baseText,sessionFinal);
    sessionFinal='';
    field.value=baseText;
    field.dispatchEvent(new Event('input',{bubbles:true}));
  }

  function preferredMime(){
    if(typeof MediaRecorder==='undefined')return'';
    for(const type of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'])if(MediaRecorder.isTypeSupported?.(type))return type;
    return'';
  }

  async function transcribeBlob(blob){
    if(!apiBase)throw new Error('Service de transcription non configuré');
    const mime=blob.type||'audio/webm';
    const r=await fetch(`${apiBase}/v1/transcribe`,{method:'POST',headers:{'Content-Type':mime},body:blob});
    const out=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(out.error||`HTTP ${r.status}`);
    if(!clean(out.text))throw new Error('Aucun texte reconnu');
    return clean(out.text);
  }

  async function startRecorderFallback(reason='Safari bascule sur la transcription audio de secours…'){
    if(!wanted)return;
    window.clearTimeout(speechWatchdog);
    try{recognition?.abort()}catch{}
    recognition=null;
    if(typeof MediaRecorder==='undefined'||!navigator.mediaDevices?.getUserMedia){wanted=false;resumeRealtimeMic();setUi('error','La dictée vocale n’est pas disponible sur ce navigateur.');return}
    try{
      recorderStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      recorderChunks=[];
      const mime=preferredMime();
      recorder=new MediaRecorder(recorderStream,mime?{mimeType:mime}:undefined);
      recorder.ondataavailable=e=>{if(e.data?.size)recorderChunks.push(e.data)};
      recorder.onerror=()=>{wanted=false;cleanupRecorder();resumeRealtimeMic();setUi('error','Enregistrement vocal interrompu. Réessayez.')};
      recorder.start(1000);
      setUi('recorder',reason);
    }catch(error){wanted=false;cleanupRecorder();resumeRealtimeMic();setUi('error',`Micro indisponible : ${error.message||error}`)}
  }

  function cleanupRecorder(){try{recorderStream?.getTracks?.().forEach(t=>t.stop())}catch{}recorderStream=null;recorder=null}

  async function finishRecorder(){
    if(!recorder)return'';
    const current=recorder;
    const done=new Promise(resolve=>current.addEventListener('stop',resolve,{once:true}));
    try{current.stop()}catch{}
    await done.catch(()=>{});
    const mime=current.mimeType||recorderChunks[0]?.type||'audio/webm';
    const blob=new Blob(recorderChunks,{type:mime});
    cleanupRecorder();
    if(!blob.size)return'';
    setUi('transcribing','Transcription de votre description vocale…');
    const text=await transcribeBlob(blob);
    baseText=join(baseText,dedupeTranscript(text));
    field.value=baseText;
    field.dispatchEvent(new Event('input',{bubbles:true}));
    return text;
  }

  function makeRecognition(){
    const rec=new SpeechRecognition();
    rec.lang='fr-FR';
    rec.continuous=true;
    rec.interimResults=true;
    rec.maxAlternatives=1;
    rec.onstart=()=>{
      setUi('speech');
      if(likelyIOS())speechWatchdog=window.setTimeout(()=>{if(wanted&&!gotSpeechResult)void startRecorderFallback('Safari ne renvoie pas de transcription : mode audio de secours actif.')},7000);
    };
    rec.onresult=event=>{
      gotSpeechResult=true;
      window.clearTimeout(speechWatchdog);
      const finals=[],interims=[];
      for(let i=0;i<event.results.length;i++){
        const text=clean(event.results[i]?.[0]?.transcript||'');
        if(!text)continue;
        (event.results[i].isFinal?finals:interims).push(text);
      }
      sessionFinal=dedupeTranscript(finals.join(' '));
      const interim=dedupeTranscript(interims.join(' '));
      field.value=join(baseText,join(sessionFinal,interim));
      field.dispatchEvent(new Event('input',{bubbles:true}));
      setUi('speech',interim?`Écoute… ${interim}`:'Écoute en cours… appuyez pour arrêter.');
    };
    rec.onerror=event=>{
      window.clearTimeout(speechWatchdog);
      if(event.error==='not-allowed'||event.error==='service-not-allowed'){
        wanted=false;resumeRealtimeMic();setUi('error','Accès au micro refusé. Autorisez le micro dans le navigateur puis réessayez.');
      }else if(likelyIOS()&&wanted&&event.error!=='aborted'){
        void startRecorderFallback(`Web Speech indisponible (${event.error}) : mode audio de secours actif.`);
      }else if(event.error!=='aborted'&&event.error!=='no-speech'){
        setUi('error',`Dictée vocale momentanément indisponible (${event.error}).`);
      }
    };
    rec.onend=()=>{
      window.clearTimeout(speechWatchdog);
      commitFinal();
      recognition=null;
      if(wanted&&mode==='speech'&&!document.hidden){
        if(likelyIOS()&&!gotSpeechResult)void startRecorderFallback('Safari ne renvoie plus de texte : mode audio de secours actif.');
        else restartTimer=window.setTimeout(startRecognizer,260);
      }else if(mode!=='recorder'&&mode!=='transcribing'){
        wanted=false;resumeRealtimeMic();if(status.textContent.startsWith('Écoute'))setUi('idle','Dictée terminée. Vous pouvez corriger le texte ou relancer le micro.');
      }
    };
    return rec;
  }

  function startRecognizer(){
    if(!wanted||recognition||document.hidden)return;
    try{recognition=makeRecognition();recognition.start()}catch{
      recognition=null;
      if(likelyIOS())void startRecorderFallback('Safari bascule sur la transcription audio de secours…');
      else restartTimer=window.setTimeout(startRecognizer,400);
    }
  }

  function start(){
    if(wanted)return;
    wanted=true;baseText=clean(field.value);sessionFinal='';gotSpeechResult=false;suspendRealtimeMic();setUi('starting','Activation du micro…');
    if(SpeechRecognition)startRecognizer();else void startRecorderFallback('Reconnaissance navigateur absente : mode audio de secours actif.');
  }

  async function stop(message='Dictée terminée. Vous pouvez corriger le texte puis créer le parcours.'){
    if(stopPromise)return stopPromise;
    stopPromise=(async()=>{
      wanted=false;window.clearTimeout(restartTimer);window.clearTimeout(speechWatchdog);restartTimer=0;speechWatchdog=0;
      try{recognition?.stop()}catch{}
      if(recorder){
        try{await finishRecorder();setUi('idle',message)}catch(error){setUi('error',`Transcription de secours indisponible : ${error.message||error}`)}
      }else{commitFinal();setUi('idle',message)}
      resumeRealtimeMic();
    })().finally(()=>{stopPromise=null});
    return stopPromise;
  }

  button.addEventListener('click',()=>wanted?void stop():start());
  planButton?.addEventListener('click',async e=>{
    if(replayPlanClick){replayPlanClick=false;return}
    if(!wanted&&!stopPromise)return;
    e.preventDefault();e.stopImmediatePropagation();
    await stop('Dictée arrêtée · le Planner prépare votre parcours.');
    replayPlanClick=true;planButton.click();
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&wanted)void stop('Dictée mise en pause car PocketGuide n’est plus au premier plan.')});
  window.addEventListener('beforeunload',()=>{wanted=false;window.clearTimeout(restartTimer);window.clearTimeout(speechWatchdog);try{recognition?.abort()}catch{}try{recorder?.stop()}catch{}cleanupRecorder();resumeRealtimeMic()});

  setUi('idle');
  window.__POCKETGUIDE_PLANNER_VOICE__={start,stop,get active(){return wanted},get mode(){return mode}};
}

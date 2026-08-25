const button=document.querySelector('#planVoiceBtn');
const field=document.querySelector('#planPrompt');
const status=document.querySelector('#planVoiceStatus');
const planButton=document.querySelector('#planBtn');
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;

if(button&&field&&status){
  let recognition=null;
  let wanted=false;
  let baseText='';
  let sessionFinal='';
  let restartTimer=0;
  let suspendedRealtimeTracks=[];

  const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
  const join=(a,b)=>[clean(a),clean(b)].filter(Boolean).join(' ').trim();

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

  function setUi(mode,message=''){
    const active=mode==='listening'||mode==='starting';
    button.setAttribute('aria-pressed',String(active));
    button.textContent=active?'■ Arrêter la dictée':'🎙️ Décrire par la voix';
    button.dataset.voiceState=mode;
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

  function makeRecognition(){
    const rec=new SpeechRecognition();
    rec.lang='fr-FR';
    rec.continuous=true;
    rec.interimResults=true;
    rec.maxAlternatives=1;
    rec.onstart=()=>setUi('listening');
    rec.onresult=event=>{
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
      setUi('listening',interim?`Écoute… ${interim}`:'Écoute en cours… appuyez pour arrêter.');
    };
    rec.onerror=event=>{
      if(event.error==='not-allowed'||event.error==='service-not-allowed'){
        wanted=false;
        setUi('error','Accès au micro refusé. Autorisez le micro dans Chrome puis réessayez.');
      }else if(event.error!=='aborted'&&event.error!=='no-speech'){
        setUi('error',`Dictée vocale momentanément indisponible (${event.error}).`);
      }
    };
    rec.onend=()=>{
      commitFinal();
      recognition=null;
      if(wanted&&!document.hidden){
        restartTimer=window.setTimeout(startRecognizer,260);
      }else{
        wanted=false;
        resumeRealtimeMic();
        if(status.textContent.startsWith('Écoute'))setUi('idle','Dictée terminée. Vous pouvez corriger le texte ou relancer le micro.');
      }
    };
    return rec;
  }

  function startRecognizer(){
    if(!wanted||recognition||document.hidden)return;
    try{recognition=makeRecognition();recognition.start()}catch{
      recognition=null;
      restartTimer=window.setTimeout(startRecognizer,400);
    }
  }

  function start(){
    if(!SpeechRecognition){setUi('error','La dictée vocale navigateur n’est pas disponible ici. Utilisez Chrome sur Android ou la saisie texte.');return}
    if(wanted)return;
    wanted=true;
    baseText=clean(field.value);
    sessionFinal='';
    suspendRealtimeMic();
    setUi('starting','Activation du micro…');
    startRecognizer();
  }

  function stop(message='Dictée terminée. Vous pouvez corriger le texte puis créer le parcours.'){
    wanted=false;
    window.clearTimeout(restartTimer);
    restartTimer=0;
    try{recognition?.stop()}catch{}
    if(!recognition){commitFinal();resumeRealtimeMic()}
    setUi('idle',message);
  }

  button.addEventListener('click',()=>wanted?stop():start());
  planButton?.addEventListener('click',()=>{if(wanted)stop('Dictée arrêtée · le Planner prépare votre parcours.')},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&wanted)stop('Dictée mise en pause car PocketGuide n’est plus au premier plan.')});
  window.addEventListener('beforeunload',()=>{wanted=false;window.clearTimeout(restartTimer);try{recognition?.abort()}catch{}resumeRealtimeMic()});

  setUi('idle');
  window.__POCKETGUIDE_PLANNER_VOICE__={start,stop,get active(){return wanted}};
}

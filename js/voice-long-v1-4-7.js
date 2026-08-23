(()=>{
  const mic=document.querySelector('#mic');
  const box=document.querySelector('#prompt');
  const status=document.querySelector('#voiceStatus');
  if(!mic||!box||!status)return;

  const MAX_MS=180000;
  let recorder=null,stream=null,chunks=[],stopTimer=null,ticker=null,startedAt=0,stopping=false;

  function setStatus(text,type=''){status.className=`voice-state ${type}`;status.textContent=text}
  function elapsed(){const s=Math.max(0,Math.floor((Date.now()-startedAt)/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
  function tokenKey(word=''){return String(word).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\p{L}\p{N}]+/gu,'')}
  function dedupe(text=''){const words=String(text).trim().replace(/\s+/g,' ').split(' ').filter(Boolean);if(words.length<4)return words.join(' ');let changed=true,pass=0;while(changed&&pass++<8){changed=false;outer:for(let size=Math.min(12,Math.floor(words.length/2));size>=2;size--){for(let i=0;i+size*2<=words.length;i++){let same=true;for(let j=0;j<size;j++)if(tokenKey(words[i+j])!==tokenKey(words[i+size+j])){same=false;break}if(same){words.splice(i+size,size);changed=true;break outer}}}}return words.join(' ').trim()}
  function append(text){const clean=dedupe(text);if(!clean)return;const before=box.value.trim();box.value=[before,clean].filter(Boolean).join(before?' ':'');box.dispatchEvent(new Event('input',{bubbles:true}));box.focus();setStatus('✓ Dictée longue transcrite et insérée une seule fois.','ok')}
  function bestMime(){for(const x of ['audio/webm;codecs=opus','audio/webm','audio/mp4'])if(window.MediaRecorder?.isTypeSupported?.(x))return x;return''}
  function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
  async function apiBase(){
    try{const cfg=await fetch('./data/ai-config.json?v=1.4.7-micfix',{cache:'no-store'}).then(r=>r.ok?r.json():null);if(cfg?.apiBase)return String(cfg.apiBase).replace(/\/$/,'')}catch{}
    const saved=String(localStorage.getItem('pg-ai-base')||'').replace(/\/$/,'');
    if(saved)return saved;
    if(location.hostname.endsWith('.vercel.app'))return location.origin;
    return'';
  }
  async function transcribe(blob){
    const base=await apiBase();if(!base)throw new Error('Backend de transcription non relié');
    setStatus('Transcription OpenAI en cours…','work');
    const audio=await blobToBase64(blob);
    const r=await fetch(`${base}/api/transcribe`,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({audio,mimeType:blob.type||'audio/webm'})});
    const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(payload.error||`Erreur ${r.status}`);
    const text=String(payload.text||'').trim();if(!text)throw new Error('Aucune parole reconnue');return text;
  }
  function cleanup(){clearTimeout(stopTimer);clearInterval(ticker);stopTimer=ticker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;recorder=null;stopping=false;mic.classList.remove('recording');mic.textContent='🎙️ Parler'}
  async function stop(){if(!recorder||recorder.state==='inactive'||stopping)return;stopping=true;setStatus('Finalisation de la dictée…','work');recorder.stop()}
  async function start(){
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Enregistrement micro non pris en charge par ce navigateur.');
    setStatus('Autorisation du micro…','work');
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    chunks=[];const mime=bestMime();
    try{recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000})}catch{recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined)}
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
    recorder.onerror=e=>{setStatus(`Erreur micro : ${e.error?.message||e.error?.name||'inconnue'}`,'bad');cleanup()};
    recorder.onstop=async()=>{
      const active=recorder;const parts=[...chunks];const type=active?.mimeType||mime||'audio/webm';
      clearTimeout(stopTimer);clearInterval(ticker);stream?.getTracks().forEach(t=>t.stop());stream=null;recorder=null;stopping=false;mic.classList.remove('recording');mic.textContent='🎙️ Parler';
      try{const blob=new Blob(parts,{type});if(blob.size<500)throw new Error('Enregistrement trop court');append(await transcribe(blob))}catch(err){setStatus(err?.message||'Transcription impossible','bad')}
    };
    recorder.start(250);startedAt=Date.now();mic.classList.add('recording');mic.textContent='■ Arrêter';setStatus('● Dictée longue active — parlez librement, puis appuyez sur Arrêter.','recording');
    ticker=setInterval(()=>{if(recorder?.state==='recording')setStatus(`● Dictée longue active ${elapsed()} — appuyez sur Arrêter quand vous avez fini.`,'recording')},1000);
    stopTimer=setTimeout(()=>{if(recorder?.state==='recording'){setStatus('Limite de 3 minutes atteinte — finalisation…','work');void stop()}},MAX_MS);
  }
  async function handle(event){
    event.preventDefault();event.stopImmediatePropagation();
    if(recorder?.state==='recording'){await stop();return}
    try{await start()}catch(err){cleanup();const msg=err?.name==='NotAllowedError'?'Autorisation micro refusée dans Chrome. Autorisez le micro pour ce site puis réessayez.':err?.message||'Micro indisponible';setStatus(msg,'bad')}
  }

  mic.addEventListener('click',handle,{capture:true});
  setStatus('Micro prêt · dictée longue jusqu’à arrêt manuel.');
})();

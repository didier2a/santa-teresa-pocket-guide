import {validateRoutePack} from '../engine/routepack.js';
import {packShareUrl,routeShareUrl} from './route-runtime.js';

const $=s=>document.querySelector(s);
let current=null,apiBase='',recorder=null,stream=null,chunks=[],recordTimer=null,speechRec=null;

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function setStatus(text,type=''){const el=$('#status');el.className=type;el.innerHTML=text}
function setVoice(text,type=''){const el=$('#voiceStatus');el.className=type;el.textContent=text}
function endpoint(path){return`${apiBase}${path}`}

async function checkBackend(){
  if(!apiBase)return;
  try{
    const r=await fetch(endpoint('/api/health'),{cache:'no-store'});
    const h=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    if(h.openaiConfigured){
      $('#aiBackend').textContent=`✓ Backend V1.4.4 prêt · ${h.plannerModel||'OpenAI'}`;
      $('#aiBackend').className='ok';
    }else{
      $('#aiBackend').textContent='Backend Vercel joignable, mais OPENAI_API_KEY n’est pas liée à ce projet.';
      $('#aiBackend').className='bad';
    }
  }catch(err){
    $('#aiBackend').textContent=`Backend Vercel injoignable : ${apiBase}`;
    $('#aiBackend').className='bad';
  }
}

async function loadConfig(){
  try{const cfg=await fetch('./data/ai-config.json?v=1.4.4',{cache:'no-store'}).then(r=>r.ok?r.json():null);apiBase=String(cfg?.apiBase||'').replace(/\/$/,'')}catch{}
  const q=new URLSearchParams(location.search).get('api');if(q){apiBase=q.replace(/\/$/,'');localStorage.setItem('pg-ai-base',apiBase)}
  if(!apiBase)apiBase=String(localStorage.getItem('pg-ai-base')||'').replace(/\/$/,'');
  if(!apiBase&&location.hostname.endsWith('.vercel.app'))apiBase=location.origin;
  $('#aiBackend').textContent=apiBase?`Test du backend sécurisé : ${apiBase}`:'Backend AI non relié — la dictée navigateur reste disponible.';
  if(apiBase)await checkBackend();
}

function show(pack){
  current=pack;const report=validateRoutePack(pack);const lines=[`valid: ${report.valid}`,`${report.errors.length} erreur(s)`,`${report.warnings.length} avertissement(s)`,`lieux: ${(pack.places||[]).length}`,`jours: ${(pack.days||[]).length}`];
  for(const e of report.errors)lines.push(`ERROR ${e.code} ${e.path}: ${e.message}`);for(const w of report.warnings)lines.push(`WARN ${w.code} ${w.path}: ${w.message}`);
  setStatus(report.valid?'<strong>✓ RoutePack V1 validé par PocketGuide</strong>':'<strong>✕ RoutePack rejeté par le validateur</strong>',report.valid?'ok':'bad');
  $('#report').textContent=lines.join('\n');$('#preview').disabled=!report.valid;$('#share').disabled=!report.valid;$('#download').disabled=!report.valid;$('#shareUrl').value='';renderDraft(pack);return report;
}

function renderDraft(pack){
  const host=$('#draft');if(!pack){host.textContent='Aucun brouillon.';return}
  host.innerHTML=`<h3>${esc(pack.title)}</h3><p>${esc(pack.start)} → ${esc(pack.end)} · ${pack.travelers} voyageur(s)</p>${pack.days.map(d=>`<div class="draft-day"><strong>${esc(d.label)}</strong>${d.events.map(e=>`<div><time>${esc(e.time)}</time> ${esc(e.title)} <small>· ${esc(e.place||'')}</small></div>`).join('')}<small>${esc(d.subtitle||'')}</small></div>`).join('')}<p class="notice">⚠ AI Planner prépare un itinéraire vérifié autant que possible par sources publiques, puis PocketGuide applique son validateur déterministe. Vérifiez malgré tout réservations, fermetures exceptionnelles et transports avant départ.</p>`;
}

async function plan(){
  const prompt=$('#prompt').value.trim();if(prompt.length<8){setStatus('Décrivez un peu plus votre voyage.','bad');return}
  if(!apiBase){setStatus('Le backend AI Planner n’est pas encore relié à cette copie de PocketGuide.','bad');return}
  $('#generate').disabled=true;setStatus('AI Planner analyse la demande et recherche les informations utiles…','work');
  try{
    const r=await fetch(endpoint('/api/plan'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,destination:$('#destination').value.trim(),timezone:$('#timezone').value.trim()||'Europe/Paris',maxPlaces:Number($('#maxPlaces').value)||6})});
    const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(payload.error||`Erreur ${r.status}`);show(payload.pack);
  }catch(err){
    const msg=String(err?.message||err||'Erreur inconnue');
    setStatus(`<strong>AI Planner indisponible :</strong> ${esc(msg==='Failed to fetch'?'backend Vercel non joignable depuis le téléphone':msg)}`,'bad');
    void checkBackend();
  }finally{$('#generate').disabled=false}
}

function bestMime(){for(const x of ['audio/webm;codecs=opus','audio/webm','audio/mp4'])if(window.MediaRecorder?.isTypeSupported?.(x))return x;return''}
function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
async function transcribeBlob(blob){
  if(!apiBase)throw new Error('Backend de transcription non relié');
  setVoice('Transcription OpenAI en cours…','work');
  const audio=await blobToBase64(blob);const r=await fetch(endpoint('/api/transcribe'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio,mimeType:blob.type||'audio/webm'})});
  const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(payload.error||`Erreur ${r.status}`);return String(payload.text||'').trim();
}

function tokenKey(word=''){
  return String(word).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\p{L}\p{N}]+/gu,'');
}
function dedupeTranscript(text=''){
  const words=String(text).trim().replace(/\s+/g,' ').split(' ').filter(Boolean);
  if(words.length<4)return words.join(' ');
  let changed=true,pass=0;
  while(changed&&pass++<8){
    changed=false;
    outer:for(let size=Math.min(12,Math.floor(words.length/2));size>=2;size--){
      for(let i=0;i+size*2<=words.length;i++){
        let same=true;
        for(let j=0;j<size;j++)if(tokenKey(words[i+j])!==tokenKey(words[i+size+j])){same=false;break}
        if(same){words.splice(i+size,size);changed=true;break outer}
      }
    }
  }
  return words.join(' ').trim();
}
function appendTranscript(text){const box=$('#prompt'),before=box.value.trim(),clean=dedupeTranscript(text);if(!clean)return;box.value=[before,clean].filter(Boolean).join(before?' ':'');box.dispatchEvent(new Event('input',{bubbles:true}));box.focus();setVoice('✓ Dictée nettoyée et insérée une seule fois.','ok')}

async function stopRecorder(){if(recorder&&recorder.state!=='inactive')recorder.stop()}
async function startRecorder(){
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});chunks=[];const mimeType=bestMime();recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);
  recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  recorder.onstop=async()=>{clearTimeout(recordTimer);$('#mic').classList.remove('recording');$('#mic').textContent='🎙️ Parler';stream?.getTracks().forEach(t=>t.stop());try{const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});if(blob.size<500)throw new Error('Enregistrement trop court');appendTranscript(await transcribeBlob(blob))}catch(err){setVoice(err.message||'Transcription impossible','bad')}};
  recorder.start(250);$('#mic').classList.add('recording');$('#mic').textContent='■ Arrêter';setVoice('● Écoute en cours… Parlez naturellement.','recording');recordTimer=setTimeout(stopRecorder,90000);
}

function browserSpeech(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)throw new Error('Reconnaissance vocale indisponible dans ce navigateur.');
  if(speechRec){try{speechRec.stop()}catch{}return}
  const rec=new SR();speechRec=rec;rec.lang='fr-FR';rec.interimResults=true;rec.continuous=false;let bestFinal='',bestInterim='',gotSpeech=false,hadError=false;
  rec.onstart=()=>{$('#mic').classList.add('recording');$('#mic').textContent='■ Arrêter';setVoice('● Je vous écoute… la phrase sera insérée une seule fois à la fin.','recording')};
  rec.onspeechstart=()=>{gotSpeech=true;setVoice('● Voix détectée… continuez à parler.','recording')};
  rec.onresult=e=>{
    let finalCandidate='',interimCandidate='';
    for(let i=0;i<e.results.length;i++){
      const t=String(e.results[i][0]?.transcript||'').trim();if(!t)continue;gotSpeech=true;
      if(e.results[i].isFinal)finalCandidate=[finalCandidate,t].filter(Boolean).join(' ');else interimCandidate=t;
    }
    if(finalCandidate)bestFinal=finalCandidate;
    if(interimCandidate)bestInterim=interimCandidate;
    setVoice(`« ${dedupeTranscript(bestFinal||bestInterim)} »`,'work');
  };
  rec.onerror=e=>{hadError=true;const msg=e.error==='not-allowed'?'Autorisation micro refusée dans Chrome.':e.error==='no-speech'?'Aucune parole détectée.':e.error==='network'?'Service de dictée Chrome indisponible.':'Dictée interrompue : '+e.error;setVoice(msg,'bad')};
  rec.onend=()=>{
    speechRec=null;$('#mic').classList.remove('recording');$('#mic').textContent='🎙️ Parler';
    const transcript=dedupeTranscript(bestFinal||bestInterim);
    if(transcript)appendTranscript(transcript);else if(!gotSpeech&&!hadError)setVoice('Aucun texte reconnu. Appuyez sur Parler puis dictez votre demande.','bad');
  };
  rec.start();
}

async function toggleVoice(){
  if(speechRec){try{speechRec.stop()}catch{}return}
  if(recorder?.state==='recording'){await stopRecorder();return}
  try{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(SR){browserSpeech();return}
    if(apiBase&&navigator.mediaDevices?.getUserMedia&&window.MediaRecorder){await startRecorder();return}
    throw new Error('Aucun moteur de dictée compatible n’est disponible dans ce navigateur.');
  }catch(err){setVoice(err.message||'Micro indisponible','bad')}
}

$('#mic').onclick=toggleVoice;$('#generate').onclick=plan;
$('#importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{show(JSON.parse(await f.text()))}catch(err){setStatus(`<strong>JSON invalide :</strong> ${esc(err.message||err)}`,'bad')}};
$('#preview').onclick=()=>{if(current)location.href=packShareUrl(current,location)};
$('#share').onclick=async()=>{if(!current)return;try{const url=packShareUrl(current,location);if(url.length>12000)throw new Error('Parcours trop volumineux pour un lien autonome : téléchargez le JSON.');$('#shareUrl').value=url;await navigator.clipboard?.writeText(url);setStatus('<strong>✓ Lien copié</strong>','ok')}catch(err){$('#shareUrl').value=String(err.message||err)}};
$('#download').onclick=()=>{if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${current.id}.routepack.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#example').onclick=()=>{$('#prompt').value='Je vais à Florence du 12 au 13 octobre 2026 avec 4 personnes. Je veux les principaux monuments, maximum 7 km de marche par jour, déjeuner vers 13 h, un rythme tranquille et des lieux photogéniques.';$('#destination').value='Florence'};

await loadConfig();
(async()=>{try{const reg=await fetch('./data/routes.json',{cache:'no-store'}).then(r=>r.json());$('#routes').innerHTML=reg.routes.filter(r=>r.enabled!==false).map(r=>`<a href="${routeShareUrl(r.id,new URL('./engine.html',location.href))}">${esc(r.title)}</a>`).join('')}catch{$('#routes').textContent='Catalogue indisponible.'}})();

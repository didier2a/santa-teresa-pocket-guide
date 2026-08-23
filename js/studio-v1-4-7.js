import {validateRoutePack} from '../engine/routepack.js';
import {packShareUrl,packHandoffUrl} from './route-runtime.js';

const $=s=>document.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,lastReport=null,apiBase='',speechRec=null,recorder=null,stream=null,chunks=[];

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function setStatus(text,type=''){const el=$('#status');el.className=type;el.innerHTML=text}
function setVoice(text,type=''){const el=$('#voiceStatus');el.className=`voice-state ${type}`;el.textContent=text}
function setReady(mode,title,text){const box=$('#readyState');box.className=`readybox ${mode==='ok'?'okbox':mode==='bad'?'badbox':mode==='work'?'workbox':''}`;box.innerHTML=`<strong>${esc(title)}</strong><span>${esc(text)}</span>`}
function endpoint(path){return`${apiBase}${path}`}

async function loadConfig(){
  try{const cfg=await fetch('./data/ai-config.json?v=1.4.7',{cache:'no-store'}).then(r=>r.ok?r.json():null);apiBase=String(cfg?.apiBase||'').replace(/\/$/,'')}catch{}
  const q=new URLSearchParams(location.search).get('api');if(q){apiBase=q.replace(/\/$/,'');localStorage.setItem('pg-ai-base',apiBase)}
  if(!apiBase)apiBase=String(localStorage.getItem('pg-ai-base')||'').replace(/\/$/,'');
  $('#aiBackend').textContent=apiBase?`Backend V1.4.7 : ${apiBase}`:'Backend AI non relié';
}

function renderDraft(pack){
  if(!pack){$('#draft').textContent='Aucun brouillon.';return}
  $('#draft').innerHTML=`<h3>${esc(pack.title)}</h3><p>${esc(pack.start)} → ${esc(pack.end)} · ${pack.travelers||1} voyageur(s)</p>${(pack.days||[]).map(d=>`<div class="draft-day"><strong>${esc(d.label||d.date)}</strong>${(d.events||[]).map(e=>`<div><time>${esc(e.time)}</time> ${esc(e.title)}</div>`).join('')}</div>`).join('')}`;
}

function renderTechnical(structural,det=null){
  const lines=[`Structure: ${structural.valid?'PASS':'FAIL'}`,`Erreurs structurelles: ${structural.errors.length}`,`Avertissements structurels: ${structural.warnings.length}`,...structural.errors.map(e=>`BLOCK ${e.code} ${e.path}: ${e.message}`)];
  if(det)lines.push(`Validator: ${det.validatorVersion}`,`Résultat déterministe: ${det.valid?'PASS':'FAIL'}`,`Bloquants: ${det.summary?.blocking??0}`,`Avertissements: ${det.summary?.warnings??0}`,`Sources joignables: ${det.summary?.sourcesReachable??0}/${det.summary?.sources??0}`,...(det.blocking||[]).map(x=>`BLOCK ${x.code} ${x.path}: ${x.message}`),...(det.warnings||[]).map(x=>`WARN ${x.code} ${x.path}: ${x.message}`));
  $('#report').textContent=lines.join('\n');
  $('#validationSources').innerHTML=(det?.sources||[]).map(s=>`<div class="source"><strong>${s.reachable&&s.blocking.length===0?'✅':'❌'} ${esc(s.name||s.id)}</strong><small>${esc(s.sourceLabel||'')} · HTTP ${s.httpStatus??'—'}</small><br><small>${esc(s.sourceUrl||'')}</small></div>`).join('');
}

async function autoValidate(pack){
  lastReport=null;$('#preview').disabled=true;$('#share').disabled=true;
  const structural=validateRoutePack(pack);renderTechnical(structural);
  if(!structural.valid){setReady('bad','Parcours à corriger','Le RoutePack contient une erreur structurelle.');setStatus('<strong>✕ Parcours non validé</strong>','bad');return false}
  if(!apiBase){setReady('bad','Validation indisponible','Le backend du validateur n’est pas accessible.');return false}
  setReady('work','Vérification en cours','PocketGuide contrôle automatiquement le parcours et ses sources.');
  try{
    const r=await fetch(endpoint('/api/validate-routepack'),{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({pack})});
    const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`Erreur ${r.status}`);
    lastReport=p;renderTechnical(structural,p);
    if(p.valid){setReady('ok','✓ Parcours prêt','Les contrôles automatiques sont validés.');setStatus('<strong>✓ RoutePack prêt pour PocketGuide</strong>','ok');$('#preview').disabled=false;$('#share').disabled=false;return true}
    setReady('bad','Parcours à corriger',`${p.summary?.blocking??0} contrôle(s) bloquant(s) ont échoué.`);setStatus('<strong>✕ Validation automatique refusée</strong>','bad');return false;
  }catch(e){setReady('bad','Validation impossible',String(e.message||e));setStatus('<strong>✕ Validateur indisponible</strong>','bad');return false}
}

async function showPack(pack){current=pack;$('#download').disabled=false;$('#shareUrl').value='';renderDraft(pack);await autoValidate(pack)}

async function pollPlan(taskId){
  const started=Date.now();
  while(Date.now()-started<240000){
    setStatus(`AI Planner travaille… ${Math.round((Date.now()-started)/1000)} s`,'work');
    const r=await fetch(endpoint(`/api/plan-status?id=${encodeURIComponent(taskId)}`),{cache:'no-store'});const p=await r.json().catch(()=>({}));
    if(r.status===202){await sleep(2500);continue}if(!r.ok)throw new Error(p.error||`Erreur ${r.status}`);if(p.pack){await showPack(p.pack);return}await sleep(2000)
  }
  throw new Error('La génération prend trop de temps.');
}

async function plan(){
  const prompt=$('#prompt').value.trim();if(prompt.length<8){setStatus('Décrivez un peu plus votre voyage.','bad');return}if(!apiBase){setStatus('Backend AI non relié.','bad');return}
  $('#generate').disabled=true;setReady('work','Création en cours','AI Planner prépare votre parcours.');
  try{const r=await fetch(endpoint('/api/plan'),{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({prompt,destination:$('#destination').value.trim(),timezone:$('#timezone').value.trim()||'Europe/Paris',maxPlaces:Number($('#maxPlaces').value)||6})});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`Erreur ${r.status}`);if(!p.taskId)throw new Error('Identifiant de génération absent');await pollPlan(p.taskId)}catch(e){setReady('bad','Création impossible',String(e.message||e));setStatus(`<strong>AI Planner indisponible :</strong> ${esc(e.message||e)}`,'bad')}finally{$('#generate').disabled=false}
}

function tokenKey(word=''){return String(word).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\p{L}\p{N}]+/gu,'')}
function dedupeTranscript(text=''){const words=String(text).trim().replace(/\s+/g,' ').split(' ').filter(Boolean);let changed=true,pass=0;while(changed&&pass++<8){changed=false;outer:for(let size=Math.min(12,Math.floor(words.length/2));size>=2;size--){for(let i=0;i+size*2<=words.length;i++){let same=true;for(let j=0;j<size;j++)if(tokenKey(words[i+j])!==tokenKey(words[i+size+j])){same=false;break}if(same){words.splice(i+size,size);changed=true;break outer}}}}return words.join(' ')}
function appendTranscript(text){const clean=dedupeTranscript(text);if(!clean)return;const box=$('#prompt');box.value=[box.value.trim(),clean].filter(Boolean).join(box.value.trim()?' ':'');box.focus();setVoice('✓ Dictée nettoyée et insérée.','ok')}
function browserSpeech(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)throw new Error('Reconnaissance vocale navigateur indisponible.');const rec=new SR();speechRec=rec;rec.lang='fr-FR';rec.interimResults=true;rec.continuous=false;let final='',interim='';rec.onstart=()=>{$('#mic').classList.add('recording');$('#mic').textContent='■ Arrêter';setVoice('● Je vous écoute…','recording')};rec.onresult=e=>{for(let i=0;i<e.results.length;i++){const t=String(e.results[i][0]?.transcript||'').trim();if(e.results[i].isFinal)final=[final,t].filter(Boolean).join(' ');else interim=t}setVoice(`« ${dedupeTranscript(final||interim)} »`,'work')};rec.onerror=e=>setVoice(e.error==='not-allowed'?'Autorisation micro refusée.':`Dictée interrompue : ${e.error}`,'bad');rec.onend=()=>{speechRec=null;$('#mic').classList.remove('recording');$('#mic').textContent='🎙️ Parler';appendTranscript(final||interim)};rec.start()}
async function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
async function recordFallback(){stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());$('#mic').classList.remove('recording');$('#mic').textContent='🎙️ Parler';try{const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'}),audio=await blobToBase64(blob);const r=await fetch(endpoint('/api/transcribe'),{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({audio,mimeType:blob.type})});const p=await r.json();if(!r.ok)throw new Error(p.error||'Transcription impossible');appendTranscript(p.text)}catch(e){setVoice(String(e.message||e),'bad')}};recorder.start();$('#mic').classList.add('recording');$('#mic').textContent='■ Arrêter';setVoice('● Enregistrement…','recording')}
async function toggleVoice(){if(speechRec){try{speechRec.stop()}catch{}return}if(recorder?.state==='recording'){recorder.stop();return}try{if(window.SpeechRecognition||window.webkitSpeechRecognition){browserSpeech();return}if(apiBase&&navigator.mediaDevices?.getUserMedia&&window.MediaRecorder){await recordFallback();return}throw new Error('Aucun moteur vocal compatible.')}catch(e){setVoice(String(e.message||e),'bad')}}

$('#mic').onclick=toggleVoice;
$('#generate').onclick=plan;
$('#example').onclick=()=>{$('#prompt').value='Je souhaite une balade incontournable à Porto-Vecchio cet après-midi, avec 6 lieux remarquables, peu de marche et un rythme tranquille.';$('#destination').value='Porto-Vecchio'};
$('#importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{await showPack(JSON.parse(await f.text()))}catch(err){setStatus(`<strong>JSON invalide :</strong> ${esc(err.message||err)}`,'bad')}};
$('#preview').onclick=()=>{if(!current||!lastReport?.valid)return;try{location.href=packHandoffUrl(current,location,sessionStorage)}catch(e){setStatus(`<strong>Ouverture impossible :</strong> ${esc(e.message||e)}`,'bad')}};
$('#share').onclick=async()=>{if(!current||!lastReport?.valid)return;try{const url=packShareUrl(current,location);if(url.length>12000)throw new Error('Parcours trop volumineux pour un lien autonome. Utilisez Télécharger JSON.');$('#shareUrl').value=url;await navigator.clipboard?.writeText(url)}catch(e){$('#shareUrl').value=String(e.message||e)}};
$('#download').onclick=()=>{if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${current.id}.routepack.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};

await loadConfig();

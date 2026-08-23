import {validateRoutePack} from '../engine/routepack.js';
import {packShareUrl,packHandoffUrl} from './route-runtime.js';

const $=s=>document.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,lastReport=null,currentStructuralValid=false,apiBase='';

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function setStatus(text,type=''){const el=$('#status');if(!el)return;el.className=type;el.innerHTML=text}
function setReady(mode,title,text){const box=$('#readyState');if(!box)return;box.className=`readybox ${mode==='ok'?'okbox':mode==='bad'?'badbox':mode==='work'?'workbox':''}`;box.innerHTML=`<strong>${esc(title)}</strong><span>${esc(text)}</span>`}
function endpoint(path){return`${apiBase}${path}`}

async function checkBackend(){
  if(!apiBase)return;
  try{
    const r=await fetch(endpoint('/api/health'),{cache:'no-store'}),h=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    if(h.openaiConfigured){$('#aiBackend').textContent=`✓ Backend V1.4.7 prêt · ${h.plannerModel||'OpenAI'}`;$('#aiBackend').className='ok'}
    else{$('#aiBackend').textContent='Backend joignable, mais OpenAI n’est pas configuré.';$('#aiBackend').className='bad'}
  }catch{$('#aiBackend').textContent=`Backend Vercel injoignable : ${apiBase}`;$('#aiBackend').className='bad'}
}

async function loadConfig(){
  try{const cfg=await fetch('./data/ai-config.json?v=1.4.7-soft',{cache:'no-store'}).then(r=>r.ok?r.json():null);apiBase=String(cfg?.apiBase||'').replace(/\/$/,'')}catch{}
  const q=new URLSearchParams(location.search).get('api');if(q){apiBase=q.replace(/\/$/,'');localStorage.setItem('pg-ai-base',apiBase)}
  if(!apiBase)apiBase=String(localStorage.getItem('pg-ai-base')||'').replace(/\/$/,'');
  $('#aiBackend').textContent=apiBase?`Test du backend sécurisé : ${apiBase}`:'Backend AI non relié — la dictée reste disponible.';
  if(apiBase)await checkBackend();
}

function renderDraft(pack){
  if(!pack){$('#draft').textContent='Aucun brouillon.';return}
  $('#draft').innerHTML=`<h3>${esc(pack.title)}</h3><p>${esc(pack.start)} → ${esc(pack.end)} · ${pack.travelers||1} voyageur(s)</p>${(pack.days||[]).map(d=>`<div class="draft-day"><strong>${esc(d.label||d.date)}</strong>${(d.events||[]).map(e=>`<div><time>${esc(e.time)}</time> ${esc(e.title)} <small>· ${esc(e.place||'')}</small></div>`).join('')}</div>`).join('')}`;
}

function renderTechnical(structural,det=null){
  const lines=[`Structure: ${structural.valid?'PASS':'FAIL'}`,`Erreurs structurelles: ${structural.errors.length}`,`Avertissements structurels: ${structural.warnings.length}`,...structural.errors.map(e=>`BLOCK ${e.code} ${e.path}: ${e.message}`)];
  if(det)lines.push(`Contrôle déterministe: ${det.valid?'PASS':'RÉSERVES'}`,`Réserves déterministes: ${det.summary?.blocking??0}`,`Avertissements: ${det.summary?.warnings??0}`,`Sources joignables: ${det.summary?.sourcesReachable??0}/${det.summary?.sources??0}`,...(det.blocking||[]).map(x=>`RESERVE ${x.code} ${x.path}: ${x.message}`),...(det.warnings||[]).map(x=>`WARN ${x.code} ${x.path}: ${x.message}`));
  $('#report').textContent=lines.join('\n');
  $('#validationSources').innerHTML=(det?.sources||[]).map(s=>`<div class="source"><strong>${s.reachable&&s.blocking.length===0?'✅':'⚠️'} ${esc(s.name||s.id)}</strong><small>${esc(s.sourceLabel||'')} · HTTP ${s.httpStatus??'—'}</small><br><small>${esc(s.sourceUrl||'')}</small></div>`).join('');
}

async function autoValidate(pack){
  lastReport=null;
  const structural=validateRoutePack(pack);
  currentStructuralValid=structural.valid;
  renderTechnical(structural);
  $('#preview').disabled=!structural.valid;
  $('#share').disabled=true;

  if(!structural.valid){
    setReady('bad','Parcours à corriger','Une erreur structurelle empêche l’ouverture dans PocketGuide.');
    setStatus('<strong>✕ Structure RoutePack invalide</strong>','bad');
    return false;
  }

  // Dès que la structure est saine, l’édition PocketGuide est autorisée.
  setReady('ok','✓ Parcours prêt pour édition','PocketGuide peut être ouvert. Le contrôle déterministe continue en arrière-plan à titre consultatif.');
  setStatus('<strong>✓ Édition PocketGuide autorisée</strong>','ok');

  if(!apiBase){
    renderTechnical(structural);
    return true;
  }

  try{
    const r=await fetch(endpoint('/api/validate-routepack'),{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({pack})});
    const p=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(p.error||`Erreur ${r.status}`);
    lastReport=p;
    renderTechnical(structural,p);

    if(p.valid){
      setReady('ok','✓ Parcours prêt','Structure valide et contrôle déterministe sans réserve bloquante.');
      setStatus('<strong>✓ Édition et partage autorisés</strong>','ok');
      $('#share').disabled=false;
    }else{
      setReady('work','Parcours prêt avec réserves',`${p.summary?.blocking??0} réserve(s) détectée(s). L’édition dans PocketGuide reste autorisée.`);
      setStatus('<strong>✓ Édition autorisée · contrôle déterministe consultatif</strong>','work');
      $('#share').disabled=true;
    }
    return true;
  }catch(e){
    setReady('work','Parcours prêt pour édition','Le contrôle déterministe est momentanément indisponible, mais il ne bloque plus l’édition.');
    setStatus('<strong>✓ Édition autorisée · contrôle déterministe indisponible</strong>','work');
    $('#share').disabled=true;
    return true;
  }
}

async function showPack(pack){
  current=pack;
  currentStructuralValid=false;
  $('#download').disabled=false;
  $('#shareUrl').value='';
  renderDraft(pack);
  await autoValidate(pack);
}

async function pollPlan(taskId){
  const started=Date.now();let attempt=0;
  while(Date.now()-started<240000){
    attempt++;setStatus(`AI Planner travaille en arrière-plan… ${Math.round((Date.now()-started)/1000)} s`,'work');
    const r=await fetch(endpoint(`/api/plan-status?id=${encodeURIComponent(taskId)}`),{cache:'no-store'});const p=await r.json().catch(()=>({}));
    if(r.status===202){await sleep(Math.min(5000,1800+attempt*180));continue}
    if(!r.ok)throw new Error(p.error||`Erreur ${r.status}`);
    if(p.pack){await showPack(p.pack);return}
    await sleep(2500);
  }
  throw new Error('La génération prend trop de temps. Réessayez dans quelques instants.');
}

async function plan(){
  const prompt=$('#prompt').value.trim();
  if(prompt.length<8){setStatus('Décrivez un peu plus votre voyage.','bad');return}
  if(!apiBase){setStatus('Le backend AI Planner n’est pas encore relié.','bad');return}
  $('#generate').disabled=true;
  setReady('work','Création en cours','AI Planner prépare votre parcours.');
  setStatus('Démarrage de la génération OpenAI…','work');
  try{
    const r=await fetch(endpoint('/api/plan'),{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({prompt,destination:$('#destination').value.trim(),timezone:$('#timezone').value.trim()||'Europe/Paris',maxPlaces:Number($('#maxPlaces').value)||6})});
    const p=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(p.error||`Erreur ${r.status}`);
    if(!p.taskId)throw new Error('Le backend n’a pas renvoyé d’identifiant de génération.');
    await pollPlan(p.taskId);
  }catch(e){
    setReady('bad','Création impossible',String(e.message||e));
    setStatus(`<strong>AI Planner indisponible :</strong> ${esc(e.message||e)}`,'bad');
    void checkBackend();
  }finally{$('#generate').disabled=false}
}

$('#generate').onclick=plan;
$('#example').onclick=()=>{$('#prompt').value='Je souhaite une balade incontournable à Porto-Vecchio cet après-midi, avec 6 lieux remarquables, peu de marche et un rythme tranquille.';$('#destination').value='Porto-Vecchio'};
$('#importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{await showPack(JSON.parse(await f.text()))}catch(err){setStatus(`<strong>JSON invalide :</strong> ${esc(err.message||err)}`,'bad')}};
$('#preview').onclick=()=>{
  if(!current||!currentStructuralValid)return;
  try{location.href=packHandoffUrl(current,location,sessionStorage)}catch(e){setStatus(`<strong>Ouverture impossible :</strong> ${esc(e.message||e)}`,'bad')}
};
$('#share').onclick=async()=>{
  if(!current||!lastReport?.valid)return;
  try{const url=packShareUrl(current,location);if(url.length>12000)throw new Error('Parcours trop volumineux pour un lien autonome. Utilisez Télécharger JSON.');$('#shareUrl').value=url;await navigator.clipboard?.writeText(url);setStatus('<strong>✓ Lien copié</strong>','ok')}catch(e){$('#shareUrl').value=String(e.message||e)}
};
$('#download').onclick=()=>{if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${current.id}.routepack.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};

await loadConfig();

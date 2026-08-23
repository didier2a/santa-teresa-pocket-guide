import {validateRoutePack} from '../engine/routepack.js';
import {packShareUrl,packHandoffUrl} from './route-runtime.js';
import {enrichRoutePackMedia} from './route-media.js';
import {listSavedRoutes,saveRoutePack,loadSavedRoute,deleteSavedRoute,renameSavedRoute} from './route-library.js';

const $=s=>document.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,currentStructuralValid=false,apiBase='',busy=false;

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function setStatus(text,type=''){const el=$('#status');if(!el)return;el.className=type;el.innerHTML=text}
function setReady(mode,title,text){const box=$('#readyState');if(!box)return;box.className=`readybox ${mode==='ok'?'okbox':mode==='bad'?'badbox':mode==='work'?'workbox':''}`;box.innerHTML=`<strong>${esc(title)}</strong><span>${esc(text)}</span>`}
function endpoint(path){return`${apiBase}${path}`}

async function checkBackend(){
  if(!apiBase)return;
  try{
    const r=await fetch(endpoint('/api/health'),{cache:'no-store'}),h=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    if(h.openaiConfigured){$('#aiBackend').textContent=`✓ Backend prêt · ${h.plannerModel||'OpenAI'}`;$('#aiBackend').className='ok'}
    else{$('#aiBackend').textContent='Backend joignable, mais OpenAI n’est pas configuré.';$('#aiBackend').className='bad'}
  }catch{$('#aiBackend').textContent=`Backend Vercel injoignable : ${apiBase}`;$('#aiBackend').className='bad'}
}

async function loadConfig(){
  try{const cfg=await fetch('./data/ai-config.json?v=1.4.8',{cache:'no-store'}).then(r=>r.ok?r.json():null);apiBase=String(cfg?.apiBase||'').replace(/\/$/,'')}catch{}
  const q=new URLSearchParams(location.search).get('api');if(q){apiBase=q.replace(/\/$/,'');localStorage.setItem('pg-ai-base',apiBase)}
  if(!apiBase)apiBase=String(localStorage.getItem('pg-ai-base')||'').replace(/\/$/,'');
  $('#aiBackend').textContent=apiBase?`Test du backend sécurisé : ${apiBase}`:'Backend AI non relié — la dictée et la bibliothèque restent disponibles.';
  if(apiBase)await checkBackend();
}

function renderDraft(pack){
  if(!pack){$('#draft').textContent='Aucun brouillon.';return}
  const mediaCount=(pack.places||[]).reduce((n,p)=>n+(Array.isArray(p.media)?p.media.length:(p.heroImage?1:0)),0);
  $('#draft').innerHTML=`<h3>${esc(pack.title)}</h3><p>${esc(pack.start)} → ${esc(pack.end)} · ${pack.travelers||1} voyageur(s) · ${(pack.places||[]).length} lieux · ${mediaCount} photo(s)</p>${(pack.days||[]).map(d=>`<div class="draft-day"><strong>${esc(d.label||d.date)}</strong>${(d.events||[]).map(e=>`<div><time>${esc(e.time)}</time> ${esc(e.title)} <small>· ${esc(e.place||'')}</small></div>`).join('')}</div>`).join('')}`;
}

function renderStructural(report){
  $('#report').textContent=[`Structure RoutePack: ${report.valid?'PASS':'FAIL'}`,`Erreurs: ${report.errors.length}`,`Avertissements: ${report.warnings.length}`,...report.errors.map(e=>`ERROR ${e.code} ${e.path}: ${e.message}`),...report.warnings.map(w=>`WARN ${w.code} ${w.path}: ${w.message}`)].join('\n');
}

function routeImage(entry){return entry.heroImage?`<img class="library-thumb" src="${esc(entry.heroImage)}" alt="" loading="lazy">`:`<div class="library-thumb library-thumb--empty">🧭</div>`}
function renderLibrary(){
  const host=$('#routeLibrary');if(!host)return;
  const items=listSavedRoutes();
  $('#libraryCount').textContent=`${items.length} itinéraire${items.length>1?'s':''} sauvegardé${items.length>1?'s':''}`;
  if(!items.length){host.innerHTML='<p class="subtle">Aucun itinéraire sauvegardé pour le moment.</p>';return}
  host.innerHTML=items.map(x=>`<article class="library-card" data-route="${esc(x.id)}">${routeImage(x)}<div class="library-body"><strong>${esc(x.label||x.title)}</strong><small>${esc(x.start||'')} ${x.end&&x.end!==x.start?`→ ${esc(x.end)}`:''} · ${x.places||0} lieux</small><div class="library-actions"><button data-action="open" class="mini">Ouvrir</button><button data-action="load" class="mini secondary">Charger</button><button data-action="rename" class="mini secondary">Renommer</button><button data-action="delete" class="mini danger">Supprimer</button></div></div></article>`).join('');
  host.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=async()=>{
    const card=btn.closest('[data-route]'),id=card?.dataset.route,action=btn.dataset.action;if(!id)return;
    if(action==='delete'){if(confirm('Supprimer cet itinéraire sauvegardé ?')){deleteSavedRoute(id);renderLibrary()}return}
    if(action==='rename'){const item=listSavedRoutes().find(x=>x.id===id);const value=prompt('Nom de l’itinéraire',item?.label||item?.title||'');if(value!==null){renameSavedRoute(id,value);renderLibrary()}return}
    const pack=loadSavedRoute(id);if(!pack)return;
    if(action==='load'){await preparePack(pack,{enrich:false,save:false});window.scrollTo({top:0,behavior:'smooth'});return}
    if(action==='open'){try{location.href=packHandoffUrl(pack,location,sessionStorage)}catch(e){setStatus(`<strong>Ouverture impossible :</strong> ${esc(e.message||e)}`,'bad')}}
  });
}

async function enrichMedia(pack){
  const destination=$('#destination').value.trim()||pack.title;
  setReady('work','Photos en cours','Recherche automatique des photos publiques Wikimedia Commons…');
  return enrichRoutePackMedia(pack,{destination,onProgress:({index,total,place})=>setStatus(`Photos ${index}/${total} · ${esc(place.name)}`,'work')});
}

async function preparePack(pack,{enrich=true,save=true}={}){
  if(busy)return;busy=true;
  try{
    const initial=validateRoutePack(pack);renderStructural(initial);
    if(!initial.valid){current=pack;currentStructuralValid=false;$('#preview').disabled=true;$('#share').disabled=true;$('#download').disabled=false;renderDraft(pack);setReady('bad','Parcours à corriger','Le RoutePack contient une erreur technique de structure.');setStatus('<strong>✕ RoutePack invalide</strong>','bad');return}
    let readyPack=pack;
    if(enrich)readyPack=await enrichMedia(pack);
    const report=validateRoutePack(readyPack);renderStructural(report);
    current=readyPack;currentStructuralValid=report.valid;
    $('#preview').disabled=!report.valid;$('#share').disabled=!report.valid;$('#download').disabled=false;$('#shareUrl').value='';
    renderDraft(readyPack);
    if(report.valid&&save){saveRoutePack(readyPack,{source:'studio-1.4.8'});renderLibrary()}
    if(report.valid){const photoPlaces=(readyPack.places||[]).filter(p=>p.heroImage).length;setReady('ok','✓ Parcours prêt',`${photoPlaces}/${(readyPack.places||[]).length} lieux illustrés · carte dynamique disponible · itinéraire sauvegardé.`);setStatus('<strong>✓ PocketGuide V1.4.8 prêt</strong>','ok');$('#guideAI')?.classList.add('is-ready')}
  }catch(e){setReady('bad','Préparation incomplète',String(e.message||e));setStatus(`<strong>Erreur :</strong> ${esc(e.message||e)}`,'bad')}
  finally{busy=false}
}

async function pollPlan(taskId){
  const started=Date.now();let attempt=0;
  while(Date.now()-started<240000){
    attempt++;setStatus(`AI Planner travaille en arrière-plan… ${Math.round((Date.now()-started)/1000)} s`,'work');
    const r=await fetch(endpoint(`/api/plan-status?id=${encodeURIComponent(taskId)}`),{cache:'no-store'});const p=await r.json().catch(()=>({}));
    if(r.status===202){await sleep(Math.min(5000,1800+attempt*180));continue}
    if(!r.ok)throw new Error(p.error||`Erreur ${r.status}`);
    if(p.pack){await preparePack(p.pack,{enrich:true,save:true});return}
    await sleep(2500);
  }
  throw new Error('La génération prend trop de temps. Réessayez dans quelques instants.');
}

async function plan(){
  const promptText=$('#prompt').value.trim();if(promptText.length<8){setStatus('Décrivez un peu plus votre voyage.','bad');return}if(!apiBase){setStatus('Le backend AI Planner n’est pas encore relié.','bad');return}
  $('#generate').disabled=true;setReady('work','Création en cours','AI Planner prépare votre parcours.');setStatus('Démarrage de la génération OpenAI…','work');
  try{
    const r=await fetch(endpoint('/api/plan'),{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({prompt:promptText,destination:$('#destination').value.trim(),timezone:$('#timezone').value.trim()||'Europe/Paris',maxPlaces:Number($('#maxPlaces').value)||6})});
    const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`Erreur ${r.status}`);if(!p.taskId)throw new Error('Le backend n’a pas renvoyé d’identifiant de génération.');await pollPlan(p.taskId)
  }catch(e){setReady('bad','Création impossible',String(e.message||e));setStatus(`<strong>AI Planner indisponible :</strong> ${esc(e.message||e)}`,'bad');void checkBackend()}finally{$('#generate').disabled=false}
}

function openGuideV2(){
  try{
    if(current&&currentStructuralValid){
      sessionStorage.setItem('pg-route-handoff-v1',JSON.stringify(current));
      const url=new URL('v2.html',location.href);url.searchParams.set('handoff','local');location.href=url.toString();return;
    }
    const route=new URLSearchParams(location.search).get('route')||'bonifacio-demo';
    const url=new URL('v2.html',location.href);url.searchParams.set('route',route);location.href=url.toString();
  }catch(e){setStatus(`<strong>Guide IA indisponible :</strong> ${esc(e.message||e)}`,'bad')}
}

$('#generate').onclick=plan;
$('#example').onclick=()=>{$('#prompt').value='Je souhaite une balade incontournable à Porto-Vecchio cet après-midi, avec 6 lieux remarquables, peu de marche et un rythme tranquille.';$('#destination').value='Porto-Vecchio'};
$('#importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{await preparePack(JSON.parse(await f.text()),{enrich:true,save:true})}catch(err){setStatus(`<strong>JSON invalide :</strong> ${esc(err.message||err)}`,'bad')}};
$('#preview').onclick=()=>{if(!current||!currentStructuralValid)return;try{saveRoutePack(current,{source:'studio-1.4.8'});renderLibrary();location.href=packHandoffUrl(current,location,sessionStorage)}catch(e){setStatus(`<strong>Ouverture impossible :</strong> ${esc(e.message||e)}`,'bad')}};
$('#saveRoute').onclick=()=>{if(!current||!currentStructuralValid)return;try{saveRoutePack(current,{source:'manual'});renderLibrary();setStatus('<strong>✓ Itinéraire sauvegardé</strong>','ok')}catch(e){setStatus(`<strong>Sauvegarde impossible :</strong> ${esc(e.message||e)}`,'bad')}};
$('#share').onclick=async()=>{if(!current||!currentStructuralValid)return;try{const url=packShareUrl(current,location);if(url.length>12000)throw new Error('Parcours trop volumineux pour un lien autonome. Utilisez Télécharger JSON.');$('#shareUrl').value=url;await navigator.clipboard?.writeText(url);setStatus('<strong>✓ Lien copié</strong>','ok')}catch(e){$('#shareUrl').value=String(e.message||e)}};
$('#download').onclick=()=>{if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${current.id}.routepack.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#guideAI').onclick=openGuideV2;

await loadConfig();renderLibrary();

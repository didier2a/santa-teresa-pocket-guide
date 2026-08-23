import {validateRoutePack} from '../engine/routepack.js';
import {packShareUrl,routeShareUrl} from './route-runtime.js';

const $=s=>document.querySelector(s);
let current=null;
const MONTHS={janvier:1,fevrier:2,février:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,août:8,septembre:9,octobre:10,novembre:11,decembre:12,décembre:12};

function slug(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64)||'route'}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function ymd(y,m,d){return`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function addDays(date,n){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function daySpan(start,end){return Math.max(1,Math.round((new Date(`${end}T12:00:00Z`)-new Date(`${start}T12:00:00Z`))/86400000)+1)}
function parseDates(text){
  const clean=String(text||'');
  const isoRange=clean.match(/\b(20\d{2}-\d{2}-\d{2})\s*(?:au|à|→|-)\s*(20\d{2}-\d{2}-\d{2})\b/i);if(isoRange)return{start:isoRange[1],end:isoRange[2],days:daySpan(isoRange[1],isoRange[2])};
  const numericRange=clean.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\s*(?:au|à|→|-)\s*(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/i);if(numericRange){const start=ymd(numericRange[3],numericRange[2],numericRange[1]),end=ymd(numericRange[6],numericRange[5],numericRange[4]);return{start,end,days:daySpan(start,end)}}
  const namedRange=clean.match(/\b(?:du\s+)?(\d{1,2})\s+(?:au|à|→|-)\s+(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(20\d{2})\b/i);if(namedRange){const m=MONTHS[namedRange[3].toLowerCase()],start=ymd(namedRange[4],m,namedRange[1]),end=ymd(namedRange[4],m,namedRange[2]);return{start,end,days:daySpan(start,end)}}
  const namedSingle=clean.match(/\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(20\d{2})\b/i);if(namedSingle){const start=ymd(namedSingle[3],MONTHS[namedSingle[2].toLowerCase()],namedSingle[1]);return{start,end:start,days:1}}
  const iso=clean.match(/\b(20\d{2}-\d{2}-\d{2})\b/);if(iso)return{start:iso[1],end:iso[1],days:1};
  const fr=clean.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);if(fr){const start=ymd(fr[3],fr[2],fr[1]);return{start,end:start,days:1}}
  const start=new Date().toISOString().slice(0,10);return{start,end:start,days:1};
}
function hav(a,b){const R=6371,r=x=>x*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lng-a.lng),x=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function nearestOrder(places,center){const left=[...places],out=[];let here=center;while(left.length){let best=0;for(let i=1;i<left.length;i++)if(hav(here,left[i])<hav(here,left[best]))best=i;const next=left.splice(best,1)[0];out.push(next);here=next}return out}
function routeKm(points){let km=0;for(let i=1;i<points.length;i++)km+=hav(points[i-1],points[i]);return km}

function parsePrompt(text){
  const clean=String(text||'').trim(),dates=parseDates(clean);
  const explicit=$('#destination').value.trim();
  const destination=explicit||clean.match(/(?:\bà\b|\ba\b|\bpour\b|\bvers\b)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’ -]{2,45}?)(?=[,.]|\s+(?:du|le|pour|avec|max|pendant|sur)\b|$)/)?.[1]?.trim()||'';
  const travelers=Number(clean.match(/\b(\d{1,2})\s*(?:personnes?|voyageurs?|adultes?)\b/i)?.[1]||2);
  const statedDays=Number(clean.match(/\b(\d+)\s*jours?\b/i)?.[1]||0);const days=Math.max(1,Math.min(7,statedDays||dates.days));
  const maxKm=Number(clean.match(/(?:maximum|max|pas plus de)\s*(\d+(?:[,.]\d+)?)\s*km/i)?.[1]?.replace(',','.')||8);
  const meal=clean.match(/(?:déjeuner|manger|repas)[^\d]{0,20}(\d{1,2})\s*(?:h|:)(\d{2})?/i);const lunch=meal?`${meal[1].padStart(2,'0')}:${meal[2]||'00'}`:'13:00';
  return {destination,travelers,days,maxKm,lunch,start:dates.start,end:addDays(dates.start,days-1),prompt:clean};
}

async function geocode(query){
  const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=fr&q=${encodeURIComponent(query)}`;
  const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Géocodage indisponible');
  const rows=await r.json();if(!rows.length)throw new Error(`Destination introuvable : ${query}`);
  return {lat:Number(rows[0].lat),lng:Number(rows[0].lon),label:rows[0].display_name};
}
async function wikiNearby(lat,lng,limit=6){
  const qs=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'geosearch',ggsprimary:'all',ggsnamespace:'0',ggsradius:'10000',ggslimit:String(Math.min(12,limit+4)),prop:'coordinates|extracts|pageimages|info',exintro:'1',explaintext:'1',piprop:'thumbnail',pithumbsize:'900',inprop:'url'});qs.set('ggscoord',`${lat}|${lng}`);
  const r=await fetch(`https://fr.wikipedia.org/w/api.php?${qs}`);if(!r.ok)throw new Error('Découverte culturelle indisponible');const data=await r.json(),pages=Object.values(data.query?.pages||{});
  return pages.filter(p=>p.coordinates?.[0]).slice(0,limit).map((p,i)=>({id:`poi-${i+1}`,name:p.title,lat:p.coordinates[0].lat,lng:p.coordinates[0].lon,icon:'📍',description:(p.extract||'').slice(0,700),note:(p.extract||'Lieu culturel à découvrir.').split(/(?<=[.!?])\s/)[0].slice(0,180),historyShort:(p.extract||'').slice(0,260),historyLong:(p.extract||'').slice(0,900),repere:`Repérez ${p.title} dans votre environnement.`,arCue:`Orientez le téléphone vers ${p.title}.`,heroImage:p.thumbnail?.source||'',sourceLabel:'Wikipédia',sourceUrl:p.fullurl||`https://fr.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`}));
}
function minutesToTime(m){return`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
function buildDays(meta,places){
  const perDay=Math.ceil(places.length/meta.days),days=[];
  for(let d=0;d<meta.days;d++){
    const slice=places.slice(d*perDay,(d+1)*perDay);if(!slice.length)continue;let cursor=9*60+30;const events=[];
    for(const [i,p] of slice.entries()){if(cursor<13*60&&cursor+60>12*60+30)cursor=14*60;const start=cursor,end=cursor+55;events.push({id:`d${d+1}-e${i+1}`,time:minutesToTime(start),end:minutesToTime(end),title:p.name,type:'balade',place:p.name,placeId:p.id,navigationMode:'walking'});cursor=end+20}
    const date=addDays(meta.start,d),estimatedKm=routeKm(slice);days.push({date,label:`Jour ${d+1} · ${date}`,subtitle:`Parcours ${meta.destination} · ${estimatedKm.toFixed(1)} km à vol d’oiseau entre étapes · cible ≤ ${meta.maxKm} km`,estimatedWalkingKmLowerBound:Number(estimatedKm.toFixed(2)),events});
  }
  return days;
}
async function compilePrompt(text){
  const meta=parsePrompt(text);if(!meta.destination)throw new Error('Indiquez clairement une destination, par exemple « deux jours à Florence » ou renseignez le champ Destination.');
  setStatus('Analyse de la destination…','work');const center=await geocode(meta.destination);
  setStatus('Recherche des repères culturels…','work');const maxPlaces=Math.max(3,Math.min(10,Number($('#maxPlaces').value)||6));let places=await wikiNearby(center.lat,center.lng,maxPlaces);
  if(places.length<2)throw new Error('Pas assez de repères trouvés automatiquement. Utilisez l’import JSON ou précisez une autre destination.');places=nearestOrder(places,center);
  const days=buildDays(meta,places),overTarget=days.some(d=>d.estimatedWalkingKmLowerBound>meta.maxKm);
  return {schemaVersion:'1.0',id:slug(`${meta.destination}-${meta.start}`),title:`${meta.destination} · PocketGuide`,subtitle:'Parcours généré depuis un prompt puis soumis au validateur déterministe',timezone:$('#timezone').value.trim()||'Europe/Paris',travelers:meta.travelers,start:meta.start,end:meta.end,days,places,checklist:['Téléphone chargé','Eau','Chaussures adaptées'],offline:{map:false},meta:{createdBy:'PocketGuide Studio V1.3',generator:'prompt-discovery-v1',prompt:meta.prompt,destination:center.label,maxWalkingKmPerDay:meta.maxKm,lunchTarget:meta.lunch,walkingTargetVerified:false,walkingTargetWarning:overTarget?'La distance minimale estimée entre étapes dépasse déjà la cible sur au moins une journée.':'La cible n’est pas garantie : la distance routée réelle doit être vérifiée.',createdAt:new Date().toISOString(),notice:'Brouillon automatique : horaires d’ouverture, réservations, transports, accessibilité et distances routées doivent être vérifiés avant publication définitive.'}};
}
function setStatus(text,type=''){const el=$('#status');el.className=type;el.innerHTML=text}
function show(pack){
  current=pack;const report=validateRoutePack(pack),lines=[`valid: ${report.valid}`,`${report.errors.length} erreur(s)`,`${report.warnings.length} avertissement(s)`,`lieux: ${(pack.places||[]).length}`,`jours: ${(pack.days||[]).length}`];for(const e of report.errors)lines.push(`ERROR ${e.code} ${e.path}: ${e.message}`);for(const w of report.warnings)lines.push(`WARN ${w.code} ${w.path}: ${w.message}`);if(pack.meta?.walkingTargetWarning)lines.push(`INFO marche: ${pack.meta.walkingTargetWarning}`);
  setStatus(report.valid?'<strong>✓ RoutePack V1 valide</strong>':'<strong>✕ RoutePack invalide</strong>',report.valid?'ok':'bad');$('#report').textContent=lines.join('\n');$('#preview').disabled=!report.valid;$('#share').disabled=!report.valid;$('#download').disabled=!report.valid;$('#shareUrl').value='';renderDraft(pack);return report;
}
function renderDraft(pack){const host=$('#draft');if(!pack){host.textContent='Aucun brouillon.';return}host.innerHTML=`<h3>${esc(pack.title)}</h3><p>${esc(pack.start)} → ${esc(pack.end)} · ${pack.travelers} voyageur(s)</p>${pack.days.map(d=>`<div class="draft-day"><strong>${esc(d.label)}</strong>${d.events.map(e=>`<div><time>${e.time}</time> ${esc(e.title)}</div>`).join('')}<small>${esc(d.subtitle||'')}</small></div>`).join('')}<p class="notice">⚠ Brouillon automatique : contrôlez horaires d’ouverture, réservations, transports et distances routées avant publication.</p>`}

$('#generate').onclick=async()=>{try{setStatus('Compilation du prompt…','work');show(await compilePrompt($('#prompt').value))}catch(err){setStatus(`<strong>Impossible de générer :</strong> ${esc(err.message||err)}`,'bad');$('#report').textContent='—'}};
$('#importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{show(JSON.parse(await f.text()))}catch(err){setStatus(`<strong>JSON invalide :</strong> ${esc(err.message||err)}`,'bad')}};
$('#preview').onclick=()=>{if(current)location.href=packShareUrl(current,location)};
$('#share').onclick=async()=>{if(!current)return;try{const url=packShareUrl(current,location);if(url.length>12000)throw new Error('Parcours trop volumineux pour un lien autonome : téléchargez le JSON pour publication courte.');$('#shareUrl').value=url;await navigator.clipboard?.writeText(url);setStatus('<strong>✓ Lien copié</strong>','ok')}catch(err){$('#shareUrl').value=String(err.message||err)}};
$('#download').onclick=()=>{if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${current.id}.routepack.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#example').onclick=()=>{$('#prompt').value='Je vais à Ajaccio le 20/09/2026 avec 4 personnes pendant 1 jour. Je veux un parcours culturel tranquille, maximum 7 km de marche, déjeuner vers 13h.';$('#destination').value='Ajaccio'};
(async()=>{try{const reg=await fetch('./data/routes.json',{cache:'no-store'}).then(r=>r.json());$('#routes').innerHTML=reg.routes.filter(r=>r.enabled!==false).map(r=>`<a href="${routeShareUrl(r.id,new URL('./engine.html',location.href))}">${esc(r.title)}</a>`).join('')}catch{$('#routes').textContent='Catalogue indisponible.'}})();

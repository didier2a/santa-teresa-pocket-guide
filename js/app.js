import {
  toMinutes,
  fromMinutes,
  durationMinutes,
  isLockedEvent,
  validateDay,
  shiftFlexibleBlock,
  editEventSafely,
  recoverMinutes,
  availableShiftWindow
} from './schedule-engine.js';
import {applyV51Config} from './trip-config.js';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const data=applyV51Config(await fetch('./data/trip.json').then(r=>{if(!r.ok)throw new Error('trip.json indisponible');return r.json();}));
const tz=data.trip.timezone||'Europe/Rome';
const timeFmt=new Intl.DateTimeFormat('fr-FR',{timeZone:tz,hour:'2-digit',minute:'2-digit'});
const dateFmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
const dateTimeFmt=new Intl.DateTimeFormat('fr-FR',{timeZone:tz,dateStyle:'medium',timeStyle:'short'});
const typeIcon={transfert:'🚢',balade:'🥾',repas:'🍝',marche:'🚶',bus:'🚌',plage:'🏖️',pause:'☕'};
const placeById=Object.fromEntries((data.places||[]).map(p=>[p.id,p]));
const originalSchedule=structuredClone(data.days||[]);
const KEYS={schedule:'st-schedule-v51',legacySchedule:'st-schedule-v5',legacyScheduleV3:'st-schedule-v3',settings:'st-v51-settings',visits:'st-v5-visits',events:'st-v5-events',notes:'st-v5-notes',journey:'st-v5-journey',checklist:'st-checklist'};

let selectedDay=chooseInitialDay();
let map,routeLayer,userMarker,accuracyLayer,trailLayer,watchId=null,userPosition=null,lastTrackPoint=null;
let gpsTrail=[],editingDay=null,editingIndex=-1,deferredPrompt,toastTimer;
let proximityState={};
let settings=readJson(KEYS.settings,{audioAuto:true});
let visits=readJson(KEYS.visits,{});
let memoryEvents=readJson(KEYS.events,[]);
let notes=readJson(KEYS.notes,[]);
let journey=readJson(KEYS.journey,{distanceKm:0,startedAt:null,lastAt:null});
let lastAudioPlaceId=null,lastAudioAt=0,lastAudioPlace=null;
let memoryObjectUrls=[];

loadSchedule();

function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value))}
function chooseInitialDay(){const today=dateFmt.format(new Date());return data.days.some(d=>d.date===today)?today:data.days[0].date}
function eventDate(dayDate,time){return new Date(`${dayDate}T${time}:00+02:00`)}
function localTimeNow(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.hour}:${p.minute}`}
function showToast(text){const t=$('#toast');if(!t)return;t.textContent=text;t.classList.add('is-visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('is-visible'),3200)}
function hav(a,b){const R=6371,r=x=>x*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lng-a.lng),x=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function dist(km){return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`}
function bearing(a,b){const r=x=>x*Math.PI/180,d=x=>x*180/Math.PI,p1=r(a.lat),p2=r(b.lat),dl=r(b.lng-a.lng),y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(d(Math.atan2(y,x))+360)%360}
function compass(v){return['nord','nord-est','est','sud-est','sud','sud-ouest','ouest','nord-ouest'][Math.round(v/45)%8]}
function distanceTo(p){return userPosition?hav(userPosition,p):null}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function stripHtml(s=''){const d=document.createElement('div');d.innerHTML=String(s);return d.textContent||d.innerText||''}
function walkUrl(p){return p?.walkingUrl||`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`}
function isWalkingEvent(e){return ['marche','balade','plage','pause'].includes(e?.type)||e?.navigationMode==='walking'}
function isDrivingEvent(e){return ['bus','transfert'].includes(e?.type)||e?.navigationMode==='driving'}
function photoBadge(p){if(p.photoExact===false)return`<span class="photo-badge photo-badge--sector">${escapeHtml(p.photoLabel||'Photo du secteur')}</span>`;return`<span class="photo-badge">Photo du lieu</span>`}

function saveSchedule(){
  const payload={};
  for(const day of data.days){
    payload[day.date]=day.events.map(e=>isLockedEvent(e)?null:{time:e.time,end:e.end});
  }
  writeJson(KEYS.schedule,payload);
  window.dispatchEvent(new CustomEvent('tripstatechange',{detail:{type:'schedule'}}));
}
function loadSchedule(){
  const saved=readJson(KEYS.schedule,null)||readJson(KEYS.legacySchedule,null)||readJson(KEYS.legacyScheduleV3,{});
  for(const day of data.days){
    const source=saved?.[day.date]||[];
    source.forEach((x,i)=>{
      const e=day.events[i];
      if(!e||isLockedEvent(e)||!x?.time||!x?.end)return;
      e.time=x.time;e.end=x.end;
    });
    for(const e of day.events){
      if(isLockedEvent(e)){if(e.lockedTime)e.time=e.lockedTime;if(e.lockedEnd)e.end=e.lockedEnd;}
    }
    if(!validateDay(day).ok){
      const original=originalSchedule.find(d=>d.date===day.date);
      if(original)day.events.forEach((e,i)=>{e.time=original.events[i].time;e.end=original.events[i].end});
    }
  }
}
function replaceDay(updated){const i=data.days.findIndex(d=>d.date===updated.date);if(i>=0)data.days[i]=updated}
function resetDay(dayDate){const src=originalSchedule.find(d=>d.date===dayDate),dst=data.days.find(d=>d.date===dayDate);if(!src||!dst)return;dst.events.forEach((e,i)=>{e.time=src.events[i].time;e.end=src.events[i].end});saveSchedule();renderAllSchedule();showToast('Journée réinitialisée avec les contraintes fixes d’origine.')}
function currentOrNext(now=new Date()){const all=data.days.flatMap(d=>d.events.map((e,index)=>({...e,index,day:d,start:eventDate(d.date,e.time),finish:eventDate(d.date,e.end)})));return all.find(x=>now>=x.start&&now<x.finish)||all.find(x=>x.start>now)||all.at(-1)}
function renderAllSchedule(){renderLive();renderProgram();renderCompanion();renderGuide()}

function navActions(e,p,{compact=false}={}){
  if(!p)return'';
  const cls=compact?'mini-action':'nav-action';
  const walking=`<a class="${cls}" href="${walkUrl(p)}" target="_blank" rel="noreferrer" aria-label="Itinéraire à pied vers ${escapeHtml(p.name)}">${compact?'🚶':'🚶 À pied'}</a>`;
  const waze=`<a class="${cls}" href="${p.waze}" target="_blank" rel="noreferrer" aria-label="Ouvrir Waze vers ${escapeHtml(p.name)}">${compact?'W':'Waze'}</a>`;
  if(isWalkingEvent(e))return walking;
  if(isDrivingEvent(e))return waze;
  return walking+waze;
}
function renderDaySwitch(){
  $('#daySwitch').innerHTML=data.days.map((d,i)=>`<button class="${d.date===selectedDay?'is-active':''}" data-day="${d.date}" aria-pressed="${d.date===selectedDay}">Jour ${i+1} · ${d.label.replace(/^[^ ]+ /,'')}</button>`).join('');
  $$('[data-day]').forEach(b=>b.onclick=()=>{selectedDay=b.dataset.day;renderDaySwitch();renderLive();drawRoute();renderCompanion()});
}
function eventLinks(e){const p=placeById[e.placeId];return`<div class="timeline-actions">${e.calendarUrl?`<a class="mini-action" href="${e.calendarUrl}" target="_blank" rel="noreferrer" aria-label="Google Agenda">📅</a>`:''}${navActions(e,p,{compact:true})}</div>`}
function renderLive(){
  const day=data.days.find(d=>d.date===selectedDay),now=new Date();
  $('#todayTimeline').innerHTML=day.events.map(e=>{const s=eventDate(day.date,e.time),f=eventDate(day.date,e.end),p=placeById[e.placeId],dd=p?distanceTo(p):null,visited=p&&visits[p.id];return`<article class="timeline-item ${now>=s&&now<f?'is-current':''}"><div class="timeline-time">${e.time}</div><div><div class="timeline-title">${typeIcon[e.type]||'•'} ${e.title}${isLockedEvent(e)?`<span class="fixed-time">${escapeHtml(e.lockReason||'fixe')}</span>`:''}${visited?'<span class="visit-check">✓ visité</span>':''}</div><div class="timeline-place">${e.place} · jusqu’à ${e.end}${dd!==null?` · ${dist(dd)}`:''}</div></div>${eventLinks(e)}</article>`}).join('');
  renderNext();
}
function renderNext(){
  const n=currentOrNext();if(!n)return;const p=placeById[n.placeId],dd=p?distanceTo(p):null,now=new Date(),badge=now>=n.start&&now<n.finish?'Maintenant':(dateFmt.format(now)===n.day.date?'Prochaine étape':'Étape à venir');
  $('#nextCard').innerHTML=`<div class="next-card__visual" style="background-image:linear-gradient(180deg,rgba(10,32,38,.05),rgba(10,32,38,.65)),url('${p?.heroImage||''}')"></div><div class="next-card__content"><div class="next-card__badge">${badge}</div><h3>${typeIcon[n.type]||'•'} ${n.time} — ${n.title}${isLockedEvent(n)?'<span class="fixed-time">horaire verrouillé</span>':''}</h3><p>${n.place} · jusqu’à ${n.end}${dd!==null?` · ${dist(dd)} de vous`:''}</p>${p?`${photoBadge(p)}<div class="visual-hint"><strong>Repère visuel :</strong> ${p.repere||p.note}</div><div class="history-box"><strong>Repère historique :</strong> ${p.historyShort||''}</div>`:''}<div class="next-actions">${n.calendarUrl?`<a href="${n.calendarUrl}" target="_blank" rel="noreferrer">📅 Agenda</a>`:''}${p?navActions(n,p):''}${p?`<button class="ghost-action" data-open="${p.id}">Voir la fiche</button><button class="ghost-action" data-speak="${p.id}">🎧 Écouter</button>`:''}</div></div>`;
  $('[data-open]')?.addEventListener('click',e=>openPlace(e.currentTarget.dataset.open));
  $('[data-speak]')?.addEventListener('click',e=>speakPlace(placeById[e.currentTarget.dataset.speak],true));
}
function renderProgram(){
  $('#programDays').innerHTML=data.days.map((d,i)=>`<article class="day-card"><div class="day-card-head"><div><p class="kicker">Jour ${i+1}</p><h3>${d.label}</h3></div><button class="reset-mini" data-reset="${d.date}">Réinitialiser</button></div><p class="timeline-place">${d.subtitle}</p>${d.events.map((e,j)=>{const p=placeById[e.placeId];return`<div class="timeline-item timeline-item--visual"><div class="timeline-thumb">${p?`<img src="${p.heroImage}" alt="" loading="lazy" decoding="async">`:''}</div><div><div class="timeline-title">${e.time} · ${typeIcon[e.type]||'•'} ${e.title}${isLockedEvent(e)?'<span class="fixed-time">verrouillé</span>':''}</div><div class="timeline-place">${e.place} · ${e.time}–${e.end}</div></div><div class="timeline-actions">${isLockedEvent(e)?'<span class="mini-action lock-indicator" title="Horaire verrouillé" aria-label="Horaire verrouillé">🔒</span>':`<button class="mini-action" data-edit="${d.date}:${j}" aria-label="Modifier ${escapeHtml(e.title)}">✎</button>`}${p?`<button class="mini-action" data-place="${p.id}" aria-label="Voir ${escapeHtml(p.name)}">👁</button>`:''}${navActions(e,p,{compact:true})}</div></div>`}).join('')}</article>`).join('');
  $('#syncStamp').textContent='V5.1 verrouille les transports et la fin du circuit · aucune modification locale ne change Google Agenda.';
  $$('[data-edit]').forEach(b=>b.onclick=()=>{const[d,i]=b.dataset.edit.split(':');openEditor(d,+i)});$$('[data-reset]').forEach(b=>b.onclick=()=>resetDay(b.dataset.reset));$$('[data-place]').forEach(b=>b.onclick=()=>openPlace(b.dataset.place));
}
function openEditor(dayDate,index){
  const e=data.days.find(d=>d.date===dayDate)?.events[index];if(!e)return;
  if(isLockedEvent(e)){showToast(`🔒 ${e.title} est verrouillée à ${e.time}.`);return}
  editingDay=dayDate;editingIndex=index;$('#scheduleTitle').textContent=e.title;$('#schedulePlace').textContent=e.place;$('#scheduleStart').value=e.time;$('#scheduleEnd').value=e.end;$('#shiftFollowing').checked=true;$('#scheduleDialog').showModal();
}
function saveEdit(){
  const day=data.days.find(d=>d.date===editingDay),e=day?.events[editingIndex];if(!e)return;
  const ns=$('#scheduleStart').value,ne=$('#scheduleEnd').value;if(!ns||!ne)return;
  const result=editEventSafely(day,editingIndex,ns,ne,{shiftFollowing:$('#shiftFollowing').checked});
  if(!result.ok){showToast(result.message);return}
  replaceDay(result.day);saveSchedule();$('#scheduleDialog').close();renderAllSchedule();showToast(result.message);
}

function nextLockedFor(n){return n.day.events.slice(n.index+(isLockedEvent(n)?0:1)).find(isLockedEvent)||null}
function renderCompanion(){
  const n=currentOrNext();if(!n)return;const p=placeById[n.placeId],now=new Date(),distance=p?distanceTo(p):null,nextFixed=nextLockedFor(n);
  let status='Séjour à venir';if(now>=n.start&&now<n.finish)status='Étape en cours';else if(dateFmt.format(now)===n.day.date){const m=Math.round((n.start-now)/60000);status=m>0?`Départ dans ${m} min`:'À démarrer'}
  let fixedText='Aucune contrainte fixe restante';if(nextFixed){const t=eventDate(n.day.date,nextFixed.time),m=Math.round((t-now)/60000);fixedText=`${nextFixed.time} · ${nextFixed.title}${m>0?` · dans ${m} min`:''}`}
  const window=!isLockedEvent(n)?availableShiftWindow(n.day,n.index):null;
  const margin=window?.nextLocked?Math.max(0,window.maxDelta):null;
  $('#companionPanel').innerHTML=`<article class="companion-card companion-card--focus"><p class="kicker">Décision actuelle</p><h3>${typeIcon[n.type]||'•'} ${n.title}</h3><div class="companion-metric">${status}</div><p>${p?`${p.name}${distance!==null?` · ${dist(distance)} de vous`:''}`:n.place}</p>${p&&userPosition?`<div class="companion-row"><span>Direction</span><strong>${compass(bearing(userPosition,p))}</strong></div>`:''}${p?`<div class="smart-actions smart-actions--inside">${navActions(n,p)}</div>`:''}</article><article class="companion-card"><p class="kicker">Contraintes protégées</p><h3>Planning sûr</h3><div class="companion-row"><span>Prochaine contrainte</span><strong>${fixedText}</strong></div>${margin!==null?`<div class="companion-row"><span>Marge maximale</span><strong>${margin} min</strong></div>`:''}<div class="companion-row"><span>Audioguide</span><strong>${settings.audioAuto?'Automatique':'Manuel'}</strong></div><div class="companion-row"><span>Lieux visités</span><strong>${Object.keys(visits).length}/${data.places.length}</strong></div><div class="companion-row"><span>Distance GPS</span><strong>${journey.distanceKm.toFixed(1)} km</strong></div></article>`;
}
function shiftCurrent(delta){
  const n=currentOrNext();if(!n)return;if(isLockedEvent(n)){showToast(`🔒 ${n.title} reste à ${n.time}.`);return}
  const result=shiftFlexibleBlock(n.day,n.index,delta);
  if(!result.ok){showToast(result.message);return}
  replaceDay(result.day);saveSchedule();renderAllSchedule();showToast(result.message);
}
function startNow(){
  const n=currentOrNext();if(!n)return;if(isLockedEvent(n)){showToast(`🔒 ${n.title} reste à ${n.time}.`);return}
  if(dateFmt.format(new Date())!==n.day.date){showToast('« Démarrer maintenant » sera actif pendant le séjour.');return}
  const delta=toMinutes(localTimeNow())-toMinutes(n.time);if(Math.abs(delta)>240){showToast('Écart supérieur à 4 h : utilisez l’éditeur du programme.');return}
  const result=shiftFlexibleBlock(n.day,n.index,delta);
  if(!result.ok){showToast(result.message);return}
  replaceDay(result.day);saveSchedule();renderAllSchedule();showToast(result.capped?`Démarrage recalé seulement de ${result.appliedDelta} min pour ne pas manquer ${result.window.nextLocked?.title||'la contrainte fixe'}.`:'Étape démarrée maintenant ; la suite flexible a été recalée.');
}
function recover30(){
  const n=currentOrNext();if(!n)return;const result=recoverMinutes(n.day,n.index,30,15);if(!result.ok){showToast(result.message);return}replaceDay(result.day);saveSchedule();renderAllSchedule();showToast(result.message);
}

function renderPlaces(){
  $('#placesList').innerHTML=data.places.map(p=>`<article class="place place--visual"><div class="place-photo"><img src="${p.heroImage}" alt="${p.name}" loading="lazy" decoding="async">${photoBadge(p)}</div><div class="place-content"><div class="place-icon">${p.icon}</div><h3>${p.name}${visits[p.id]?'<span class="visit-check">✓ visité</span>':''}</h3><p>${p.note}</p><div class="history-snippet">${p.historyShort||''}</div><div class="place-actions"><button class="link-btn" data-place="${p.id}">Fiche</button><button class="audio-inline" data-audio-place="${p.id}">🎧 Écouter</button><a class="link-btn" href="${walkUrl(p)}" target="_blank" rel="noreferrer">🚶 À pied</a><a class="link-btn" href="${p.waze}" target="_blank" rel="noreferrer">Waze</a></div></div></article>`).join('');
  $$('[data-place]').forEach(b=>b.onclick=()=>openPlace(b.dataset.place));$$('[data-audio-place]').forEach(b=>b.onclick=()=>speakPlace(placeById[b.dataset.audioPlace],true));
}
function renderDiscover(){
  $('#discoverCards').innerHTML=(data.discover||[]).map(x=>`<article class="discover-card discover-card--photo"><img class="discover-card__bg" src="${x.image||placeById[x.placeId]?.heroImage||''}" alt="${x.title}" loading="lazy" decoding="async"><div class="discover-card__overlay"></div><div class="discover-card__inner"><div class="icon">${x.icon}</div><h3>${x.title}</h3><p>${x.text}</p></div><button data-discover="${x.placeId}" aria-label="Ouvrir ${escapeHtml(x.title)}">Ouvrir</button></article>`).join('');$$('[data-discover]').forEach(b=>b.onclick=()=>openPlace(b.dataset.discover));
}
function renderHistory(){
  const ids=['torre','faro','luna','brandali','rena','panorama'];
  $('#historyCards').innerHTML=data.places.filter(p=>ids.includes(p.id)).map(p=>`<article class="history-card"><img src="${p.heroImage}" alt="${p.name}" loading="lazy" decoding="async"><div class="history-card__body">${photoBadge(p)}<h3>${p.icon} ${p.name}</h3><p class="history-card__short">${p.historyShort||''}</p><p>${p.historyLong||''}</p><div class="place-actions"><button class="link-btn" data-history="${p.id}">Voir la fiche</button><button class="audio-inline" data-history-audio="${p.id}">🎧 Écouter</button><a class="link-btn" href="${walkUrl(p)}" target="_blank" rel="noreferrer">🚶 À pied</a></div></div></article>`).join('');$$('[data-history]').forEach(b=>b.onclick=()=>openPlace(b.dataset.history));$$('[data-history-audio]').forEach(b=>b.onclick=()=>speakPlace(placeById[b.dataset.historyAudio],true));
}
function openPlace(id){
  const p=placeById[id];if(!p)return;const dd=distanceTo(p),nearby=(p.nearbyPlaceIds||[]).map(x=>placeById[x]).filter(Boolean),photoCredit=p.photoCredit&&p.photoPage?`<p class="source-note">Photo : <a href="${p.photoPage}" target="_blank" rel="noreferrer">${escapeHtml(p.photoCredit)}</a></p>`:'';
  $('#dialogContent').innerHTML=`<div class="dialog-hero dialog-hero--photo"><img class="dialog-photo" src="${p.heroImage}" alt="${p.name}"><div class="dialog-hero__overlay"></div><div class="dialog-hero__content">${photoBadge(p)}<div class="dialog-icon">${p.icon}</div><h3>${p.name}${visits[p.id]?'<span class="visit-check">✓ visité</span>':''}</h3><p>${p.note}</p>${dd!==null?`<div class="dialog-distance">À ${dist(dd)} de votre position</div>`:''}</div></div><div class="dialog-body"><p>${p.description||p.detail||''}</p><div class="repere-box"><strong>Ce que vous voyez :</strong> ${p.arCue||p.repere||''}</div><div class="history-box"><strong>En bref :</strong> ${p.historyShort||''}</div><div class="history-box history-box--deep"><strong>Histoire :</strong> ${p.historyLong||p.detail||''}</div>${nearby.length?`<div class="nearby-links"><strong>À voir ensuite :</strong> ${nearby.map(n=>`<button class="text-chip" data-go="${n.id}">${n.name}</button>`).join('')}</div>`:''}${p.sourceUrl?`<p class="source-note">Source historique : <a href="${p.sourceUrl}" target="_blank" rel="noreferrer">${p.sourceLabel||'Source'}</a></p>`:''}${photoCredit}<div class="dialog-actions"><button class="audio-inline" data-dialog-audio="${p.id}">🎧 Écouter</button><a class="alt" href="${walkUrl(p)}" target="_blank" rel="noreferrer">🚶 À pied</a><a href="${p.waze}" target="_blank" rel="noreferrer">Waze</a><a class="alt" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noreferrer">Maps</a></div></div>`;
  $('#placeDialog').showModal();$$('[data-go]',$('#dialogContent')).forEach(b=>b.onclick=()=>openPlace(b.dataset.go));$('[data-dialog-audio]')?.addEventListener('click',()=>speakPlace(p,true));
}
function renderGuide(){
  if(!userPosition){$('#nearestPanel').hidden=true;$('#arGuidePanel').innerHTML='<div class="around-empty">Active le GPS : le commentaire du lieu le plus proche apparaîtra ici automatiquement.</div>';$('#aroundMePanel').innerHTML='<div class="around-empty">Active le suivi GPS pour classer les lieux par distance.</div>';return}
  const here=userPosition,list=data.places.map(p=>({...p,d:hav(here,p),dir:compass(bearing(here,p))})).sort((a,b)=>a.d-b.d),top=list.slice(0,4),c=top[0],n=currentOrNext(),ap=placeById[n?.placeId];
  $('#nearestPanel').hidden=false;$('#nearestPanel').innerHTML=`<h3>Les plus proches</h3>${top.map(p=>`<div class="nearest-row"><span>${p.icon} ${p.name}</span><strong>${dist(p.d)} · ${p.dir}</strong></div>`).join('')}`;
  $('#arGuidePanel').innerHTML=`<article class="ar-guide-card"><div class="ar-guide-card__photo"><img src="${c.heroImage}" alt="${c.name}">${photoBadge(c)}</div><div class="ar-guide-card__body"><div class="around-card__top"><span class="around-rank">Guide augmenté</span><strong>${dist(c.d)} · ${c.dir}</strong></div><h3>${c.icon} ${c.name}</h3><p>${c.description||c.note}</p><div class="repere-box"><strong>Ce que vous regardez :</strong> ${c.arCue||c.repere}</div><div class="history-box"><strong>Repère historique :</strong> ${c.historyShort||''}</div>${ap?`<div class="agenda-cue"><strong>Selon le programme :</strong> ${n.time} · ${n.title}${ap.id===c.id?' — vous êtes au bon endroit.':` — ${dist(hav(here,ap))} vers ${compass(bearing(here,ap))}`}</div>`:''}<div class="place-actions"><button class="link-btn" data-ar="${c.id}">Fiche complète</button><button class="audio-inline" data-ar-audio="${c.id}">🎧 Écouter</button><a class="link-btn" href="${walkUrl(c)}" target="_blank" rel="noreferrer">🚶 À pied</a></div></div></article>`;
  $('[data-ar]')?.addEventListener('click',()=>openPlace(c.id));$('[data-ar-audio]')?.addEventListener('click',()=>speakPlace(c,true));
  $('#aroundMePanel').innerHTML=top.map((p,i)=>`<article class="around-card"><div class="around-card__photo"><img src="${p.heroImage}" alt="${p.name}" loading="lazy" decoding="async">${photoBadge(p)}</div><div class="around-card__body"><div class="around-card__top"><span class="around-rank">${i?'À proximité':'Le plus proche'}</span><strong>${dist(p.d)} · ${p.dir}</strong></div><h3>${p.icon} ${p.name}</h3><p>${p.historyShort||p.note}</p><div class="place-actions"><button class="link-btn" data-around="${p.id}">Voir</button><a class="link-btn" href="${walkUrl(p)}" target="_blank" rel="noreferrer">🚶 À pied</a></div></div></article>`).join('');$$('[data-around]').forEach(b=>b.onclick=()=>openPlace(b.dataset.around));
}

function updateAudioUI(text){if($('#audioState'))$('#audioState').textContent=text;$('#audioToggle')?.classList.toggle('is-on',settings.audioAuto)}
function pickFrenchVoice(){const vs=speechSynthesis.getVoices();return vs.find(v=>/^fr-FR/i.test(v.lang))||vs.find(v=>/^fr/i.test(v.lang))||null}
function speakPlace(p,full=false){
  if(!p)return;if(!('speechSynthesis'in window)){showToast('Synthèse vocale indisponible sur ce navigateur.');return}
  const text=stripHtml(full?(p.audioLong||`${p.name}. ${p.description||''} ${p.historyShort||''} ${p.historyLong||''}`):(p.audioShort||`${p.name}. ${p.historyShort||p.description||p.note||''}`));
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='fr-FR';u.rate=.94;u.pitch=1;const v=pickFrenchVoice();if(v)u.voice=v;u.onstart=()=>{lastAudioPlace=p;updateAudioUI(`Lecture : ${p.name}`);$('#audioReplay')?.classList.add('is-speaking')};u.onend=()=>{$('#audioReplay')?.classList.remove('is-speaking');updateAudioUI(`Prêt · ${settings.audioAuto?'lecture automatique active':'mode manuel'}`)};u.onerror=()=>updateAudioUI('Lecture interrompue');speechSynthesis.speak(u);lastAudioPlace=p;lastAudioPlaceId=p.id;lastAudioAt=Date.now();
}
function toggleAudio(){settings.audioAuto=!settings.audioAuto;writeJson(KEYS.settings,settings);$('#audioToggle').textContent=settings.audioAuto?'Auto ON':'Auto OFF';updateAudioUI(settings.audioAuto?'Automatique activé':'Automatique désactivé');renderCompanion()}
function maybeAutoAudio(place){if(!settings.audioAuto||!place||!('speechSynthesis'in window))return;const now=Date.now();if(lastAudioPlaceId===place.id&&now-lastAudioAt<10*60*1000)return;speakPlace(place,false)}

function recordMemoryEvent(type,text,placeId=null,at=new Date().toISOString()){memoryEvents.push({id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,type,text,placeId,at});memoryEvents=memoryEvents.slice(-150);writeJson(KEYS.events,memoryEvents)}
function markVisited(p){if(!p)return;const now=new Date().toISOString();if(!visits[p.id]){visits[p.id]={placeId:p.id,firstAt:now,lastAt:now,count:1};writeJson(KEYS.visits,visits);recordMemoryEvent('visit',`Visite de ${p.name}`,p.id,now);showToast(`✓ ${p.name} ajouté au souvenir.`);renderPlaces();renderHistory();void renderMemory()}else{visits[p.id].lastAt=now;visits[p.id].count=(visits[p.id].count||1)+1;writeJson(KEYS.visits,visits)}}
function checkProximityAndVisits(){if(!userPosition)return;for(const p of data.places){const meters=hav(userPosition,p)*1000,arrival=p.arrivalRadius||120,near=p.proximityRadius||450;if(meters<=arrival){if(proximityState[p.id]!=='arrived'){proximityState[p.id]='arrived';markVisited(p);maybeAutoAudio(p)}}else if(meters<=near&&!proximityState[p.id]){proximityState[p.id]='near';showToast(`Vous approchez de ${p.name}.`)}}}

function initMap(){
  if(!window.L){$('#map').innerHTML='<div style="padding:24px">Carte interactive indisponible. Utilisez la carte hors ligne.</div>';return}
  map=L.map('map').setView([41.242,9.17],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  data.places.forEach(p=>L.circleMarker([p.lat,p.lng],{radius:8,weight:2,fillOpacity:.9}).addTo(map).bindPopup(`<b>${p.icon} ${p.name}</b><br>${p.note}<br><a href="${walkUrl(p)}" target="_blank">🚶 À pied</a> · <a href="${p.waze}" target="_blank">Waze</a>`));drawRoute();
}
function drawRoute(){if(!map)return;if(routeLayer)map.removeLayer(routeLayer);const r=(data.routes||[]).find(x=>x.day===selectedDay);if(!r)return;const pts=r.points.map(id=>placeById[id]).filter(Boolean).map(p=>[p.lat,p.lng]);routeLayer=L.polyline(pts,{weight:4,opacity:.72,dashArray:'10,7'}).addTo(map);if(pts.length&&!userMarker)map.fitBounds(L.latLngBounds(pts).pad(.18))}
function handlePosition(pos){
  const here={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy||99,ts:pos.timestamp};userPosition=here;
  if(!journey.startedAt)journey.startedAt=new Date().toISOString();journey.lastAt=new Date().toISOString();
  if(lastTrackPoint&&here.accuracy<=80){const step=hav(lastTrackPoint,here);if(step>=.003&&step<=.25){journey.distanceKm+=step;writeJson(KEYS.journey,journey)}}lastTrackPoint=here;
  if(map){if(!userMarker){userMarker=L.circleMarker([here.lat,here.lng],{radius:9,weight:4,fillOpacity:1,className:'live-user-marker'}).addTo(map).bindPopup('Vous êtes ici');accuracyLayer=L.circle([here.lat,here.lng],{radius:here.accuracy,weight:1,fillOpacity:.08,className:'accuracy-circle'}).addTo(map)}else{userMarker.setLatLng([here.lat,here.lng]);accuracyLayer.setLatLng([here.lat,here.lng]).setRadius(here.accuracy)}gpsTrail.push([here.lat,here.lng]);if(gpsTrail.length>150)gpsTrail.shift();if(trailLayer)map.removeLayer(trailLayer);trailLayer=L.polyline(gpsTrail,{weight:3,opacity:.5,className:'gps-trail'}).addTo(map);map.setView([here.lat,here.lng],Math.max(map.getZoom(),15))}
  $('#locateMe').textContent='■ Arrêter le suivi GPS';$('#gpsStatus').hidden=false;$('#gpsStatusText').textContent='GPS actif · moteur unique V5.1';$('#gpsMeta').textContent=`Précision ±${Math.round(here.accuracy)} m · ${timeFmt.format(new Date())} · trajet ${journey.distanceKm.toFixed(1)} km`;
  renderLive();renderGuide();renderCompanion();checkProximityAndVisits();void renderMemory();window.dispatchEvent(new CustomEvent('tripstatechange',{detail:{type:'gps',position:here}}));
}
function toggleGps(){if(!navigator.geolocation){showToast('Géolocalisation non disponible.');return}if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;$('#locateMe').textContent='◎ Démarrer le suivi GPS';$('#gpsStatusText').textContent='Suivi GPS arrêté';$('#gpsMeta').textContent='Dernière position conservée pour le guide.';showToast('Suivi GPS arrêté.');return}$('#locateMe').textContent='GPS…';$('#gpsStatus').hidden=false;$('#gpsStatusText').textContent='Recherche du signal GPS…';watchId=navigator.geolocation.watchPosition(handlePosition,err=>{showToast('Position GPS indisponible. Vérifiez l’autorisation Android.');$('#gpsStatusText').textContent='GPS indisponible';$('#gpsMeta').textContent=err.message||'Signal insuffisant.';watchId=null;$('#locateMe').textContent='◎ Démarrer le suivi GPS'},{enableHighAccuracy:true,maximumAge:1500,timeout:12000})}

function renderPlaylist(){$('#playlist').innerHTML=(data.playlist||[]).map((t,i)=>`<div class="track"><span class="track-index">${String(i+1).padStart(2,'0')}</span><div><strong>${t.artist} — ${t.title}</strong><br><small>${t.moment}</small></div><a class="play-btn" target="_blank" rel="noreferrer" href="https://www.youtube.com/results?search_query=${encodeURIComponent(t.artist+' '+t.title)}" aria-label="Écouter ${escapeHtml(t.title)}">▶</a></div>`).join('')}
function renderChecklist(){const saved=readJson(KEYS.checklist,{});$('#checklist').innerHTML=(data.checklist||[]).map((item,i)=>`<label class="check-row"><input type="checkbox" data-check="${i}" ${saved[i]?'checked':''}><span>${item}</span></label>`).join('');$$('[data-check]').forEach(c=>c.onchange=()=>{const s={};$$('[data-check]').forEach(x=>s[x.dataset.check]=x.checked);writeJson(KEYS.checklist,s)})}

function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('santa-teresa-v5',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('photos'))r.result.createObjectStore('photos',{keyPath:'id',autoIncrement:true})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function getPhotos(){try{const db=await openDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readonly'),req=tx.objectStore('photos').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}catch{return[]}}
async function addPhoto(blob,placeId){const db=await openDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite'),req=tx.objectStore('photos').add({blob,placeId,at:new Date().toISOString()});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function deletePhoto(id){const db=await openDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite'),req=tx.objectStore('photos').delete(id);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
async function compressPhoto(file){try{const bmp=await createImageBitmap(file),max=1280,scale=Math.min(1,max/Math.max(bmp.width,bmp.height)),w=Math.round(bmp.width*scale),h=Math.round(bmp.height*scale),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bmp,0,0,w,h);bmp.close();return await new Promise(resolve=>canvas.toBlob(b=>resolve(b||file),'image/jpeg',.74))}catch{return file}}
function nearestPlace(maxKm=1){if(!userPosition)return null;const list=data.places.map(p=>({p,d:hav(userPosition,p)})).sort((a,b)=>a.d-b.d);return list[0]&&list[0].d<=maxKm?list[0].p:null}
async function storageText(){try{const est=await navigator.storage?.estimate?.();if(!est?.quota)return'Stockage local actif';const used=est.usage||0;return`${(used/1048576).toFixed(1)} Mo utilisés sur ${(est.quota/1048576).toFixed(0)} Mo disponibles`}catch{return'Stockage local actif'}}
async function renderMemory(){
  const photos=await getPhotos();memoryObjectUrls.forEach(URL.revokeObjectURL);memoryObjectUrls=[];
  const visited=Object.values(visits).sort((a,b)=>new Date(a.firstAt)-new Date(b.firstAt));
  $('#memoryStats').innerHTML=`<div class="memory-stat"><strong>${visited.length}</strong><small>lieux visités</small></div><div class="memory-stat"><strong>${journey.distanceKm.toFixed(1)}</strong><small>km enregistrés</small></div><div class="memory-stat"><strong>${photos.length}</strong><small>photos personnelles</small></div><div class="memory-stat"><strong>${notes.length}</strong><small>notes de voyage</small></div>`;
  if($('#memoryStorage'))$('#memoryStorage').textContent=await storageText();
  $('#visitedPlaces').innerHTML=visited.length?visited.map(v=>{const p=placeById[v.placeId];return`<div class="visited-row"><span class="visit-icon">${p?.icon||'✓'}</span><div><strong>${p?.name||v.placeId}</strong><small>${dateTimeFmt.format(new Date(v.firstAt))}</small></div><span>✓</span></div>`}).join(''):'<p class="microcopy">Les lieux seront cochés automatiquement quand le GPS détectera votre arrivée.</p>';
  const timeline=[...memoryEvents,...notes.map(n=>({id:n.id,type:'note',text:n.text,placeId:n.placeId,at:n.at}))].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,40);
  $('#memoryTimeline').innerHTML=timeline.length?`<h3 class="subsection-title">Journal du séjour</h3>${timeline.map(e=>`<div class="memory-event"><time>${timeFmt.format(new Date(e.at))}</time><p>${e.type==='visit'?'✓ ':e.type==='photo'?'📷 ':e.type==='note'?'✎ ':''}${escapeHtml(e.text)}${e.placeId&&placeById[e.placeId]?` · <strong>${escapeHtml(placeById[e.placeId].name)}</strong>`:''}</p>${e.type==='note'?`<div class="memory-event-actions"><button data-edit-note="${e.id}" aria-label="Modifier la note">✎</button><button data-delete-note="${e.id}" aria-label="Supprimer la note">🗑</button></div>`:''}</div>`).join('')}`:'';
  $('#memoryGallery').innerHTML=photos.map(ph=>{const u=URL.createObjectURL(ph.blob);memoryObjectUrls.push(u);const p=placeById[ph.placeId];return`<article class="memory-photo"><img src="${u}" alt="Souvenir" loading="lazy"><div><strong>${escapeHtml(p?.name||'Souvenir libre')}</strong><small>${dateTimeFmt.format(new Date(ph.at))}</small><button class="memory-delete" data-delete-photo="${ph.id}">🗑 Supprimer</button></div></article>`}).join('');
  $$('[data-delete-photo]').forEach(b=>b.onclick=async()=>{if(!confirm('Supprimer cette photo du carnet ?'))return;await deletePhoto(Number(b.dataset.deletePhoto));recordMemoryEvent('delete','Photo supprimée du carnet');await renderMemory();showToast('Photo supprimée.')});
  $$('[data-delete-note]').forEach(b=>b.onclick=()=>{if(!confirm('Supprimer cette note ?'))return;notes=notes.filter(n=>n.id!==b.dataset.deleteNote);writeJson(KEYS.notes,notes);void renderMemory();showToast('Note supprimée.')});
  $$('[data-edit-note]').forEach(b=>b.onclick=()=>{const n=notes.find(x=>x.id===b.dataset.editNote);if(!n)return;const next=prompt('Modifier la note :',n.text);if(next===null)return;const clean=next.trim();if(!clean)return;n.text=clean;writeJson(KEYS.notes,notes);void renderMemory();showToast('Note modifiée.')});
}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
async function buildMemoryHtml(){
  const photos=await getPhotos(),embedded=[];for(const ph of photos)embedded.push({...ph,dataUrl:await blobToDataUrl(ph.blob)});
  const visited=Object.values(visits).sort((a,b)=>new Date(a.firstAt)-new Date(b.firstAt));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Souvenir Santa Teresa</title><style>body{font-family:system-ui;margin:0;background:#fffaf3;color:#15343b}.hero{padding:48px 24px;background:#103f4a;color:white}.wrap{max-width:900px;margin:auto;padding:24px}h1{font-size:42px;margin:0 0 8px}.stats{display:flex;gap:10px;flex-wrap:wrap}.stat,.card{background:white;padding:14px;border-radius:16px}.grid,.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.photos img{width:100%;border-radius:16px}@media(max-width:650px){.grid,.photos{grid-template-columns:1fr}}</style><div class="hero"><div class="wrap"><h1>Santa Teresa · notre voyage</h1><p>17–18 septembre 2026 · Carnet créé avec Pocket Guide V5.1</p></div></div><main class="wrap"><div class="stats"><div class="stat"><strong>${visited.length}</strong><br>lieux visités</div><div class="stat"><strong>${journey.distanceKm.toFixed(1)} km</strong><br>parcourus</div><div class="stat"><strong>${embedded.length}</strong><br>photos</div><div class="stat"><strong>${notes.length}</strong><br>notes</div></div><h2>Lieux visités</h2><div class="grid">${visited.map(v=>{const p=placeById[v.placeId];return`<div class="card"><h3>${escapeHtml(p?.name||v.placeId)}</h3><p>${escapeHtml(p?.historyShort||'')}</p><small>${escapeHtml(dateTimeFmt.format(new Date(v.firstAt)))}</small></div>`}).join('')}</div><h2>Nos notes</h2>${notes.map(n=>`<div class="card"><p>${escapeHtml(n.text)}</p><small>${n.placeId&&placeById[n.placeId]?escapeHtml(placeById[n.placeId].name)+' · ':''}${escapeHtml(dateTimeFmt.format(new Date(n.at)))}</small></div>`).join('')}<h2>Nos photos</h2><div class="photos">${embedded.map(ph=>`<figure><img src="${ph.dataUrl}" alt="Souvenir"><figcaption>${escapeHtml(placeById[ph.placeId]?.name||'Santa Teresa')} · ${escapeHtml(dateTimeFmt.format(new Date(ph.at)))}</figcaption></figure>`).join('')}</div></main></html>`;
}
async function exportMemory(share=false){const html=await buildMemoryHtml(),file=new File([html],'souvenir-santa-teresa-v51.html',{type:'text/html'});if(share&&navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:'Souvenir Santa Teresa',text:'Notre carnet de voyage Santa Teresa',files:[file]});return}catch{}}const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);showToast('Carnet souvenir exporté.')}

async function runDiagnostics(){
  const host=$('#diagnosticResults');if(!host)return;host.innerHTML='<p class="microcopy">Diagnostic en cours…</p>';
  const checks=[];
  const add=(name,ok,detail)=>checks.push({name,ok,detail});
  add('HTTPS / contexte sécurisé',window.isSecureContext,window.isSecureContext?'OK':'Requis pour GPS et PWA');
  add('Service worker','serviceWorker'in navigator,'serviceWorker'in navigator?'Disponible':'Non disponible');
  add('Géolocalisation','geolocation'in navigator,'geolocation'in navigator?'Disponible':'Non disponible');
  add('Audioguide','speechSynthesis'in window,'speechSynthesis'in window?'Synthèse vocale disponible':'Non disponible');
  add('IndexedDB','indexedDB'in window,'indexedDB'in window?'Carnet photo disponible':'Non disponible');
  add('Installation PWA',window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,window.matchMedia('(display-mode: standalone)').matches?'Application installée':'Mode navigateur — installation recommandée');
  const invalid=data.days.flatMap(d=>validateDay(d).issues.map(i=>`${d.date}: ${i.message}`));
  add('Planning sans chevauchement',invalid.length===0,invalid.length?invalid.join(' · '):'Tous les horaires sont cohérents');
  const locked=data.days.flatMap(d=>d.events.filter(isLockedEvent));
  add('Contraintes horaires',locked.every(e=>(!e.lockedTime||e.time===e.lockedTime)&&(!e.lockedEnd||e.end===e.lockedEnd)),`${locked.length} contrainte(s) verrouillée(s)`);
  const estimate=await storageText();add('Stockage local',true,estimate);
  add('Connexion',navigator.onLine,navigator.onLine?'En ligne — photos/cartes peuvent se mettre à jour':'Hors ligne — carte illustrée disponible');
  host.innerHTML=checks.map(c=>`<div class="diagnostic-row ${c.ok?'is-ok':'is-warn'}"><span>${c.ok?'✓':'!'}</span><div><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.detail)}</small></div></div>`).join('');
}

function updateNetwork(){const online=navigator.onLine;$('#networkBadge').textContent=online?'● En ligne':'● Hors ligne';$('#networkBadge').classList.toggle('is-offline',!online)}
function updateCountdown(){const start=eventDate(data.trip.start,'00:00'),now=new Date(),ms=start-now;let text='Terminé';if(ms>0){const d=Math.ceil(ms/86400000);text=d===1?'1 jour':`${d} jours`}else if(now<eventDate(data.trip.end,'23:59'))text='En cours';$('#countdownValue').textContent=text}
function tick(){$('#localClock').textContent=timeFmt.format(new Date());renderNext();renderCompanion()}
function initMapTabs(){
  $$('.map-tab').forEach((b,i)=>{b.setAttribute('role','tab');b.setAttribute('aria-selected',String(b.classList.contains('is-active')));b.setAttribute('tabindex',b.classList.contains('is-active')?'0':'-1');b.onclick=()=>{$$('.map-tab').forEach(x=>{x.classList.remove('is-active');x.setAttribute('aria-selected','false');x.setAttribute('tabindex','-1')});b.classList.add('is-active');b.setAttribute('aria-selected','true');b.setAttribute('tabindex','0');const off=b.dataset.mapMode==='offline';$('#interactiveMapPanel').hidden=off;$('#offlineMapPanel').hidden=!off;if(!off&&map)setTimeout(()=>map.invalidateSize(),50)}});
  $('.map-tabs')?.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;const tabs=$$('.map-tab'),current=tabs.indexOf(document.activeElement);if(current<0)return;const next=e.key==='ArrowRight'?(current+1)%tabs.length:(current-1+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus()});
}
function initScrollNav(){const links=$$('.bottom-nav a'),sections=links.map(a=>$(a.getAttribute('href'))).filter(Boolean);const io=new IntersectionObserver(es=>{const hit=es.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(hit)links.forEach(a=>a.classList.toggle('is-active',a.getAttribute('href')===`#${hit.target.id}`))},{threshold:[.2,.45,.65],rootMargin:'-15% 0 -55%'});sections.forEach(s=>io.observe(s))}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e});
$('#installApp').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else showToast('Dans Chrome : menu ⋮ → Ajouter à l’écran d’accueil / Installer l’application.')};
$('#shareTrip').onclick=async()=>{const payload={title:data.trip.title,text:'Santa Teresa Pocket Guide V5.1',url:location.href};if(navigator.share){try{await navigator.share(payload);return}catch{}}await navigator.clipboard?.writeText(location.href);showToast('Lien copié.')};
$('#locateMe').onclick=toggleGps;
$('#startNowBtn').onclick=startNow;$('#plus15Btn').onclick=()=>shiftCurrent(15);$('#plus30Btn').onclick=()=>shiftCurrent(30);$('#recover30Btn').onclick=recover30;
$('#audioToggle').textContent=settings.audioAuto?'Auto ON':'Auto OFF';$('#audioToggle').onclick=toggleAudio;$('#audioReplay').onclick=()=>{const p=lastAudioPlace||nearestPlace(3)||placeById[currentOrNext()?.placeId];if(p)speakPlace(p,true)};$('#audioStop').onclick=()=>{speechSynthesis?.cancel();updateAudioUI('Lecture arrêtée')};
$('[data-close-dialog]').onclick=()=>$('#placeDialog').close();$('[data-close-schedule]').onclick=()=>$('#scheduleDialog').close();$('#scheduleForm').onsubmit=e=>{e.preventDefault();saveEdit()};$('#resetDay').onclick=()=>{if(editingDay){resetDay(editingDay);$('#scheduleDialog').close()}};
$('#memoryPhotoInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;showToast('Préparation de la photo…');const blob=await compressPhoto(file),p=nearestPlace(1);await addPhoto(blob,p?.id||null);recordMemoryEvent('photo','Photo ajoutée au carnet',p?.id||null);e.target.value='';await renderMemory();showToast('Photo ajoutée au souvenir.')};
$('#saveMemoryNote').onclick=()=>{const box=$('#memoryNote'),text=box.value.trim();if(!text)return;const p=nearestPlace(1);notes.push({id:`n-${Date.now()}`,text,placeId:p?.id||null,at:new Date().toISOString()});writeJson(KEYS.notes,notes);box.value='';void renderMemory();showToast('Note enregistrée.')};
$('#exportMemory').onclick=()=>exportMemory(false);$('#shareMemory').onclick=()=>exportMemory(true);$('#runDiagnostics')?.addEventListener('click',runDiagnostics);
$$('[data-scroll]').forEach(b=>b.onclick=()=>$(b.dataset.scroll)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);
window.addEventListener('error',e=>console.error('Pocket Guide V5.1',e.error||e.message));

renderDaySwitch();renderLive();renderCompanion();renderProgram();renderPlaces();renderDiscover();renderHistory();renderGuide();renderPlaylist();renderChecklist();void renderMemory();initMap();initMapTabs();initScrollNav();updateNetwork();updateCountdown();updateAudioUI(settings.audioAuto?'Prêt · lecture automatique active':'Prêt · mode manuel');tick();setInterval(tick,30000);
if('speechSynthesis'in window)window.speechSynthesis.onvoiceschanged=()=>{};else{$('#audioToggle').disabled=true;$('#audioReplay').disabled=true;$('#audioStop').disabled=true;updateAudioUI('Synthèse vocale indisponible')}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').then(r=>r.update()).catch(()=>{});

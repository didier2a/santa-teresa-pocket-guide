const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const data = await fetch('./data/trip.json').then(r => { if(!r.ok) throw new Error('trip.json indisponible'); return r.json(); });
const tz = data.trip.timezone || 'Europe/Rome';
const timeFmt = new Intl.DateTimeFormat('fr-FR',{timeZone:tz,hour:'2-digit',minute:'2-digit'});
const dateFmt = new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
const typeIcon = {transfert:'🚢',balade:'🥾',repas:'🍝',marche:'🚶',bus:'🚌',plage:'🏖️',pause:'☕'};
const placeById = Object.fromEntries(data.places.map(p=>[p.id,p]));
let selectedDay = chooseInitialDay();
let map;
let userMarker;
let toastTimer;

function chooseInitialDay(){
  const today=dateFmt.format(new Date());
  if(data.days.some(d=>d.date===today)) return today;
  return data.days[0].date;
}
function eventDate(dayDate,time){ return new Date(`${dayDate}T${time}:00+02:00`); }
function eventState(day,e,now=new Date()){
  const start=eventDate(day.date,e.time), end=eventDate(day.date,e.end);
  if(now>=start && now<end) return 'current';
  if(now<start) return 'future';
  return 'past';
}
function showToast(text){ const t=$('#toast'); t.textContent=text; t.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('is-visible'),2200); }
function getEventLinks(e){
  const p=placeById[e.placeId];
  return `<div class="timeline-actions">
    ${e.calendarUrl?`<a class="mini-action" href="${e.calendarUrl}" target="_blank" rel="noreferrer" aria-label="Google Agenda">📅</a>`:''}
    ${p?`<a class="mini-action" href="${p.waze}" target="_blank" rel="noreferrer" aria-label="Waze">W</a>`:''}
  </div>`;
}
function renderDaySwitch(){
  $('#daySwitch').innerHTML=data.days.map((d,i)=>`<button class="${d.date===selectedDay?'is-active':''}" data-day="${d.date}">${i===0?'Jour 1':'Jour 2'} · ${d.label.replace(/^[A-Za-zÀ-ÿ]+\s/,'')}</button>`).join('');
  $$('#daySwitch button').forEach(b=>b.addEventListener('click',()=>{selectedDay=b.dataset.day;renderDaySwitch();renderLive();drawRoute(selectedDay);}));
}
function renderLive(){
  const day=data.days.find(d=>d.date===selectedDay);
  const now=new Date();
  $('#todayTimeline').innerHTML=day.events.map(e=>{
    const state=eventState(day,e,now);
    return `<article class="timeline-item ${state==='current'?'is-current':''}">
      <div class="timeline-time">${e.time}</div>
      <div><div class="timeline-title">${typeIcon[e.type]||'•'} ${e.title}</div><div class="timeline-place">${e.place} · jusqu’à ${e.end}</div></div>
      ${getEventLinks(e)}
    </article>`;
  }).join('');
  renderNextCard(now);
}
function renderNextCard(now=new Date()){
  const today=dateFmt.format(now);
  const all=data.days.flatMap(d=>d.events.map(e=>({day:d,...e,start:eventDate(d.date,e.time),finish:eventDate(d.date,e.end)})));
  let target=all.find(x=>now>=x.start && now<x.finish) || all.find(x=>x.start>now) || all.at(-1);
  const isCurrent=now>=target.start && now<target.finish;
  const p=placeById[target.placeId];
  let badge='Séjour à venir';
  if(isCurrent) badge='Maintenant'; else if(today===target.day.date) badge='Prochaine étape'; else if(now>eventDate(data.days.at(-1).date,'23:59')) badge='Souvenir du séjour';
  $('#nextCard').innerHTML=`<div class="next-card__badge">${badge}</div><h3>${typeIcon[target.type]||'•'} ${target.time} — ${target.title}</h3><p>${target.place} · jusqu’à ${target.end}</p><div class="next-actions">${target.calendarUrl?`<a href="${target.calendarUrl}" target="_blank" rel="noreferrer">📅 Google Agenda</a>`:''}${p?`<a href="${p.waze}" target="_blank" rel="noreferrer">W Ouvrir Waze</a>`:''}${target.detail?`<a href="#" data-event-detail="${encodeURIComponent(target.detail)}">Détails</a>`:''}</div>`;
  const detail=$('[data-event-detail]'); if(detail) detail.addEventListener('click',e=>{e.preventDefault();showToast(decodeURIComponent(detail.dataset.eventDetail));});
}
function renderProgram(){
  $('#programDays').innerHTML=data.days.map((day,i)=>`<article class="day-card"><p class="kicker">Jour ${i+1}</p><h3>${day.label}</h3><p class="timeline-place" style="margin-bottom:10px">${day.subtitle}</p>${day.events.map(e=>`<div class="timeline-item"><div class="timeline-time">${e.time}</div><div><div class="timeline-title">${typeIcon[e.type]||'•'} ${e.title}</div><div class="timeline-place">${e.place}</div></div><a class="mini-action" href="${e.calendarUrl}" target="_blank" rel="noreferrer" aria-label="Ouvrir dans Google Agenda">📅</a></div>`).join('')}</article>`).join('');
  const stamp=new Date(data.trip.sync.generatedAt);
  $('#syncStamp').textContent=`Synchronisé le ${new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeStyle:'short'}).format(stamp)} · lien direct vers chaque événement`;
}
function renderPlaces(){
  $('#placesList').innerHTML=data.places.map(p=>`<article class="place"><div class="place-icon">${p.icon}</div><h3>${p.name}</h3><p>${p.note}</p><div class="place-actions"><a class="link-btn" href="${p.waze}" target="_blank" rel="noreferrer">Waze</a><a class="link-btn" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noreferrer">Maps</a><button class="link-btn" data-place="${p.id}">Détails</button></div></article>`).join('');
  $$('[data-place]').forEach(b=>b.addEventListener('click',()=>openPlace(b.dataset.place)));
}
function renderDiscover(){
  $('#discoverCards').innerHTML=data.discover.map(x=>`<article class="discover-card"><div class="icon">${x.icon}</div><h3>${x.title}</h3><p>${x.text}</p><button data-discover="${x.placeId}" aria-label="Découvrir ${x.title}">Ouvrir</button></article>`).join('');
  $$('[data-discover]').forEach(b=>b.addEventListener('click',()=>openPlace(b.dataset.discover)));
}
function openPlace(id){
  const p=placeById[id]; if(!p) return;
  $('#dialogContent').innerHTML=`<div class="dialog-hero"><div class="dialog-icon">${p.icon}</div><h3>${p.name}</h3><p>${p.note}</p></div><div class="dialog-body"><p>${p.detail}</p><div class="dialog-actions"><a href="${p.waze}" target="_blank" rel="noreferrer">Ouvrir Waze</a><a class="alt" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noreferrer">Google Maps</a></div></div>`;
  $('#placeDialog').showModal();
}
function renderPlaylist(){
  $('#playlist').innerHTML=data.playlist.map((t,i)=>`<div class="track"><span class="track-index">${String(i+1).padStart(2,'0')}</span><div><strong>${t.artist} — ${t.title}</strong><br><small>${t.moment}</small></div><a class="play-btn" target="_blank" rel="noreferrer" href="https://www.youtube.com/results?search_query=${encodeURIComponent(t.artist+' '+t.title)}">▶</a></div>`).join('');
}
function renderChecklist(){
  const saved=JSON.parse(localStorage.getItem('st-checklist')||'{}');
  $('#checklist').innerHTML=data.checklist.map((item,i)=>`<label class="check-row"><input type="checkbox" data-check="${i}" ${saved[i]?'checked':''}/><span>${item}</span></label>`).join('');
  $$('[data-check]').forEach(c=>c.addEventListener('change',()=>{const state={};$$('[data-check]').forEach(x=>state[x.dataset.check]=x.checked);localStorage.setItem('st-checklist',JSON.stringify(state));}));
}
function initMap(){
  if(!window.L){ $('#map').innerHTML='<div style="padding:24px">Carte interactive indisponible. Utilisez l’onglet Carte hors ligne.</div>'; return; }
  map=L.map('map',{zoomControl:true}).setView([41.2418,9.1700],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  data.places.forEach(p=>L.marker([p.lat,p.lng]).addTo(map).bindPopup(`<b>${p.icon} ${p.name}</b><br>${p.note}<br><a href="${p.waze}" target="_blank">Ouvrir Waze</a>`));
  drawRoute(selectedDay);
}
function drawRoute(dayDate){
  if(!map||!window.L) return;
  if(map.routeLayer) map.removeLayer(map.routeLayer);
  const route=data.routes.find(r=>r.day===dayDate); if(!route) return;
  const pts=route.points.map(id=>placeById[id]).filter(Boolean).map(p=>[p.lat,p.lng]);
  map.routeLayer=L.polyline(pts,{weight:4,opacity:.72,dashArray:'10,7',lineCap:'round'}).addTo(map);
  if(pts.length) map.fitBounds(L.latLngBounds(pts).pad(.18));
}
function haversine(a,b){const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lng-a.lng);const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function locateMe(){
  if(!navigator.geolocation){showToast('Géolocalisation non disponible.');return;}
  $('#locateMe').textContent='Localisation…';
  navigator.geolocation.getCurrentPosition(pos=>{
    const here={lat:pos.coords.latitude,lng:pos.coords.longitude};
    if(map){if(userMarker) map.removeLayer(userMarker);userMarker=L.marker([here.lat,here.lng]).addTo(map).bindPopup('Vous êtes ici').openPopup();map.setView([here.lat,here.lng],15);}
    const nearest=data.places.map(p=>({...p,d:haversine(here,p)})).sort((a,b)=>a.d-b.d).slice(0,4);
    $('#nearestPanel').hidden=false;$('#nearestPanel').innerHTML=`<h3>Les plus proches de vous</h3>${nearest.map(p=>`<div class="nearest-row"><span>${p.icon} ${p.name}</span><strong>${p.d<1?Math.round(p.d*1000)+' m':p.d.toFixed(1)+' km'}</strong></div>`).join('')}`;
    $('#locateMe').textContent='◎ Autour de moi';showToast('Position mise à jour.');
  },()=>{$('#locateMe').textContent='◎ Autour de moi';showToast('Autorisez la géolocalisation pour utiliser cette fonction.');},{enableHighAccuracy:true,timeout:8000});
}
function updateNetwork(){const online=navigator.onLine;$('#networkBadge').textContent=online?'● En ligne':'● Hors ligne';$('#networkBadge').classList.toggle('is-offline',!online);}
function updateCountdown(){
  const start=eventDate(data.trip.start,'00:00'); const now=new Date(); const ms=start-now;
  let text='Terminé'; if(ms>0){const d=Math.ceil(ms/86400000);text=d===1?'1 jour':`${d} jours`;} else if(now<eventDate(data.trip.end,'23:59')) text='En cours';
  $('#countdownValue').textContent=text;
}
function tick(){ $('#localClock').textContent=timeFmt.format(new Date()); renderNextCard(); }
function initMapTabs(){
  $$('.map-tab').forEach(b=>b.addEventListener('click',()=>{$$('.map-tab').forEach(x=>x.classList.remove('is-active'));b.classList.add('is-active');const offline=b.dataset.mapMode==='offline';$('#interactiveMapPanel').hidden=offline;$('#offlineMapPanel').hidden=!offline;if(!offline&&map)setTimeout(()=>map.invalidateSize(),50);}));
}
function initScrollNav(){
  const links=$$('.bottom-nav a');
  const sections=links.map(a=>$(a.getAttribute('href'))).filter(Boolean);
  const io=new IntersectionObserver(entries=>{const hit=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!hit)return;links.forEach(a=>a.classList.toggle('is-active',a.getAttribute('href')===`#${hit.target.id}`));},{threshold:[.2,.45,.65],rootMargin:'-15% 0px -55%'});sections.forEach(s=>io.observe(s));
}
let deferredPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installApp').hidden=false;});
$('#installApp').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installApp').hidden=true;});
$('#shareTrip').addEventListener('click',async()=>{const payload={title:data.trip.title,text:'Guide Santa Teresa · 17–18 septembre 2026',url:location.href};if(navigator.share){try{await navigator.share(payload)}catch{}}else{await navigator.clipboard?.writeText(location.href);showToast('Lien copié.');}});
$('#locateMe').addEventListener('click',locateMe);
$('[data-close-dialog]').addEventListener('click',()=>$('#placeDialog').close());
$$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.scroll)?.scrollIntoView({behavior:'smooth'})));
window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);

renderDaySwitch();renderLive();renderProgram();renderPlaces();renderDiscover();renderPlaylist();renderChecklist();initMap();initMapTabs();initScrollNav();updateNetwork();updateCountdown();tick();setInterval(tick,30000);
if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');

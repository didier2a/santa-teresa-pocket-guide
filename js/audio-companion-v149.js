const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const data=await fetch('./data/trip.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('trip.json indisponible');return r.json()});
const places=Array.isArray(data.places)?data.places:[];
const placeById=Object.fromEntries(places.map(p=>[p.id,p]));
let apiBase='';
try{const cfg=await fetch('./data/ai-config.json?v=1.4.9',{cache:'no-store'}).then(r=>r.ok?r.json():null);apiBase=String(cfg?.apiBase||'').replace(/\/$/,'')}catch{}
let audio=null,currentUrl='',playingPlaceId='',lastAutoPlaceId='',lastAutoAt=0,lastPosition=null;
let enabled=true;
const COOLDOWN=12*60*1000;
const AUTO_RADIUS_KM=.12;

function clean(s=''){const d=document.createElement('div');d.innerHTML=String(s);return(d.textContent||d.innerText||'').replace(/\s+/g,' ').trim()}
function hav(a,b){const R=6371,r=x=>x*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lng-a.lng),q=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function nearest(pos){return places.map(p=>({p,d:hav(pos,p)})).sort((a,b)=>a.d-b.d)[0]||null}
function currentOrNext(now=new Date()){
  const all=(data.days||[]).flatMap(day=>(day.events||[]).map(e=>({day,e,start:new Date(`${day.date}T${e.time}:00`),end:new Date(`${day.date}T${e.end}:00`)}))).sort((a,b)=>a.start-b.start);
  return all.find(x=>now>=x.start&&now<x.end)||all.find(x=>x.start>now)||all.at(-1)||null;
}
function buildScript(place,{distanceKm=null,explicit=false}={}){
  const step=currentOrNext();
  const intro=distanceKm!==null&&distanceKm<.04?`Nous sommes arrivés à ${place.name}.`:`Nous approchons de ${place.name}.`;
  const history=clean(place.historyShort||place.description||place.note||'');
  const cue=clean(place.arCue||place.repere||'');
  let next='';
  if(step?.e){const same=step.e.placeId===place.id;next=same?`C’est l’étape prévue maintenant : ${clean(step.e.title)}.`:`La prochaine étape prévue est ${clean(step.e.title)} vers ${step.e.time}.`}
  const direction=cue?`Regardez autour de vous : ${cue}`:'';
  const close=explicit?'Prenez le temps d’observer. Je reste avec vous pour la suite de la balade.':'Je vous laisse profiter du lieu. Je reprendrai la parole au prochain repère.';
  return [intro,history,direction,next,close].filter(Boolean).join(' ');
}
function setState(text){const el=$('#audioState');if(el)el.textContent=text}
function ensureControls(){
  const consoleEl=$('.audio-console');if(!consoleEl)return;
  if(!$('#naturalAudioBadge')){const badge=document.createElement('small');badge.id='naturalAudioBadge';badge.textContent='Voix naturelle OpenAI · compagnon contextuel';badge.style.display='block';badge.style.marginTop='4px';badge.style.opacity='.72';consoleEl.querySelector('div div')?.append(badge)}
  const toggle=$('#audioToggle');if(toggle){toggle.textContent='Compagnon ON';toggle.classList.add('is-on')}
}
async function speak(place,{explicit=false,distanceKm=null}={}){
  if(!place||!enabled)return;
  if(!apiBase){setState('Compagnon audio : backend non relié');return}
  try{
    stop();playingPlaceId=place.id;setState(`Préparation du guide audio · ${place.name}…`);
    const text=buildScript(place,{distanceKm,explicit});
    const r=await fetch(`${apiBase}/api/tts`,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({input:text,voice:'coral',instructions:'Parle en français naturel et chaleureux, comme un guide culturel méditerranéen qui accompagne réellement des voyageurs à pied. Voix posée, fluide, expressive sans théâtralité. Débit conversationnel, petites pauses naturelles, ton complice et rassurant.'})});
    if(!r.ok){const p=await r.json().catch(()=>({}));throw new Error(p.error||`TTS ${r.status}`)}
    const blob=await r.blob();currentUrl=URL.createObjectURL(blob);audio=new Audio(currentUrl);
    audio.onplay=()=>{setState(`🎧 ${place.name} · compagnon audio en cours`);$('#audioReplay')?.classList.add('is-speaking')};
    audio.onended=()=>{setState('Compagnon audio prêt');$('#audioReplay')?.classList.remove('is-speaking');cleanupAudio()};
    audio.onerror=()=>{setState('Lecture audio impossible');$('#audioReplay')?.classList.remove('is-speaking');cleanupAudio()};
    await audio.play();
  }catch(error){setState(`Compagnon audio indisponible : ${error.message||error}`);cleanupAudio()}
}
function cleanupAudio(){if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=''}audio=null;playingPlaceId=''}
function stop(){try{audio?.pause();if(audio)audio.currentTime=0}catch{}cleanupAudio();$('#audioReplay')?.classList.remove('is-speaking')}
function onGps(pos){
  lastPosition=pos;if(!enabled||!pos)return;
  const n=nearest(pos);if(!n||n.d>AUTO_RADIUS_KM)return;
  const now=Date.now();if(n.p.id===lastAutoPlaceId&&now-lastAutoAt<COOLDOWN)return;
  lastAutoPlaceId=n.p.id;lastAutoAt=now;void speak(n.p,{distanceKm:n.d});
}
function placeFromControl(el){
  const id=el?.dataset?.speak||el?.dataset?.audioPlace||el?.dataset?.historyAudio||el?.dataset?.dialogAudio||el?.dataset?.arAudio;
  if(id&&placeById[id])return placeById[id];
  if(el?.id==='arSpeak'){
    const title=clean($('#arFocusCard h3')?.textContent||'');
    return places.find(p=>title.includes(p.name))||null;
  }
  return null;
}

// Désactive une fois l’ancien mode automatique speechSynthesis avant de prendre la main.
const legacyToggle=$('#audioToggle');
if(legacyToggle&&/Auto ON/i.test(legacyToggle.textContent||'')){try{legacyToggle.click()}catch{}}

document.addEventListener('click',e=>{
  const control=e.target.closest?.('[data-speak],[data-audio-place],[data-history-audio],[data-dialog-audio],[data-ar-audio],#arSpeak');
  if(!control)return;const p=placeFromControl(control);if(!p)return;
  e.preventDefault();e.stopImmediatePropagation();void speak(p,{explicit:true,distanceKm:lastPosition?hav(lastPosition,p):null});
},true);
$('#audioReplay')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const p=playingPlaceId?placeById[playingPlaceId]:(lastPosition?nearest(lastPosition)?.p:placeById[currentOrNext()?.e?.placeId]);if(p)void speak(p,{explicit:true,distanceKm:lastPosition?hav(lastPosition,p):null})},true);
$('#audioStop')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();stop();setState('Compagnon audio arrêté')},true);
$('#audioToggle')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();enabled=!enabled;e.currentTarget.textContent=enabled?'Compagnon ON':'Compagnon OFF';e.currentTarget.classList.toggle('is-on',enabled);if(!enabled)stop();setState(enabled?'Compagnon audio prêt':'Compagnon audio désactivé')},true);
window.addEventListener('tripstatechange',e=>{if(e.detail?.type==='gps'&&e.detail.position)onGps(e.detail.position)});
window.__POCKETGUIDE_AUDIO_COMPANION__={speak,stop,onGps,get enabled(){return enabled}};
ensureControls();setState('Compagnon audio naturel prêt · il parlera près des lieux');

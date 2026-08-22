const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const data=await fetch('./data/trip.json').then(r=>{if(!r.ok)throw new Error('trip.json indisponible');return r.json()});
const places=data.places||[];
const byId=Object.fromEntries(places.map(p=>[p.id,p]));
const DEMO_POSITION=byId.piazza?{lat:byId.piazza.lat+.00055,lng:byId.piazza.lng-.00035,accuracy:5}:{lat:41.2407,lng:9.1884,accuracy:5};

const stage=$('#arStage'),video=$('#arCamera'),labelsHost=$('#arLabels'),focusCard=$('#arFocusCard'),permission=$('#arPermission');
let stream=null,position=null,positionSource='gps',rawHeading=null,heading=null,calibrationOffset=0,orientationHandler=null;
let focused=null,target=null,audioEnabled=true,voiceCooldown={},focusCandidateId=null,focusCandidateSince=0;
let demoMode=false,xrSupported=false,arHistoryPushed=false;

function hav(a,b){const R=6371,r=x=>x*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lng-a.lng),x=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function bearing(a,b){const r=x=>x*Math.PI/180,d=x=>x*180/Math.PI,p1=r(a.lat),p2=r(b.lat),dl=r(b.lng-a.lng),y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(d(Math.atan2(y,x))+360)%360}
function deltaAngle(a,b){return((a-b+540)%360)-180}
function dist(km){return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`}
function compass(v){return['N','NE','E','SE','S','SO','O','NO'][Math.round(((v%360)+360)%360/45)%8]}
function clean(s=''){const d=document.createElement('div');d.innerHTML=String(s);return d.textContent||''}
function walkUrl(p){return`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function screenAngle(){return Number(screen.orientation?.angle??window.orientation??0)||0}
function smoothAngle(previous,next,f=.2){if(previous===null||!Number.isFinite(previous))return next;const a=previous*Math.PI/180,b=next*Math.PI/180,x=(1-f)*Math.cos(a)+f*Math.cos(b),y=(1-f)*Math.sin(a)+f*Math.sin(b);return(Math.atan2(y,x)*180/Math.PI+360)%360}
function modeLabel(){if(demoMode)return'V6 DEMO · Santa Teresa simulée';if(heading===null)return'Geo‑AR · GPS actif · cap manuel';return xrSupported?'Geo‑AR · WebXR disponible':'Geo‑AR · caméra + GPS + boussole'}
function targetInstruction(diff){const a=Math.abs(diff);if(a<7)return'Tout droit';if(diff>0)return`Tournez ${Math.round(a)}° à droite`;return`Tournez ${Math.round(a)}° à gauche`}
function haptic(ms=18){try{navigator.vibrate?.(ms)}catch{}}
function feedback(text){haptic();let n=$('.ar-feedback',focusCard);if(!n){n=document.createElement('small');n.className='ar-feedback';focusCard.append(n)}n.textContent=text;clearTimeout(feedback.timer);feedback.timer=setTimeout(()=>n?.remove(),2600)}
function setLinkEnabled(el,enabled){if(!el)return;el.classList.toggle('is-disabled',!enabled);el.setAttribute('aria-disabled',String(!enabled));if(!enabled)el.setAttribute('tabindex','-1');else el.removeAttribute('tabindex')}
function refreshControlState(){const hasFocus=Boolean(focused);$('#arTarget')&&( $('#arTarget').disabled=!hasFocus );$('#arSpeak')&&( $('#arSpeak').disabled=!hasFocus );setLinkEnabled($('#arWalk'),hasFocus);setLinkEnabled($('#arWaze'),hasFocus)}

function injectV6Controls(){
  const launch=$('#ar-explorer .ar-launch-actions');
  if(launch&&!$('#arDemo')){const b=document.createElement('button');b.type='button';b.id='arDemo';b.className='ar-launch-btn ar-launch-btn--ghost';b.textContent='◌ Démo Santa Teresa';launch.insertBefore(b,$('#arXRStatus'));b.addEventListener('click',()=>startAR({demo:true}))}
  const top=$('.ar-top',stage);
  if(top&&!$('#arCalibrate')){const b=document.createElement('button');b.type='button';b.id='arCalibrate';b.className='ar-pill';b.textContent='⌖ Calibrer';b.title='Visez un repère connu puis calibrez le cap';top.insertBefore(b,$('#arAudioToggle'));b.addEventListener('click',calibrateOnFocus)}
  const labels=$('#arLabels');
  if(labels&&!$('#arNavigationCue')){const cue=document.createElement('div');cue.id='arNavigationCue';cue.className='ar-navigation-cue';cue.hidden=true;labels.before(cue)}
  const controls=$('.ar-controls',stage);
  if(controls&&!$('#arTarget')){const b=document.createElement('button');b.type='button';b.id='arTarget';b.className='ar-control';b.textContent='➜ Cibler';b.addEventListener('click',toggleTarget);controls.insertBefore(b,$('#arSpeak'))}
  if(controls&&!$('#arLeft')){const left=document.createElement('button');left.type='button';left.id='arLeft';left.className='ar-control ar-control--dark ar-manual';left.textContent='↶ 15°';left.addEventListener('click',()=>nudgeHeading(-15));const right=document.createElement('button');right.type='button';right.id='arRight';right.className='ar-control ar-control--dark ar-manual';right.textContent='15° ↷';right.addEventListener('click',()=>nudgeHeading(15));controls.append(left,right)}
  const card=$('.ar-permission-card',stage);
  if(card&&!$('#arDemoPermission')){const b=document.createElement('button');b.type='button';b.id='arDemoPermission';b.className='ar-launch-btn ar-launch-btn--ghost';b.textContent='Tester en mode démo';b.addEventListener('click',()=>startAR({demo:true}));card.append(b)}
  $('#arXRStatus')?.setAttribute('aria-live','polite');
  $('#arWalk')?.addEventListener('click',e=>{if(!focused){e.preventDefault();feedback('Choisissez d’abord un repère dans l’image.')}});
  $('#arWaze')?.addEventListener('click',e=>{if(!focused){e.preventDefault();feedback('Choisissez d’abord un repère dans l’image.')}});
  refreshControlState();
}

window.addEventListener('tripstatechange',e=>{if(e.detail?.type==='gps'&&!demoMode){position=e.detail.position;positionSource='gps-live';renderAR()}});

async function getPositionOnce(){return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>{position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy||99};positionSource='gps';resolve(position)},reject,{enableHighAccuracy:true,maximumAge:1500,timeout:12000}))}
function ensureAppGpsTracking(){const b=$('#locateMe');if(b&&!/Arrêter|GPS…/.test(b.textContent||''))b.click()}
async function requestOrientation(){
  if(typeof DeviceOrientationEvent==='undefined')return false;
  try{
    if(typeof DeviceOrientationEvent.requestPermission==='function'){const r=await DeviceOrientationEvent.requestPermission();if(r!=='granted')return false}
    orientationHandler=e=>{
      let h=null;
      if(typeof e.webkitCompassHeading==='number'&&Number.isFinite(e.webkitCompassHeading))h=e.webkitCompassHeading;
      else if(typeof e.alpha==='number'&&Number.isFinite(e.alpha))h=(360-e.alpha+screenAngle())%360;
      if(h===null)return;rawHeading=h;heading=smoothAngle(heading,(h+calibrationOffset+360)%360,.24);renderAR()
    };
    window.addEventListener('deviceorientationabsolute',orientationHandler,true);window.addEventListener('deviceorientation',orientationHandler,true);return true
  }catch{return false}
}
async function startCamera(){stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});video.srcObject=stream;await video.play()}
function stopCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;if(video)video.srcObject=null}
function stopOrientation(){if(orientationHandler){window.removeEventListener('deviceorientationabsolute',orientationHandler,true);window.removeEventListener('deviceorientation',orientationHandler,true);orientationHandler=null}}
function cleanupAR(){stage.hidden=true;document.documentElement.style.overflow='';stopCamera();stopOrientation();speechSynthesis?.cancel();focusCandidateId=null;focusCandidateSince=0;focused=null;target=null;refreshControlState()}
function requestCloseAR(){if(arHistoryPushed){history.back()}else cleanupAR()}

async function startAR({demo=false}={}){
  if(!stage)return;demoMode=demo;stage.hidden=false;document.documentElement.style.overflow='hidden';permission.hidden=false;focused=null;target=null;refreshControlState();
  if(!arHistoryPushed){history.pushState({santaTeresaAR:true},'',location.href);arHistoryPushed=true}
  $('#arPermissionText').textContent=demo?'Mode démo : caméra réelle + position simulée au centre de Santa Teresa.':'Activation caméra, position et boussole…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Caméra non disponible');await startCamera();
    if(demo){position={...DEMO_POSITION};positionSource='demo'}else{await getPositionOnce();ensureAppGpsTracking()}
    const ori=await requestOrientation();if(!ori&&heading===null)heading=0;permission.hidden=true;$('#arModeStatus').textContent=modeLabel();$$('.ar-manual').forEach(x=>x.hidden=ori&&!demo);renderAR();feedback(demo?'Mode démo actif. Touchez un repère pour le cibler.':'AR active. Touchez un repère pour le cibler.')
  }catch(err){$('#arPermissionText').textContent=`Impossible d’activer l’AR : ${err.message||'autorisation refusée'}`}
}

function visiblePlaces(){if(!position)return[];return places.map(p=>({p,d:hav(position,p),b:bearing(position,p)})).filter(x=>x.d<=10).sort((a,b)=>a.d-b.d)}
function renderAR(){
  if(!stage||stage.hidden||!position)return;const list=visiblePlaces(),width=labelsHost.clientWidth||innerWidth,height=labelsHost.clientHeight||innerHeight,fov=68,candidates=[];labelsHost.innerHTML='';
  for(const item of list){const diff=heading===null?0:deltaAngle(item.b,heading);if(heading!==null&&Math.abs(diff)>fov/2+10)continue;const x=heading===null?width/2:(.5+diff/fov)*width,lane=candidates.length%3,depth=Math.min(1,item.d/4),y=clamp(height*(.31+lane*.12)+depth*36,66,height-68);const btn=document.createElement('button');btn.type='button';btn.className='ar-label';btn.style.left=`${x}px`;btn.style.top=`${y}px`;btn.dataset.poi=item.p.id;if(target?.id===item.p.id)btn.classList.add('is-target');btn.innerHTML=`<strong>${item.p.icon||'•'} ${item.p.name}</strong><small>${dist(item.d)} · ${compass(item.b)} ${target?.id===item.p.id?'· CIBLE':''}</small>`;btn.onclick=()=>{haptic();setFocus(item.p,false);target=item.p;refreshControlState();renderNavigationCue();renderAR()};labelsHost.appendChild(btn);candidates.push({item,btn,diff:Math.abs(diff)})}
  const best=[...candidates].sort((a,b)=>a.diff-b.diff||a.item.d-b.item.d)[0];if(best&&best.diff<9){best.btn.classList.add('is-focus');setFocus(best.item.p,true,best.diff)}else{focusCandidateId=null;focusCandidateSince=0}
  $('#arCompass').textContent=`${demoMode?'DEMO · ':''}${heading===null?'Orientation…':`${compass(heading)} · ${Math.round(heading)}°`}`;$('#arModeStatus').textContent=modeLabel();renderNavigationCue()
}
function setFocus(p,auto=false,alignment=99){
  if(!p||!position)return;focused=p;const d=hav(position,p),b=bearing(position,p);focusCard.innerHTML=`<h3>${p.icon||'•'} ${p.name}</h3><p>${clean(p.historyShort||p.description||p.note||'')}</p><div class="ar-focus-meta"><span>${dist(d)}</span><span>${compass(b)} · ${Math.round(b)}°</span></div><small class="ar-focus-note">${demoMode?'Position simulée pour test à distance.':'Maintenez le repère dans le viseur pour déclencher l’audioguide.'}</small>`;$('#arWalk').href=walkUrl(p);$('#arWalk').target='_blank';$('#arWalk').rel='noreferrer';$('#arWaze').href=p.waze||`https://www.waze.com/ul?ll=${p.lat}%2C${p.lng}&navigate=yes`;$('#arWaze').target='_blank';$('#arWaze').rel='noreferrer';refreshControlState();const targetButton=$('#arTarget');if(targetButton)targetButton.textContent=target?.id===p.id?'✓ Cible active':'➜ Cibler';if(!auto)return;const now=Date.now();if(focusCandidateId!==p.id){focusCandidateId=p.id;focusCandidateSince=now;return}const dwell=now-focusCandidateSince;if(alignment<7&&dwell>1400&&audioEnabled&&d<.35&&Date.now()-(voiceCooldown[p.id]||0)>10*60*1000){speak(p);voiceCooldown[p.id]=Date.now();focusCandidateSince=now+600000}}
function renderNavigationCue(){const cue=$('#arNavigationCue');if(!cue)return;if(!target||!position){cue.hidden=true;return}const d=hav(position,target),b=bearing(position,target),diff=heading===null?0:deltaAngle(b,heading);cue.hidden=false;cue.innerHTML=`<div class="ar-nav-arrow" style="transform:rotate(${clamp(diff,-120,120)}deg)">↑</div><div><strong>${clean(target.name)}</strong><small>${dist(d)} · ${targetInstruction(diff)} · cap ${Math.round(b)}°</small></div>`}
function toggleTarget(){if(!focused){feedback('Touchez d’abord un repère dans l’image.');return}target=target?.id===focused.id?null:focused;$('#arTarget').textContent=target?'✓ Cible active':'➜ Cibler';feedback(target?`${target.name} devient la cible.`:'Cible désactivée.');renderNavigationCue();renderAR()}
function nudgeHeading(delta){heading=((heading??0)+delta+360)%360;feedback(`Cap ajusté de ${Math.abs(delta)}° ${delta<0?'à gauche':'à droite'}.`);renderAR()}
function calibrateOnFocus(){if(!focused||!position){feedback('Touchez d’abord un repère connu.');return}if(rawHeading===null){feedback('Boussole indisponible : utilisez les boutons ±15° pour ajuster le cap.');return}const expected=bearing(position,focused);calibrationOffset=deltaAngle(expected,rawHeading);heading=expected;feedback(`Cap calibré sur ${focused.name}.`);renderAR()}
function speak(p){if(!p){feedback('Choisissez d’abord un repère.');return}if(!('speechSynthesis'in window)){feedback('Synthèse vocale indisponible.');return}const text=clean(`Vous regardez ${p.name}. ${p.historyShort||p.description||p.note||''} ${p.arCue||p.repere||''}`);speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='fr-FR';u.rate=.94;u.pitch=1;u.onerror=()=>feedback('Lecture audio interrompue.');speechSynthesis.speak(u)}

async function saveToPocketMemory(file){try{const input=$('#memoryPhotoInput');if(!input||typeof DataTransfer==='undefined')return false;const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true}catch{return false}}
async function captureAR(){if(!video.videoWidth||!video.videoHeight){feedback('La caméra n’est pas encore prête.');return}const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;const ctx=c.getContext('2d');ctx.drawImage(video,0,0,c.width,c.height);const p=target||focused;ctx.fillStyle='rgba(5,27,32,.78)';ctx.fillRect(24,24,c.width-48,78);ctx.fillStyle='#fff';ctx.font='bold 28px system-ui';ctx.fillText('Santa Teresa · Pocket Guide V6 AR',48,72);if(p){const d=position?dist(hav(position,p)):'';ctx.fillStyle='rgba(8,32,38,.84)';ctx.fillRect(24,c.height-178,c.width-48,142);ctx.fillStyle='#fff';ctx.font='bold 34px system-ui';ctx.fillText(p.name,48,c.height-124);ctx.font='24px system-ui';ctx.fillText(`${d} · ${position?compass(bearing(position,p)):''} · ${demoMode?'DEMO':'AR LIVE'}`,48,c.height-82);ctx.font='20px system-ui';ctx.fillText(new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date()),48,c.height-50)}const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));if(!blob){feedback('Impossible de créer la photo AR.');return}const file=new File([blob],`santa-teresa-v6-ar-${Date.now()}.jpg`,{type:'image/jpeg'});const saved=await saveToPocketMemory(file);if(saved){feedback('✓ Photo AR ajoutée au carnet souvenir.');return}if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:'Souvenir AR Santa Teresa',files:[file]});return}catch{}}const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);feedback('Photo AR enregistrée.')}

async function detectXR(){const host=$('#arXRStatus');if(!host)return;try{xrSupported=Boolean(navigator.xr&&await navigator.xr.isSessionSupported?.('immersive-ar'));host.textContent=xrSupported?'WebXR disponible · Geo‑AR prêt':'Geo‑AR universel actif'}catch{host.textContent='Geo‑AR universel actif'}}
function auditS22TouchTargets(){const selectors=['.bottom-nav a','.ar-control','.ar-pill','.ar-label','.mini-action','.audio-btn','.smart-action','.memory-action','.map-tab'];const tooSmall=[];for(const el of $$(selectors.join(','))){if(el.offsetParent===null)continue;const r=el.getBoundingClientRect();if(r.width<44||r.height<44)tooSmall.push(`${el.id||el.getAttribute('aria-label')||el.textContent.trim().slice(0,24)} ${Math.round(r.width)}×${Math.round(r.height)}`)}return tooSmall}
window.santaTeresaS22Audit=()=>({secureContext:window.isSecureContext,camera:Boolean(navigator.mediaDevices?.getUserMedia),geolocation:'geolocation'in navigator,orientation:typeof DeviceOrientationEvent!=='undefined',speech:'speechSynthesis'in window,standalone:matchMedia('(display-mode: standalone)').matches,touchPoints:navigator.maxTouchPoints,viewport:`${innerWidth}×${innerHeight}`,tooSmallTouchTargets:auditS22TouchTargets()});

injectV6Controls();
$('#openAR')?.addEventListener('click',()=>startAR({demo:false}));$('#openARSecondary')?.addEventListener('click',()=>startAR({demo:false}));$('#arClose')?.addEventListener('click',requestCloseAR);$('#arRetry')?.addEventListener('click',()=>startAR({demo:false}));$('#arSpeak')?.addEventListener('click',()=>speak(focused));$('#arCapture')?.addEventListener('click',captureAR);$('#arAudioToggle')?.addEventListener('click',e=>{audioEnabled=!audioEnabled;e.currentTarget.textContent=audioEnabled?'🎧 Audio auto':'🔇 Audio off';feedback(audioEnabled?'Audioguide automatique activé.':'Audioguide automatique désactivé.')});
window.addEventListener('popstate',()=>{if(!stage?.hidden){arHistoryPushed=false;cleanupAR()}});window.addEventListener('pagehide',()=>{if(!stage?.hidden){arHistoryPushed=false;cleanupAR()}});
void detectXR();

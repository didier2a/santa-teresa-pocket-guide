import {bearingDeg,compassLabel,deltaHeading,normalizeHeading,projectPlaces,simulatedPositionForPlace} from './ar-core.js';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const data=await fetch('./data/trip.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('trip.json indisponible');return r.json()});
const places=Array.isArray(data.places)?data.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)):[];
const stage=$('#arStage'),video=$('#arCamera'),labelsHost=$('#arLabels'),focusCard=$('#arFocusCard'),permission=$('#arPermission');

const state={
  active:false,mode:'idle',simulation:false,stream:null,watchId:null,position:null,heading:null,rawHeading:null,
  orientationHandler:null,orientationTimer:null,focused:null,target:null,simTimer:null,simIndex:0,historyPushed:false,
  webxrSupported:false,webxrSessionTested:false,webxrSessionOk:false,
  cameraOk:false,gpsOk:false,orientationOk:false,lastError:'',rendered:0
};

function clean(value=''){const d=document.createElement('div');d.innerHTML=String(value);return d.textContent||d.innerText||''}
function dist(km){return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`}
function screenAngle(){return Number(screen.orientation?.angle??window.orientation??0)||0}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function walkUrl(p){return p?.walkingUrl||`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`}
function haptic(ms=15){try{navigator.vibrate?.(ms)}catch{}}
function setText(selector,text){const el=$(selector);if(el)el.textContent=text}
function feedback(text){
  haptic();
  if(!focusCard)return;
  let el=$('.ar-feedback',focusCard);if(!el){el=document.createElement('small');el.className='ar-feedback';focusCard.append(el)}
  el.textContent=text;clearTimeout(feedback.timer);feedback.timer=setTimeout(()=>el?.remove(),3200);
}
function setLinkEnabled(el,enabled){if(!el)return;el.classList.toggle('is-disabled',!enabled);el.setAttribute('aria-disabled',String(!enabled));if(enabled)el.removeAttribute('tabindex');else el.setAttribute('tabindex','-1')}
function refreshControls(){const ok=Boolean(state.focused);$('#arSpeak')&&($('#arSpeak').disabled=!ok);$('#arTarget')&&($('#arTarget').disabled=!ok);setLinkEnabled($('#arWalk'),ok);setLinkEnabled($('#arWaze'),ok)}
function runtimeLabel(){
  if(state.simulation)return`SIMULATION · ${state.rendered} repère${state.rendered>1?'s':''}`;
  if(!state.active)return state.webxrSupported?'WebXR détecté · Geo‑AR inactive':'Geo‑AR inactive';
  const bits=[state.cameraOk?'caméra ✓':'caméra ✕',state.gpsOk?'GPS ✓':'GPS ✕',state.orientationOk?'cap ✓':'cap manuel'];
  return`Geo‑AR active · ${bits.join(' · ')}`;
}
function updateRuntimeUi(){
  setText('#arModeStatus',runtimeLabel());
  const badge=$('#arXRStatus');
  if(badge){
    if(state.active)badge.textContent=runtimeLabel();
    else if(state.webxrSupported)badge.textContent='WebXR détecté · Geo‑AR à démarrer';
    else badge.textContent='Geo‑AR caméra + GPS';
    badge.dataset.xrSupported=String(state.webxrSupported);
    badge.dataset.geoarActive=String(state.active);
  }
  document.documentElement.dataset.geoarActive=String(state.active);
  document.documentElement.dataset.geoarSimulation=String(state.simulation);
  document.documentElement.dataset.geoarRendered=String(state.rendered);
}
function capabilityMarkup(){
  const item=(ok,label)=>`<span class="ar-cap ${ok?'is-ok':'is-warn'}">${ok?'✓':'!'} ${label}</span>`;
  return [item(window.isSecureContext,'HTTPS'),item(Boolean(navigator.mediaDevices?.getUserMedia),'Caméra API'),item('geolocation'in navigator,'GPS API'),item(typeof DeviceOrientationEvent!=='undefined','Orientation API'),item(state.webxrSupported,'WebXR immersive-ar')].join('');
}
function updateCapabilityPanel(){const host=$('#arCapabilities');if(host)host.innerHTML=capabilityMarkup()}

async function detectWebXR(){
  try{state.webxrSupported=Boolean(await navigator.xr?.isSessionSupported?.('immersive-ar'))}catch{state.webxrSupported=false}
  updateCapabilityPanel();updateRuntimeUi();return state.webxrSupported;
}
async function testWebXRSession(){
  if(!state.webxrSupported||!navigator.xr?.requestSession){feedback('WebXR immersive-ar n’est pas disponible ici.');return false}
  const btn=$('#arWebXRTest');if(btn){btn.disabled=true;btn.textContent='Test WebXR…'}
  try{
    const session=await navigator.xr.requestSession('immersive-ar',{optionalFeatures:['local-floor']});
    state.webxrSessionTested=true;state.webxrSessionOk=true;
    await session.end();
    feedback('Session WebXR immersive-ar ouverte puis refermée avec succès.');
    return true;
  }catch(error){
    state.webxrSessionTested=true;state.webxrSessionOk=false;state.lastError=error?.message||String(error);
    feedback(`WebXR détecté mais session impossible : ${state.lastError}`);
    return false;
  }finally{if(btn){btn.disabled=false;btn.textContent='🧪 Tester WebXR'}}
}

function injectControls(){
  const launch=$('#ar-explorer .ar-launch-actions');
  if(launch&&!$('#arSimulate')){
    const sim=document.createElement('button');sim.type='button';sim.id='arSimulate';sim.className='ar-launch-btn ar-launch-btn--ghost';sim.textContent='🧪 Simuler l’AR';sim.onclick=()=>startSimulation();launch.insertBefore(sim,$('#arXRStatus'));
    const xr=document.createElement('button');xr.type='button';xr.id='arWebXRTest';xr.className='ar-launch-btn ar-launch-btn--ghost';xr.textContent='🧪 Tester WebXR';xr.onclick=testWebXRSession;launch.insertBefore(xr,$('#arXRStatus'));
  }
  const card=$('.ar-permission-card',stage);
  if(card&&!$('#arCapabilities')){
    const caps=document.createElement('div');caps.id='arCapabilities';caps.className='ar-capabilities';card.insertBefore(caps,$('#arRetry'));
    const sim=document.createElement('button');sim.type='button';sim.id='arSimulatePermission';sim.className='ar-launch-btn ar-launch-btn--ghost';sim.textContent='Simuler sans GPS réel';sim.onclick=()=>startSimulation();card.append(sim);
  }
  const top=$('.ar-top',stage);
  if(top&&!$('#arRuntime')){const r=document.createElement('span');r.id='arRuntime';r.className='ar-pill';r.textContent='AR inactive';top.insertBefore(r,$('#arAudioToggle'))}
  if(top&&!$('#arCalibrate')){const b=document.createElement('button');b.type='button';b.id='arCalibrate';b.className='ar-pill';b.textContent='⌖ Calibrer';b.onclick=calibrate;top.insertBefore(b,$('#arAudioToggle'))}
  if(top&&!$('#arSimNext')){const b=document.createElement('button');b.type='button';b.id='arSimNext';b.className='ar-pill';b.textContent='📍 Lieu suivant';b.hidden=true;b.onclick=nextSimulationPlace;top.insertBefore(b,$('#arAudioToggle'))}
  const controls=$('.ar-controls',stage);
  if(controls&&!$('#arTarget')){const b=document.createElement('button');b.type='button';b.id='arTarget';b.className='ar-control';b.textContent='➜ Cibler';b.onclick=toggleTarget;controls.insertBefore(b,$('#arSpeak'))}
  if(controls&&!$('#arLeft')){
    const left=document.createElement('button');left.type='button';left.id='arLeft';left.className='ar-control ar-control--dark';left.textContent='↶ 15°';left.onclick=()=>nudge(-15);
    const right=document.createElement('button');right.type='button';right.id='arRight';right.className='ar-control ar-control--dark';right.textContent='15° ↷';right.onclick=()=>nudge(15);controls.append(left,right);
  }
  if(labelsHost&&!$('#arNavigationCue')){const cue=document.createElement('div');cue.id='arNavigationCue';cue.className='ar-navigation-cue';cue.hidden=true;labelsHost.before(cue)}
  refreshControls();updateCapabilityPanel();
}

function openStage(){
  if(!stage)return false;
  stage.hidden=false;document.documentElement.style.overflow='hidden';
  if(!state.historyPushed){try{history.pushState({pocketGuideAR:true},'',location.href);state.historyPushed=true}catch{}}
  return true;
}
function stopCamera(){state.stream?.getTracks?.().forEach(t=>t.stop());state.stream=null;state.cameraOk=false;if(video){video.pause?.();video.srcObject=null}}
function stopGps(){if(state.watchId!==null){try{navigator.geolocation.clearWatch(state.watchId)}catch{}state.watchId=null}}
function stopOrientation(){if(state.orientationHandler){window.removeEventListener('deviceorientationabsolute',state.orientationHandler,true);window.removeEventListener('deviceorientation',state.orientationHandler,true);state.orientationHandler=null}clearTimeout(state.orientationTimer);state.orientationTimer=null;state.orientationOk=false}
function stopSimulationTimer(){clearInterval(state.simTimer);state.simTimer=null}
function cleanup({hide=true}={}){
  stopCamera();stopGps();stopOrientation();stopSimulationTimer();
  state.active=false;state.simulation=false;state.position=null;state.focused=null;state.target=null;state.rendered=0;
  stage?.classList.remove('ar-stage--simulation');if(video)video.hidden=false;
  $('#arSimNext')&&($('#arSimNext').hidden=true);refreshControls();updateRuntimeUi();
  if(hide&&stage){stage.hidden=true;document.documentElement.style.overflow=''}
}
function requestClose(){if(state.historyPushed){history.back()}else cleanup()}

async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('API caméra indisponible');
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
  state.stream=stream;if(!video)throw new Error('Élément vidéo AR absent');video.hidden=false;video.srcObject=stream;await video.play();state.cameraOk=Boolean(video.srcObject);return state.cameraOk;
}
function getPositionOnce(){return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(new Error('GPS indisponible'));return}
  navigator.geolocation.getCurrentPosition(p=>{state.position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy||99};state.gpsOk=true;resolve(state.position)},reject,{enableHighAccuracy:true,maximumAge:1000,timeout:15000});
})}
function startGpsWatch(){
  if(!navigator.geolocation||state.simulation)return;
  stopGps();
  state.watchId=navigator.geolocation.watchPosition(p=>{
    state.position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy||99};state.gpsOk=true;
    if(Number.isFinite(p.coords.heading)&&p.coords.speed>0.8&&!state.orientationOk)state.heading=normalizeHeading(p.coords.heading);
    render();
  },e=>{state.lastError=`GPS live: ${e.message||e.code}`},{enableHighAccuracy:true,maximumAge:1500,timeout:20000});
}
async function requestOrientation(){
  if(typeof DeviceOrientationEvent==='undefined')return false;
  try{
    if(typeof DeviceOrientationEvent.requestPermission==='function'){
      const result=await DeviceOrientationEvent.requestPermission();if(result!=='granted')return false;
    }
    return await new Promise(resolve=>{
      let settled=false;
      const finish=ok=>{if(settled)return;settled=true;clearTimeout(state.orientationTimer);resolve(ok)};
      state.orientationHandler=e=>{
        let h=null;
        if(Number.isFinite(e.webkitCompassHeading))h=e.webkitCompassHeading;
        else if(Number.isFinite(e.alpha))h=normalizeHeading(360-e.alpha+screenAngle());
        if(h===null)return;
        state.rawHeading=h;state.heading=normalizeHeading(h);state.orientationOk=true;finish(true);render();
      };
      window.addEventListener('deviceorientationabsolute',state.orientationHandler,true);window.addEventListener('deviceorientation',state.orientationHandler,true);
      state.orientationTimer=setTimeout(()=>finish(false),3000);
    });
  }catch(error){state.lastError=error?.message||String(error);return false}
}

async function startRealAR(){
  if(!openStage())return;
  cleanup({hide:false});state.mode='starting';state.active=true;state.simulation=false;permission.hidden=false;stage.classList.remove('ar-stage--simulation');
  setText('#arPermissionText','Activation réelle : caméra arrière…');updateRuntimeUi();
  try{
    await startCamera();setText('#arPermissionText','Caméra active · acquisition GPS…');
    await getPositionOnce();setText('#arPermissionText','GPS actif · lecture de la boussole…');
    const orientation=await requestOrientation();if(!orientation&&state.heading===null)state.heading=0;
    startGpsWatch();state.mode='geoar';permission.hidden=true;updateRuntimeUi();render();
    feedback(orientation?'Geo‑AR active : caméra, GPS et boussole opérationnels.':'Geo‑AR active : caméra et GPS OK, cap en mode manuel.');
  }catch(error){
    state.lastError=error?.message||String(error);state.active=false;updateRuntimeUi();
    setText('#arPermissionText',`AR réelle impossible : ${state.lastError}. Utilisez « Simuler sans GPS réel » pour vérifier le moteur.`);
  }
}

function simulationAnchor(){return places[state.simIndex]||places[0]||null}
function setSimulationAt(index){
  if(!places.length)return false;
  state.simIndex=((index%places.length)+places.length)%places.length;
  const anchor=simulationAnchor();state.position=simulatedPositionForPlace(anchor);state.heading=bearingDeg(state.position,anchor);state.gpsOk=true;state.orientationOk=true;state.focused=anchor;state.target=anchor;render();return true;
}
function startSimulation(){
  if(!openStage())return;
  cleanup({hide:false});state.active=true;state.simulation=true;state.mode='simulation';state.cameraOk=true;state.gpsOk=true;state.orientationOk=true;stage.classList.add('ar-stage--simulation');if(video){video.hidden=true;video.srcObject=null}permission.hidden=true;$('#arSimNext')&&($('#arSimNext').hidden=false);
  if(!setSimulationAt(state.simIndex)){focusCard.innerHTML='<h3>Aucun repère</h3><p>Le RoutePack ne contient aucun lieu géolocalisé.</p>';return}
  stopSimulationTimer();state.simTimer=setInterval(()=>{if(state.simulation){state.heading=normalizeHeading((state.heading??0)+4);render()}},900);
  updateRuntimeUi();feedback('Simulation AR active : position virtuelle placée près du premier repère.');
}
function nextSimulationPlace(){if(!state.simulation||!places.length)return;setSimulationAt(state.simIndex+1);feedback(`Simulation déplacée vers ${simulationAnchor().name}.`)}

function projected(){return projectPlaces({position:state.position,places,heading:state.heading??0,fov:72,maxDistanceKm:state.simulation?50:25})}
function render(){
  if(!stage||stage.hidden||!state.position||!labelsHost)return;
  const width=labelsHost.clientWidth||innerWidth,height=labelsHost.clientHeight||innerHeight;
  const items=projected().filter(x=>x.visible);state.rendered=items.length;labelsHost.innerHTML='';
  if(!items.length){
    focusCard.innerHTML=`<h3>Aucun repère dans le champ</h3><p>${state.simulation?'Tournez le cap avec les boutons ±15° ou passez au lieu suivant.':'Aucun lieu du RoutePack n’est visible dans ce cap à moins de 25 km. Tournez-vous ou utilisez la simulation.'}</p>`;
    refreshControls();updateRuntimeUi();return;
  }
  items.forEach((item,index)=>{
    const x=clamp(item.x,.08,.92)*width;const lane=index%3;const depth=Math.min(1,item.distanceKm/4);const y=clamp(height*(.28+lane*.15)+depth*28,54,height-54);
    const b=document.createElement('button');b.type='button';b.className='ar-label';if(state.target?.id===item.place.id)b.classList.add('is-target');if(Math.abs(item.delta)<7)b.classList.add('is-focus');b.style.left=`${x}px`;b.style.top=`${y}px`;b.innerHTML=`<strong>${item.place.icon||'📍'} ${clean(item.place.name)}</strong><small>${dist(item.distanceKm)} · ${compassLabel(item.bearing)}</small>`;b.onclick=()=>{state.focused=item.place;state.target=item.place;setFocus(item.place);renderNavigationCue();render()};labelsHost.appendChild(b);
  });
  const centered=[...items].sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)||a.distanceKm-b.distanceKm)[0];
  if(centered&&Math.abs(centered.delta)<8&&!state.focused){state.focused=centered.place;setFocus(centered.place)}
  setText('#arCompass',`${state.simulation?'SIM · ':''}${compassLabel(state.heading??0)} · ${Math.round(state.heading??0)}°`);renderNavigationCue();updateRuntimeUi();
}
function setFocus(place){
  if(!place||!state.position)return;state.focused=place;const item=projected().find(x=>x.place.id===place.id);const d=item?.distanceKm??0,b=item?.bearing??0;
  focusCard.innerHTML=`<h3>${place.icon||'📍'} ${clean(place.name)}</h3>${place.heroImage?`<img class="ar-focus-photo" src="${place.heroImage}" alt="" referrerpolicy="no-referrer">`:''}<p>${clean(place.historyShort||place.description||place.note||'')}</p><div class="ar-focus-meta"><span>${dist(d)}</span><span>${compassLabel(b)} · ${Math.round(b)}°</span></div><small class="ar-focus-note">${state.simulation?'Simulation déterministe du repère.':'Touchez « Cibler » pour suivre ce repère.'}</small>`;
  const walk=$('#arWalk'),waze=$('#arWaze');if(walk){walk.href=walkUrl(place);walk.target='_blank';walk.rel='noreferrer'}if(waze){waze.href=place.waze||`https://www.waze.com/ul?ll=${place.lat}%2C${place.lng}&navigate=yes`;waze.target='_blank';waze.rel='noreferrer'}refreshControls();
}
function renderNavigationCue(){
  const cue=$('#arNavigationCue');if(!cue)return;if(!state.target||!state.position){cue.hidden=true;return}
  const b=bearingDeg(state.position,state.target),diff=deltaHeading(b,state.heading??0);const d=projected().find(x=>x.place.id===state.target.id)?.distanceKm??0;cue.hidden=false;cue.innerHTML=`<div class="ar-nav-arrow" style="transform:rotate(${clamp(diff,-120,120)}deg)">↑</div><div><strong>${clean(state.target.name)}</strong><small>${dist(d)} · ${Math.abs(diff)<7?'tout droit':diff>0?`tournez ${Math.round(Math.abs(diff))}° à droite`:`tournez ${Math.round(Math.abs(diff))}° à gauche`}</small></div>`;
}
function toggleTarget(){if(!state.focused){feedback('Touchez d’abord un repère.');return}state.target=state.target?.id===state.focused.id?null:state.focused;$('#arTarget').textContent=state.target?'✓ Cible active':'➜ Cibler';renderNavigationCue();render()}
function nudge(delta){state.heading=normalizeHeading((state.heading??0)+delta);state.orientationOk=state.orientationOk&&!state.simulation;render();feedback(`Cap ${delta<0?'gauche':'droite'} ${Math.abs(delta)}°.`)}
function calibrate(){if(!state.focused||!state.position){feedback('Choisissez d’abord un repère connu.');return}state.heading=bearingDeg(state.position,state.focused);render();feedback(`Cap aligné sur ${state.focused.name}.`)}
function speakFocused(){const p=state.focused;if(!p){feedback('Choisissez d’abord un repère.');return}if(!('speechSynthesis'in window)){feedback('Synthèse vocale indisponible.');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(clean(`${p.name}. ${p.historyShort||p.description||p.note||''} ${p.arCue||p.repere||''}`));u.lang='fr-FR';u.rate=.94;speechSynthesis.speak(u)}
async function capture(){
  if(state.simulation){feedback('Capture caméra désactivée en simulation.');return}
  if(!video?.videoWidth||!video?.videoHeight){feedback('Flux caméra pas encore prêt.');return}
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);ctx.fillStyle='rgba(6,31,37,.75)';ctx.fillRect(0,canvas.height-150,canvas.width,150);ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(28,canvas.width/28)}px system-ui`;ctx.fillText(state.focused?.name||data.trip?.title||'PocketGuide AR',28,canvas.height-82);ctx.font=`500 ${Math.max(20,canvas.width/42)}px system-ui`;ctx.fillText('PocketGuide Geo‑AR',28,canvas.height-38);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.88));if(!blob){feedback('Capture impossible.');return}try{const input=$('#memoryPhotoInput');if(input&&typeof DataTransfer!=='undefined'){const file=new File([blob],`pocketguide-ar-${Date.now()}.jpg`,{type:'image/jpeg'});const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));feedback('Photo AR ajoutée au souvenir.');return}}catch{}feedback('Photo AR créée.');
}

function diagnosticSnapshot(){return {secureContext:window.isSecureContext,places:places.length,webxrSupported:state.webxrSupported,webxrSessionTested:state.webxrSessionTested,webxrSessionOk:state.webxrSessionOk,cameraApi:Boolean(navigator.mediaDevices?.getUserMedia),gpsApi:'geolocation'in navigator,orientationApi:typeof DeviceOrientationEvent!=='undefined',active:state.active,simulation:state.simulation,cameraOk:state.cameraOk,gpsOk:state.gpsOk,orientationOk:state.orientationOk,position:state.position,heading:state.heading,rendered:state.rendered,lastError:state.lastError};}
window.santaTeresaS22Audit=diagnosticSnapshot;
window.__POCKETGUIDE_AR_DIAGNOSTIC__={snapshot:diagnosticSnapshot,startSimulation,startRealAR,testWebXRSession,nextSimulationPlace};

injectControls();await detectWebXR();
$('#openAR')?.addEventListener('click',startRealAR);$('#openARSecondary')?.addEventListener('click',startRealAR);$('#arRetry')?.addEventListener('click',startRealAR);$('#arClose')?.addEventListener('click',requestClose);$('#arSpeak')?.addEventListener('click',speakFocused);$('#arCapture')?.addEventListener('click',capture);$('#arAudioToggle')?.addEventListener('click',()=>{const b=$('#arAudioToggle');b.classList.toggle('is-off');b.textContent=b.classList.contains('is-off')?'🔇 Audio off':'🎧 Audio auto'});
window.addEventListener('popstate',()=>{if(state.historyPushed){state.historyPushed=false;cleanup()}});
window.addEventListener('orientationchange',()=>setTimeout(render,120));
window.addEventListener('resize',()=>setTimeout(render,80));
if(new URLSearchParams(location.search).get('arsim')==='1')setTimeout(startSimulation,350);
updateRuntimeUi();

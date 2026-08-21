const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const data=await fetch('./data/trip.json').then(r=>r.json());
const places=data.places||[];
const byId=Object.fromEntries(places.map(p=>[p.id,p]));
let stage=$('#arStage'),video=$('#arCamera'),labelsHost=$('#arLabels'),focusCard=$('#arFocusCard'),permission=$('#arPermission');
let stream=null,position=null,heading=null,orientationHandler=null,focused=null,lastFocusAt=0;
let audioEnabled=true,voiceCooldown={};

function hav(a,b){const R=6371,r=x=>x*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lng-a.lng),x=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function bearing(a,b){const r=x=>x*Math.PI/180,d=x=>x*180/Math.PI,p1=r(a.lat),p2=r(b.lat),dl=r(b.lng-a.lng),y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(d(Math.atan2(y,x))+360)%360}
function deltaAngle(a,b){return((a-b+540)%360)-180}
function dist(km){return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`}
function compass(v){return['N','NE','E','SE','S','SO','O','NO'][Math.round(v/45)%8]}
function clean(s=''){const d=document.createElement('div');d.innerHTML=String(s);return d.textContent||''}
function walkUrl(p){return`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`}

window.addEventListener('tripstatechange',e=>{if(e.detail?.type==='gps'){position=e.detail.position;renderAR()}});

async function getPositionOnce(){return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>{position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy||99};resolve(position)},reject,{enableHighAccuracy:true,maximumAge:1500,timeout:12000}))}
async function requestOrientation(){if(typeof DeviceOrientationEvent==='undefined')return false;try{if(typeof DeviceOrientationEvent.requestPermission==='function'){const r=await DeviceOrientationEvent.requestPermission();if(r!=='granted')return false}orientationHandler=e=>{let h=null;if(typeof e.webkitCompassHeading==='number')h=e.webkitCompassHeading;else if(typeof e.alpha==='number')h=(360-e.alpha)%360;if(h!==null&&Number.isFinite(h)){heading=h;renderAR()}};window.addEventListener('deviceorientationabsolute',orientationHandler,true);window.addEventListener('deviceorientation',orientationHandler,true);return true}catch{return false}}
async function startCamera(){stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});video.srcObject=stream;await video.play()}
function stopCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null}
function stopOrientation(){if(orientationHandler){window.removeEventListener('deviceorientationabsolute',orientationHandler,true);window.removeEventListener('deviceorientation',orientationHandler,true);orientationHandler=null}}

async function startAR(){stage.hidden=false;document.documentElement.style.overflow='hidden';permission.hidden=false;$('#arPermissionText').textContent='Activation caméra, position et boussole…';try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Caméra non disponible');await Promise.all([startCamera(),position?Promise.resolve(position):getPositionOnce()]);const ori=await requestOrientation();permission.hidden=true;$('#arModeStatus').textContent=ori?'Geo‑AR · caméra + GPS + boussole':'Geo‑AR · GPS actif · boussole indisponible';renderAR()}catch(err){$('#arPermissionText').textContent=`Impossible d’activer l’AR : ${err.message||'autorisation refusée'}`}}
function closeAR(){stage.hidden=true;document.documentElement.style.overflow='';stopCamera();stopOrientation();speechSynthesis?.cancel()}

function visiblePlaces(){if(!position)return[];return places.map(p=>({p,d:hav(position,p),b:bearing(position,p)})).filter(x=>x.d<=8).sort((a,b)=>a.d-b.d)}
function renderAR(){if(stage.hidden||!position)return;const list=visiblePlaces();const width=labelsHost.clientWidth||innerWidth,height=labelsHost.clientHeight||innerHeight;const fov=74;let candidates=[];labelsHost.innerHTML='';for(const item of list){const diff=heading===null?0:deltaAngle(item.b,heading);if(heading!==null&&Math.abs(diff)>fov/2+8)continue;const x=heading===null?width/2:(.5+diff/fov)*width;const y=Math.max(70,Math.min(height-70,height*.48-item.d*8));const btn=document.createElement('button');btn.className='ar-label';btn.style.left=`${x}px`;btn.style.top=`${y}px`;btn.innerHTML=`<strong>${item.p.icon||'•'} ${item.p.name}</strong><small>${dist(item.d)} · ${compass(item.b)}</small>`;btn.onclick=()=>setFocus(item.p);labelsHost.appendChild(btn);candidates.push({item,btn,diff:Math.abs(diff)})}
  const best=candidates.sort((a,b)=>a.diff-b.diff||a.item.d-b.item.d)[0];if(best&&best.diff<10){best.btn.classList.add('is-focus');setFocus(best.item.p,true)}
  $('#arCompass').textContent=heading===null?'Orientation…':`${compass(heading)} · ${Math.round(heading)}°`;
}
function setFocus(p,auto=false){if(!p||!position)return;focused=p;const d=hav(position,p),b=bearing(position,p);focusCard.innerHTML=`<h3>${p.icon||'•'} ${p.name}</h3><p>${clean(p.historyShort||p.description||p.note||'')}</p><div class="ar-focus-meta"><span>${dist(d)}</span><span>${compass(b)} · ${Math.round(b)}°</span></div>`;$('#arWalk').href=walkUrl(p);$('#arWaze').href=p.waze||`https://www.waze.com/ul?ll=${p.lat}%2C${p.lng}&navigate=yes`;if(auto&&Date.now()-lastFocusAt>2200){lastFocusAt=Date.now();if(audioEnabled&&d<.25&&Date.now()-(voiceCooldown[p.id]||0)>10*60*1000){speak(p);voiceCooldown[p.id]=Date.now()}}}
function speak(p){if(!('speechSynthesis'in window))return;const text=clean(`Vous regardez ${p.name}. ${p.historyShort||p.description||p.note||''} ${p.arCue||p.repere||''}`);speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='fr-FR';u.rate=.94;speechSynthesis.speak(u)}

async function captureAR(){if(!video.videoWidth||!video.videoHeight){return}const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;const ctx=c.getContext('2d');ctx.drawImage(video,0,0,c.width,c.height);if(focused){ctx.fillStyle='rgba(8,32,38,.78)';ctx.fillRect(24,c.height-150,c.width-48,112);ctx.fillStyle='#fff';ctx.font='bold 32px system-ui';ctx.fillText(focused.name,48,c.height-100);ctx.font='24px system-ui';const d=position?dist(hav(position,focused)):'';ctx.fillText(`${d} · Santa Teresa Pocket Guide V6 AR`,48,c.height-62)}const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));if(!blob)return;const file=new File([blob],`santa-teresa-ar-${Date.now()}.jpg`,{type:'image/jpeg'});if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:'Souvenir AR Santa Teresa',files:[file]});return}catch{}}const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500)}

$('#openAR')?.addEventListener('click',startAR);$('#openARSecondary')?.addEventListener('click',startAR);$('#arClose')?.addEventListener('click',closeAR);$('#arRetry')?.addEventListener('click',startAR);$('#arSpeak')?.addEventListener('click',()=>focused&&speak(focused));$('#arCapture')?.addEventListener('click',captureAR);$('#arAudioToggle')?.addEventListener('click',e=>{audioEnabled=!audioEnabled;e.currentTarget.textContent=audioEnabled?'🎧 Audio auto':'🔇 Audio off'});

const xr=navigator.xr;$('#arXRStatus').textContent=xr?'WebXR détecté · mode Geo‑AR prioritaire':'Geo‑AR universel actif';

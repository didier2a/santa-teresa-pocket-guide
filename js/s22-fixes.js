const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

function showToast(text){
  const t=$('#toast');
  if(!t)return;
  t.textContent=text;
  t.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>t.classList.remove('is-visible'),3200);
}

function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}

function hardenBottomNavigation(){
  $$('.bottom-nav a').forEach(a=>{
    a.addEventListener('click',e=>{
      const href=a.getAttribute('href')||'';
      if(!href.startsWith('#'))return;
      const target=$(href);if(!target)return;
      e.preventDefault();
      target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      try{history.replaceState(history.state,'',href)}catch{}
      $$('.bottom-nav a').forEach(x=>x.classList.toggle('is-active',x===a));
    });
  });
}

function fixNestedPlaceDialog(){
  document.addEventListener('click',e=>{
    const next=e.target.closest?.('[data-go]');
    if(!next)return;
    const dialog=$('#placeDialog');
    if(dialog?.open)dialog.close();
  },true);
}

function hardenInstallButton(){
  const b=$('#installApp');if(!b)return;
  if(isStandalone()){
    b.textContent='✓ Application installée';
    b.setAttribute('aria-disabled','true');
    b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();showToast('L’application est déjà installée sur ce téléphone.')},true);
  }
}

function loadIndependentDiagnostic(){
  if(document.querySelector('script[data-s22-diagnostic]'))return;
  const script=document.createElement('script');
  script.src='./js/diagnostic-s22.js';
  script.defer=true;
  script.dataset.s22Diagnostic='6.0.4';
  script.onerror=()=>showToast('Le moteur de diagnostic S22 n’a pas pu être chargé.');
  document.head.append(script);
}

function hardenArCamera(){
  const media=navigator.mediaDevices;
  if(!media?.getUserMedia||media.getUserMedia.__s22Wrapped)return;
  const original=media.getUserMedia.bind(media);
  const denied=e=>e?.name==='NotAllowedError'||e?.name==='SecurityError';
  const timeoutError=()=>Object.assign(new Error('Délai caméra dépassé'),{name:'TimeoutError'});
  const withTimeout=(promise,ms=7000)=>new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;reject(timeoutError())},ms);
    promise.then(stream=>{
      if(settled){stream?.getTracks?.().forEach(t=>t.stop());return}
      settled=true;clearTimeout(timer);resolve(stream);
    },err=>{if(settled)return;settled=true;clearTimeout(timer);reject(err)});
  });
  const wrapped=async constraints=>{
    if(!constraints?.video)return original(constraints);
    const profiles=[
      constraints,
      {video:{facingMode:{ideal:'environment'}},audio:false},
      {video:true,audio:false}
    ];
    let last;
    for(let i=0;i<profiles.length;i++){
      try{
        const stream=await withTimeout(original(profiles[i]),7000);
        const track=stream.getVideoTracks?.()[0];
        const settings=track?.getSettings?.()||{};
        document.documentElement.dataset.s22CameraProfile=String(i+1);
        document.documentElement.dataset.s22CameraSize=settings.width?`${settings.width}x${settings.height}`:'unknown';
        return stream;
      }catch(err){
        last=err;
        if(denied(err))throw err;
      }
    }
    throw last||new Error('Caméra inaccessible');
  };
  wrapped.__s22Wrapped=true;
  media.getUserMedia=wrapped;

  const video=$('#arCamera');
  if(video&&!video.dataset.s22PlayGuard){
    video.dataset.s22PlayGuard='6.0.7';
    const nativePlay=video.play.bind(video);
    video.play=()=>Promise.race([
      nativePlay(),
      new Promise(resolve=>setTimeout(resolve,2500))
    ]);
    video.addEventListener('playing',()=>{
      document.documentElement.dataset.s22CameraPlaying='true';
      const text=$('#arPermissionText');
      if(text&&!$('#arPermission')?.hidden)text.textContent='Caméra active · initialisation GPS et boussole…';
    });
    video.addEventListener('error',()=>showToast('Erreur du flux caméra AR. Relancez la démo.'));
  }

  document.addEventListener('click',e=>{
    const trigger=e.target.closest?.('#arDemo,#arDemoPermission,#openAR,#openARSecondary,#arRetry');
    if(!trigger)return;
    const text=$('#arPermissionText');
    if(text)text.textContent='Ouverture de la caméra arrière…';
    showToast('AR : ouverture de la caméra…');
    setTimeout(()=>{
      const stage=$('#arStage'),cam=$('#arCamera');
      if(stage&&!stage.hidden&&cam&&!cam.srcObject){
        const detail=document.documentElement.dataset.s22CameraProfile?'Le flux caméra n’est pas visible.':'La caméra n’a pas répondu.';
        if(text)text.textContent=`${detail} Vérifiez l’autorisation Caméra de Chrome puis touchez « Autoriser et démarrer ».`;
      }
    },8500);
  },true);
}

function hardenDialogBackButton(){
  for(const id of ['#placeDialog','#scheduleDialog']){
    const d=$(id);if(!d)return;
    d.addEventListener('cancel',e=>{e.preventDefault();d.close()});
  }
}

function protectSilentControls(){
  const replay=$('#audioReplay');
  replay?.addEventListener('click',()=>setTimeout(()=>{
    if(!('speechSynthesis'in window))showToast('Audioguide indisponible sur ce navigateur.');
  },0));
  const save=$('#saveMemoryNote');
  save?.addEventListener('click',()=>{
    if(!$('#memoryNote')?.value.trim())showToast('Écrivez d’abord une note à enregistrer.');
  },true);
}

function init(){
  hardenBottomNavigation();
  fixNestedPlaceDialog();
  hardenInstallButton();
  loadIndependentDiagnostic();
  hardenArCamera();
  hardenDialogBackButton();
  protectSilentControls();
  document.documentElement.dataset.s22NavFix='6.0.7';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

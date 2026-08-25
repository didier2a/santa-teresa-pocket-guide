(()=>{
  const state={orientationPermission:'unknown',orientationPromise:null,lastResetAt:0};
  const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

  function requestOrientationFromGesture(){
    if(typeof DeviceOrientationEvent==='undefined'){state.orientationPermission='unsupported';return Promise.resolve(false)}
    if(typeof DeviceOrientationEvent.requestPermission!=='function'){state.orientationPermission='granted';return Promise.resolve(true)}
    if(state.orientationPermission==='granted')return Promise.resolve(true);
    if(state.orientationPromise)return state.orientationPromise;
    try{
      const result=DeviceOrientationEvent.requestPermission();
      state.orientationPromise=Promise.resolve(result).then(value=>{
        state.orientationPermission=value==='granted'?'granted':'denied';
        return state.orientationPermission==='granted';
      }).catch(()=>{state.orientationPermission='denied';return false}).finally(()=>{state.orientationPromise=null});
      return state.orientationPromise;
    }catch{state.orientationPermission='denied';return Promise.resolve(false)}
  }

  function stopAppMedia(){
    const app=window.__POCKETGUIDE_15__,s=app?.state;
    try{s?.dc?.close?.()}catch{}
    try{s?.pc?.close?.()}catch{}
    try{s?.micStream?.getTracks?.().forEach(t=>t.stop())}catch{}
    try{s?.cameraStream?.getTracks?.().forEach(t=>t.stop())}catch{}
    if(s?.orientationHandler){
      try{window.removeEventListener('deviceorientationabsolute',s.orientationHandler,true)}catch{}
      try{window.removeEventListener('deviceorientation',s.orientationHandler,true)}catch{}
    }
    if(s?.gpsWatch!==null&&s?.gpsWatch!==undefined){try{navigator.geolocation.clearWatch(s.gpsWatch)}catch{}}
    if(s){s.dc=null;s.pc=null;s.micStream=null;s.cameraStream=null;s.orientationHandler=null;s.gpsWatch=null;s.connected=false;s.connecting=false;s.listening=false;s.responding=false;s.ar=false;s.heading=null}
    for(const el of document.querySelectorAll('audio,video')){try{el.pause?.();if(el.srcObject){el.srcObject.getTracks?.().forEach(t=>t.stop());el.srcObject=null}}catch{}}
    const video=document.querySelector('#arCamera');if(video)video.hidden=true;
    document.querySelector('#arToggle')?.classList.remove('is-on');
    const labels=document.querySelector('#arLabels');if(labels)labels.hidden=true;
    const reticle=document.querySelector('#arReticle');if(reticle)reticle.hidden=true;
    const compass=document.querySelector('#arCompass');if(compass)compass.hidden=true;
    const session=document.querySelector('#sessionState');if(session){session.textContent='IA';session.classList.remove('is-live')}
    const gps=document.querySelector('#gpsState');if(gps){gps.textContent='GPS';gps.classList.remove('is-ok')}
  }

  async function resetMedia(){
    const planner=window.__POCKETGUIDE_PLANNER_VOICE__;
    try{await planner?.stop?.('Dictée arrêtée pour réinitialiser les capteurs.')}catch{}
    stopAppMedia();
    state.lastResetAt=Date.now();
    await new Promise(r=>setTimeout(r,300));
    try{document.querySelector('#gpsBtn')?.click()}catch{}
    return true;
  }

  function injectRecovery(){
    const panel=document.querySelector('[data-panel="create"] .creator-card:last-child');
    if(!panel||document.querySelector('#resetSensorsBtn'))return;
    const h=document.createElement('h3');h.textContent='Compatibilité & capteurs';
    const reset=document.createElement('button');reset.id='resetSensorsBtn';reset.type='button';reset.className='ghost';reset.textContent='↻ Réinitialiser caméra & micro';
    const diag=document.createElement('a');diag.id='universalDiagnosticLink';diag.className='ghost';diag.href='./diagnostic.html';diag.textContent='◉ Diagnostic de compatibilité';diag.style.display='inline-flex';diag.style.textDecoration='none';diag.style.marginLeft='6px';
    panel.append(h,reset,diag);
  }

  function bind(){
    const brand=document.querySelector('.brand strong b');if(brand)brand.textContent='1.5.2';
    injectRecovery();
    const ar=document.querySelector('#arToggle');
    if(ar){
      ar.addEventListener('pointerdown',()=>{void requestOrientationFromGesture()},{capture:true,passive:true});
      ar.addEventListener('click',()=>{void requestOrientationFromGesture()},{capture:true});
    }
    const reset=document.querySelector('#resetSensorsBtn');
    if(reset)reset.addEventListener('click',async()=>{
      reset.disabled=true;reset.textContent='… Réinitialisation';
      try{await resetMedia();reset.textContent='✓ Capteurs réinitialisés';setTimeout(()=>{reset.textContent='↻ Réinitialiser caméra & micro';reset.disabled=false},1800)}catch{reset.textContent='↻ Réinitialiser caméra & micro';reset.disabled=false}
    });
  }

  window.__POCKETGUIDE_PLATFORM__={state,isIOS,requestOrientationFromGesture,resetMedia,stopAppMedia};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();

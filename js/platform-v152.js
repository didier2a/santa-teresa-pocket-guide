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
    }catch{
      state.orientationPermission='denied';
      return Promise.resolve(false);
    }
  }

  async function resetMedia(){
    const app=window.__POCKETGUIDE_15__;
    const planner=window.__POCKETGUIDE_PLANNER_VOICE__;
    try{await planner?.stop?.('Dictée arrêtée pour réinitialiser les capteurs.')}catch{}
    try{app?.disconnectRealtime?.()}catch{}
    try{app?.stopCamera?.()}catch{}
    try{app?.stopOrientation?.()}catch{}
    try{app?.stopGps?.()}catch{}
    for(const el of document.querySelectorAll('audio,video')){
      try{if(el.srcObject){el.srcObject.getTracks?.().forEach(t=>t.stop());el.srcObject=null}}catch{}
    }
    state.lastResetAt=Date.now();
    await new Promise(r=>setTimeout(r,220));
    try{app?.startGps?.()}catch{}
    return true;
  }

  function bind(){
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

  window.__POCKETGUIDE_PLATFORM__={state,isIOS,requestOrientationFromGesture,resetMedia};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();

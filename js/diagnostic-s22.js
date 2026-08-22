(()=>{
  const $=s=>document.querySelector(s);
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const row=(name,state,detail)=>`<div class="diagnostic-row ${state==='ok'?'is-ok':'is-warn'}"><span>${state==='ok'?'✓':'!'}</span><div><strong>${escape(name)}</strong><small>${escape(detail)}</small></div></div>`;

  function render(host,items){host.innerHTML=items.map(x=>row(...x)).join('')}
  function add(items,host,name,state,detail){items.push([name,state,detail]);render(host,items)}

  async function testGps(){
    if(!('geolocation'in navigator))return['GPS','warn','API de géolocalisation absente'];
    return await new Promise(resolve=>navigator.geolocation.getCurrentPosition(
      p=>resolve(['GPS','ok',`Position obtenue · précision ±${Math.round(p.coords.accuracy||0)} m`]),
      e=>resolve(['GPS','warn',`Position non obtenue : ${e.message||'autorisation refusée'}`]),
      {enableHighAccuracy:true,maximumAge:0,timeout:8000}
    ));
  }

  async function testOrientation(){
    if(typeof DeviceOrientationEvent==='undefined')return['Capteurs orientation','warn','DeviceOrientation indisponible'];
    try{
      if(typeof DeviceOrientationEvent.requestPermission==='function'){
        const p=await DeviceOrientationEvent.requestPermission();
        if(p!=='granted')return['Capteurs orientation','warn','Autorisation orientation refusée'];
      }
    }catch(e){return['Capteurs orientation','warn',e.message||'Autorisation orientation impossible']}
    return await new Promise(resolve=>{
      let done=false;
      const finish=(state,detail)=>{if(done)return;done=true;window.removeEventListener('deviceorientation',onEvent,true);window.removeEventListener('deviceorientationabsolute',onEvent,true);resolve(['Capteurs orientation',state,detail])};
      const onEvent=e=>{
        const values=[e.alpha,e.beta,e.gamma].filter(Number.isFinite);
        if(values.length)finish('ok',`Capteur actif · α ${Math.round(e.alpha||0)}° · β ${Math.round(e.beta||0)}° · γ ${Math.round(e.gamma||0)}°`);
      };
      window.addEventListener('deviceorientation',onEvent,true);window.addEventListener('deviceorientationabsolute',onEvent,true);
      setTimeout(()=>finish('warn','API présente mais aucune mesure reçue en 2,5 s'),2500);
    });
  }

  async function testCameraAndPhoto(){
    if(!navigator.mediaDevices?.getUserMedia)return[
      ['Caméra','warn','getUserMedia indisponible'],
      ['Photo','warn','Test photo impossible sans caméra']
    ];
    let stream=null,video=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const track=stream.getVideoTracks()[0];
      const settings=track?.getSettings?.()||{};
      video=document.createElement('video');video.playsInline=true;video.muted=true;video.srcObject=stream;video.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px';document.body.append(video);
      await video.play();
      if(!video.videoWidth){await Promise.race([new Promise(r=>video.addEventListener('loadedmetadata',r,{once:true})),delay(1500)])}
      const camera=['Caméra','ok',`Caméra arrière accessible${settings.width?` · ${settings.width}×${settings.height}`:''}`];
      if(!video.videoWidth||!video.videoHeight)return[camera,['Photo','warn','Flux caméra actif mais image non prête']];
      const canvas=document.createElement('canvas');canvas.width=Math.min(video.videoWidth,640);canvas.height=Math.max(1,Math.round(canvas.width*video.videoHeight/video.videoWidth));
      canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.72));
      return[camera,blob?.size>0?['Photo','ok',`Capture photo test réussie · ${Math.round(blob.size/1024)} Ko`]:['Photo','warn','Capture Canvas vide']];
    }catch(e){
      const detail=e?.name==='NotAllowedError'?'Autorisation caméra refusée':(e?.message||'Caméra inaccessible');
      return[['Caméra','warn',detail],['Photo','warn','Test photo non exécuté']];
    }finally{
      stream?.getTracks().forEach(t=>t.stop());
      if(video){video.srcObject=null;video.remove()}
    }
  }

  function testTouchTargets(){
    const sel='button,a,input,label,.bottom-nav a,.ar-control,.mini-action,.audio-btn,.memory-action,.map-tab';
    const small=[];
    for(const el of document.querySelectorAll(sel)){
      if(el.offsetParent===null||el.type==='hidden')continue;
      const r=el.getBoundingClientRect();if(r.width<44||r.height<44)small.push(`${(el.getAttribute('aria-label')||el.textContent||el.id||el.tagName).trim().slice(0,28)} ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
    return small.length?['Zones tactiles','warn',`${small.length} zone(s) <44 px · ${small.slice(0,3).join(' · ')}`]:['Zones tactiles','ok','Toutes les commandes visibles atteignent 44 px minimum'];
  }

  async function run(e){
    e?.preventDefault?.();e?.stopImmediatePropagation?.();
    const button=$('#runDiagnostics'),host=$('#diagnosticResults');if(!button||!host)return;
    if(button.dataset.running==='1')return;
    button.dataset.running='1';button.disabled=true;button.textContent='Diagnostic en cours…';
    const items=[];host.innerHTML=row('Diagnostic S22','ok','Démarrage… des autorisations Android peuvent apparaître.');
    try{
      add(items,host,'HTTPS / contexte sécurisé',window.isSecureContext?'ok':'warn',window.isSecureContext?'Contexte sécurisé actif':'HTTPS requis pour GPS et caméra');
      add(items,host,'Mode application',matchMedia('(display-mode: standalone)').matches?'ok':'warn',matchMedia('(display-mode: standalone)').matches?'PWA autonome':'Ouverte dans Chrome');
      add(items,host,'Écran tactile',navigator.maxTouchPoints>0?'ok':'warn',`${navigator.maxTouchPoints||0} point(s) tactile(s) · ${innerWidth}×${innerHeight}`);
      add(items,host,'Service worker','serviceWorker'in navigator?'ok':'warn','serviceWorker'in navigator?'API disponible':'API indisponible');
      add(items,host,'Stockage local',(()=>{try{const k='st-diag-604';localStorage.setItem(k,'ok');const ok=localStorage.getItem(k)==='ok';localStorage.removeItem(k);return ok}catch{return false}})()?'ok':'warn','Test lecture/écriture localStorage');
      add(items,host,...testTouchTargets());
      const gps=await testGps();add(items,host,...gps);
      const orientation=await testOrientation();add(items,host,...orientation);
      const cam=await testCameraAndPhoto();for(const r of cam)add(items,host,...r);
      add(items,host,'Audioguide','speechSynthesis'in window?'ok':'warn','speechSynthesis'in window?'Synthèse vocale disponible':'Synthèse vocale indisponible');
      const warnings=items.filter(x=>x[1]!=='ok').length;
      host.insertAdjacentHTML('afterbegin',row('Résultat global',warnings?'warn':'ok',warnings?`${warnings} point(s) à vérifier sur ce téléphone`:'Tous les tests disponibles ont réussi'));
    }catch(err){host.insertAdjacentHTML('beforeend',row('Erreur diagnostic','warn',err?.message||String(err)))}
    finally{button.dataset.running='0';button.disabled=false;button.textContent='Relancer le diagnostic S22'}
  }

  function bind(){const b=$('#runDiagnostics');if(!b)return;b.type='button';b.addEventListener('click',run,true);b.dataset.diagnosticEngine='6.0.4'}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();

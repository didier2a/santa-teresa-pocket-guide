const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

function showToast(text){
  const t=$('#toast');
  if(!t)return;
  t.textContent=text;
  t.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>t.classList.remove('is-visible'),2600);
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
    // openPlace() sera appelé ensuite par le gestionnaire existant. Fermer d'abord
    // évite InvalidStateError sur Chrome Android quand showModal() est rappelé.
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

function appendS22Diagnostic(){
  const button=$('#runDiagnostics');if(!button)return;
  button.addEventListener('click',()=>setTimeout(()=>{
    const host=$('#diagnosticResults');if(!host||typeof window.santaTeresaS22Audit!=='function')return;
    const a=window.santaTeresaS22Audit();
    const rows=[
      ['Écran tactile',a.touchPoints>0,`${a.touchPoints||0} point(s) tactile(s) · viewport ${a.viewport}`],
      ['Caméra AR',a.camera,a.camera?'getUserMedia disponible':'Caméra web indisponible'],
      ['Capteurs orientation',a.orientation,a.orientation?'DeviceOrientation disponible':'Capteur orientation indisponible'],
      ['Zones tactiles ≥ 44 px',a.tooSmallTouchTargets.length===0,a.tooSmallTouchTargets.length?`${a.tooSmallTouchTargets.length} zone(s) trop petite(s) : ${a.tooSmallTouchTargets.slice(0,3).join(' · ')}`:'Toutes les commandes visibles respectent le seuil tactile'],
      ['Mode application',a.standalone,a.standalone?'PWA autonome':'Ouverte dans le navigateur']
    ];
    host.insertAdjacentHTML('beforeend',rows.map(([name,ok,detail])=>`<div class="diagnostic-row ${ok?'is-ok':'is-warn'}"><span>${ok?'✓':'!'}</span><div><strong>${name}</strong><small>${detail}</small></div></div>`).join(''));
  },80));
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
  appendS22Diagnostic();
  hardenDialogBackButton();
  protectSilentControls();
  document.documentElement.dataset.s22NavFix='6.0.3';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

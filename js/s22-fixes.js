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
  hardenDialogBackButton();
  protectSilentControls();
  document.documentElement.dataset.s22NavFix='6.0.4';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

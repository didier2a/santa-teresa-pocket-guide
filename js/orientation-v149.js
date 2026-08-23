(()=>{
  const $=s=>document.querySelector(s);
  const stage=$('#arStage');
  if(!stage)return;
  let desired=localStorage.getItem('pg-ar-orientation')||'portrait';
  let virtual=false;

  function actual(){return matchMedia('(orientation: landscape)').matches?'landscape':'portrait'}
  function updateButton(){const b=$('#arOrientation');if(!b)return;b.textContent=desired==='landscape'?'▭ 16:9':'▯ 9:16';b.title=desired==='landscape'?'Basculer en portrait 9:16':'Basculer en paysage 16:9'}
  function clearVirtual(){stage.classList.remove('ar-force-landscape','ar-force-portrait');document.documentElement.classList.remove('pg-ar-virtual-orientation');virtual=false}
  function applyVirtual(){
    clearVirtual();
    if(actual()===desired)return;
    stage.classList.add(desired==='landscape'?'ar-force-landscape':'ar-force-portrait');
    document.documentElement.classList.add('pg-ar-virtual-orientation');virtual=true;
  }
  async function request(mode){
    desired=mode;localStorage.setItem('pg-ar-orientation',desired);updateButton();clearVirtual();
    let locked=false;
    try{
      if(screen.orientation?.lock){
        if(!document.fullscreenElement&&document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen({navigationUI:'hide'})}catch{}}
        await screen.orientation.lock(mode==='landscape'?'landscape':'portrait');locked=true;
      }
    }catch{}
    setTimeout(()=>{if(!locked||actual()!==desired)applyVirtual();window.dispatchEvent(new Event('resize'))},180);
  }
  function toggle(){void request(desired==='landscape'?'portrait':'landscape')}
  function inject(){
    const top=$('.ar-top',stage);if(!top||$('#arOrientation'))return;
    const b=document.createElement('button');b.type='button';b.id='arOrientation';b.className='ar-pill';b.addEventListener('click',toggle);top.insertBefore(b,$('#arAudioToggle'));updateButton();
  }
  function onChange(){if(virtual&&actual()===desired)clearVirtual();updateButton();window.dispatchEvent(new Event('resize'))}
  inject();matchMedia('(orientation: landscape)').addEventListener?.('change',onChange);window.addEventListener('orientationchange',()=>setTimeout(onChange,150));
  window.__POCKETGUIDE_ORIENTATION__={request,toggle,get desired(){return desired},get virtual(){return virtual}};
})();

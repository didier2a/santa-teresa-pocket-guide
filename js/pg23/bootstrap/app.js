const SHELL_IDENTITY='PocketGuide 2.3.2';
const LIVEAVATAR_REALTIME=new URLSearchParams(location.search).get('liveavatar')==='1';
const reclaimShellIdentity=()=>{
  const label=document.querySelector('.identity strong');
  if(label&&label.textContent!==SHELL_IDENTITY)label.textContent=SHELL_IDENTITY;
  const title=LIVEAVATAR_REALTIME?'PocketGuide V2.3.2 · LiveAvatar Realtime':'PocketGuide V2.3.2 · Claire 3D locale';
  if(document.title!==title)document.title=title;
};
reclaimShellIdentity();
const identityObserver=new MutationObserver(reclaimShellIdentity);
for(const node of [document.querySelector('.identity strong'),document.querySelector('title')].filter(Boolean))identityObserver.observe(node,{childList:true,characterData:true,subtree:true});

await import('../../pg22/bootstrap/app.js?v=2.3.2.10');
const {installLivingCompanion}=await import('./living-companion-runtime.js?v=2.3.2.13');
installLivingCompanion();
reclaimShellIdentity();

const SHELL_IDENTITY='PocketGuide 2.3.2';
const reclaimShellIdentity=()=>{
  const label=document.querySelector('.identity strong');
  if(label&&label.textContent!==SHELL_IDENTITY)label.textContent=SHELL_IDENTITY;
  const title='PocketGuide V2.3.2 · Claire 3D locale';
  if(document.title!==title)document.title=title;
};
reclaimShellIdentity();
const identityObserver=new MutationObserver(reclaimShellIdentity);
for(const node of [document.querySelector('.identity strong'),document.querySelector('title')].filter(Boolean))identityObserver.observe(node,{childList:true,characterData:true,subtree:true});

await import('../../pg22/bootstrap/app.js?v=2.3.2.6');
const {installLivingCompanion}=await import('./living-companion-runtime.js?v=2.3.2.6');
installLivingCompanion();
reclaimShellIdentity();

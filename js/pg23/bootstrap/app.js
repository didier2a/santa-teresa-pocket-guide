const initialParams=new URLSearchParams(location.search);
const V233_MODE=initialParams.get('v233')==='1'||/\/pocketguide-2\.3\.3\/?$/i.test(location.pathname);
if(V233_MODE&&!initialParams.has('liveavatar')){const url=new URL(location.href);url.searchParams.set('liveavatar','1');history.replaceState(history.state,'',url);}
if(V233_MODE){
  const manifest=document.querySelector('link[rel="manifest"]');if(manifest)manifest.href='manifest-v233.webmanifest';
  if(!document.querySelector('link[data-pg233-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href='pocketguide-v233.css?v=2.3.3.2';style.dataset.pg233Style='true';document.head.append(style);}
}
const SHELL_VERSION=V233_MODE?'2.3.3':'2.3.2';
const SHELL_IDENTITY=`PocketGuide ${SHELL_VERSION}`;
const LIVEAVATAR_REALTIME=new URLSearchParams(location.search).get('liveavatar')==='1';
const reclaimShellIdentity=()=>{
  const label=document.querySelector('.identity strong');
  if(label&&label.textContent!==SHELL_IDENTITY)label.textContent=SHELL_IDENTITY;
  const title=V233_MODE?'PocketGuide V2.3.3 · Guide LiveAvatar':LIVEAVATAR_REALTIME?'PocketGuide V2.3.2 · LiveAvatar Realtime':'PocketGuide V2.3.2 · Claire 3D locale';
  if(document.title!==title)document.title=title;
};
reclaimShellIdentity();
const identityObserver=new MutationObserver(reclaimShellIdentity);
for(const node of [document.querySelector('.identity strong'),document.querySelector('title')].filter(Boolean))identityObserver.observe(node,{childList:true,characterData:true,subtree:true});

await import('../../pg22/bootstrap/app.js?v=2.3.2.10');
const {installLivingCompanion}=await import('./living-companion-runtime.js?v=2.3.2.14');
installLivingCompanion();
reclaimShellIdentity();
if(V233_MODE){const {installPocketGuide233}=await import('../../pg233/bootstrap/app.js?v=2.3.3.2');installPocketGuide233();reclaimShellIdentity();}

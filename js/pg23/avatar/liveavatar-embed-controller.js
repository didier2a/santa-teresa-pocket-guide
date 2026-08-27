import {eventBus} from '../../pg16/core/event-bus.js';

const DEFAULT_API_BASE='https://santa-teresa-pocket-guide.vercel.app';
const PORTRAIT_URL='assets/companion/Pocket-Guide-LiveAvatar-1080x1920.jpg';

export function liveAvatarEmbeddedRequested(search=globalThis.location?.search||''){
  return new URLSearchParams(search).get('liveavatar')==='1';
}

function apiOverride(search=globalThis.location?.search||''){
  const value=new URLSearchParams(search).get('api');
  if(!value)return'';
  try{const url=new URL(value);return url.protocol==='https:'?url.origin:'';}catch{return'';}
}

function safeEmbedUrl(value){
  try{const url=new URL(String(value||''));return url.protocol==='https:'?url.href:'';}catch{return'';}
}

export class LiveAvatarEmbedController{
  constructor({bus=eventBus,fetchImpl=globalThis.fetch,documentImpl=globalThis.document}={}){
    this.id='embedded';this.bus=bus;this.fetchImpl=typeof fetchImpl==='function'?fetchImpl.bind(globalThis):null;this.document=documentImpl;this.nodes={};this.active=false;this.loading=false;this.error='';this.url='';this.retryHandler=null;
  }
  async apiBase(){
    const override=apiOverride();if(override)return override;
    if(globalThis.location?.hostname?.endsWith('.vercel.app'))return globalThis.location.origin;
    try{const response=await this.fetchImpl('./data/ai-config.json?v=liveavatar-embedded-1',{cache:'no-store'});const config=await response.json();const base=String(config?.apiBase||'').replace(/\/$/,'');if(base)return base;}catch{}
    return DEFAULT_API_BASE;
  }
  install({root,portrait,host,status,retry}={}){
    this.nodes={root,portrait,host,status,retry};
    if(retry){this.retryHandler=()=>void this.activate();retry.addEventListener('click',this.retryHandler);retry.hidden=true;}
    void this.activate();return this;
  }
  loadingView(){
    if(!this.document||!this.nodes.host)return;
    const shell=this.document.createElement('span');shell.className='liveavatar-embed-loading';shell.setAttribute('role','status');
    const image=this.document.createElement('img');image.src=PORTRAIT_URL;image.alt='Portrait de la guide Pocket Guide';
    const label=this.document.createElement('strong');label.textContent='Pocket Guide se prépare';
    const detail=this.document.createElement('small');detail.textContent='LiveAvatar Embedded · portrait vertical';
    shell.append(image,label,detail);this.nodes.host.replaceChildren(shell);
  }
  errorView(message){
    if(!this.document||!this.nodes.host)return;
    const shell=this.document.createElement('span');shell.className='liveavatar-embed-error';shell.setAttribute('role','alert');
    const label=this.document.createElement('strong');label.textContent='LiveAvatar indisponible';
    const detail=this.document.createElement('small');detail.textContent=message;
    shell.append(label,detail);this.nodes.host.replaceChildren(shell);
  }
  async activate(){
    if(this.loading)return this.diagnostic();this.loading=true;this.active=false;this.error='';
    const {root,portrait,host,status,retry}=this.nodes;if(root)root.dataset.avatarEngine='embedded-loading';if(host){host.hidden=false;host.classList.add('liveavatar-embed-host');host.removeAttribute('aria-hidden');}if(portrait){portrait.hidden=true;portrait.setAttribute('aria-hidden','true');}if(status)status.textContent='Connexion au portrait LiveAvatar…';if(retry)retry.hidden=true;this.loadingView();
    try{
      if(!this.fetchImpl||!this.document)throw new Error('Navigateur incompatible');
      const base=await this.apiBase();
      const response=await this.fetchImpl(`${base}/api/liveavatar-embed`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.error||`LiveAvatar HTTP ${response.status}`);
      const url=safeEmbedUrl(payload?.url);if(!url)throw new Error('URL Embedded absente');
      const frame=this.document.createElement('iframe');frame.className='liveavatar-embed-frame';frame.src=url;frame.title='LiveAvatar Embed';frame.allow='microphone; autoplay';frame.setAttribute('allowfullscreen','');frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
      frame.addEventListener('load',()=>{this.active=true;this.loading=false;if(root)root.dataset.avatarEngine='embedded';if(status)status.textContent='Pocket Guide · LiveAvatar Embedded';this.bus.emit('pg23.avatar.engine.active',{engine:this.id,identity:payload.avatarName||'Pocket Guide',orientation:'vertical'});},{once:true});
      host.replaceChildren(frame);this.url=url;return this.diagnostic();
    }catch(error){
      this.loading=false;this.error=String(error?.message||error);if(root){root.dataset.avatarEngine='failed';root.dataset.avatarError=this.error;}if(status){status.textContent='LiveAvatar indisponible · réessayez';status.title=this.error;}if(retry)retry.hidden=false;this.errorView(this.error);this.bus.emit('pg23.avatar.engine.failed',{engine:this.id,message:this.error});return this.diagnostic();
    }
  }
  setPresence(){}
  interrupt(){}
  diagnostic(){return{requested:'embedded',identity:'Pocket Guide',active:this.active?'embedded':'',loading:this.loading,error:this.error||null,orientation:'vertical',urlReady:Boolean(this.url)};}
  async destroy(){if(this.retryHandler&&this.nodes.retry)this.nodes.retry.removeEventListener('click',this.retryHandler);this.nodes.host?.replaceChildren();this.active=false;this.loading=false;this.url='';}
}

export const liveAvatarEmbedController=new LiveAvatarEmbedController();

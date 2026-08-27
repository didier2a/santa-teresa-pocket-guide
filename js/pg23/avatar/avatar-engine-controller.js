import {eventBus} from '../../pg16/core/event-bus.js';
import {avatarNetworkPolicy,browserConnectionSnapshot,normalizeAvatarMode} from './avatar-network-policy.js';
import {avatarPackManager} from './avatar-pack-manager.js';
import {TalkingHeadLocalEngine} from './talkinghead-local-engine.js';

const LABELS={auto:'Auto · économie',portrait:'Portrait local',local:'3D locale',live:'LiveAvatar'};
const REASONS={
  'auto-local':'3D locale · aucun flux vidéo','manual-local':'3D locale · aucun flux vidéo','manual-portrait':'Portrait local · consommation minimale','local-not-ready':'Modèle 3D en préparation · portrait actif','local-pending':'Modèle 3D en préparation · portrait actif','local-install-failed':'Claire indisponible · portrait actif','offline':'Hors ligne · avatar local','save-data':'Économie de données · avatar local','slow-network':'Réseau limité · avatar local','cellular-local':'4G/5G · avatar local par défaut','live-not-ready':'LiveAvatar indisponible · avatar local','manual-live':'LiveAvatar · flux réseau actif','auto-live-approved':'LiveAvatar autorisé sur ce réseau'
};

class PortraitEngine{
  constructor(){this.id='portrait';this.root=null;this.portrait=null;this.active=false;}
  install({root,portrait}={}){this.root=root;this.portrait=portrait;return this;}
  async activate(){this.active=true;if(this.portrait){this.portrait.hidden=false;this.portrait.removeAttribute('aria-hidden');}return{active:true};}
  setPresence(){}
  interrupt(){}
  diagnostic(){return{id:this.id,active:this.active,offline:true};}
  async destroy(){this.active=false;}
}

export class AvatarEngineController{
  constructor({bus=eventBus,fetchImpl=globalThis.fetch,storage=globalThis.localStorage}={}){this.bus=bus;this.fetchImpl=fetchImpl;this.storage=storage;this.config=null;this.mode='auto';this.activeId='';this.engines=new Map();this.nodes={};this.unsubs=[];this.installed=false;this.lastDecision=null;this.liveOptIn=false;this.packInstallPromise=null;}
  async install({root,portrait,host,audioBus,select,status}={}){
    if(this.installed)return this;this.installed=true;this.nodes={root,portrait,host,select,status};
    try{const response=await this.fetchImpl('./data/v23-avatar-config.json',{cache:'no-store'});this.config=await response.json();}catch{this.config={defaultMode:'auto',fallbackMode:'portrait',local:{enabled:false,ready:false},live:{enabled:false}};}
    this.mode=normalizeAvatarMode(this.storage?.getItem?.(this.config.storageKey)||this.config.defaultMode);
    this.engines.set('portrait',new PortraitEngine().install({root,portrait}));this.engines.set('local',new TalkingHeadLocalEngine({bus:this.bus}).install({host,portrait,audioBus,config:this.config.local}));
    if(select){select.value=this.mode;select.addEventListener('change',()=>void this.setMode(select.value,{explicit:true}));}
    const reconsider=()=>void this.apply();globalThis.addEventListener?.('online',reconsider);globalThis.addEventListener?.('offline',reconsider);this.unsubs.push(()=>globalThis.removeEventListener?.('online',reconsider),()=>globalThis.removeEventListener?.('offline',reconsider),this.bus.on('pg23.presence.changed',payload=>this.engines.get(this.activeId)?.setPresence?.(payload?.state)));
    await this.apply();
    if(this.config?.local?.enabled&&this.config.local.ready&&!await this.localReady())void this.ensureLocalPack({onProgress:progress=>{if(this.nodes.status)this.nodes.status.textContent=`Installation de Claire · ${progress.index}/${progress.total}`;}});
    return this;
  }
  async localReady(){if(!this.config?.local?.enabled||!this.config.local.ready)return false;const installed=avatarPackManager.installed(),expected=String(this.config.local.packVersion||'');return Boolean(installed&&(!expected||String(installed.version)===expected));}
  async decision(){const network=browserConnectionSnapshot(),localReady=await this.localReady(),liveReady=Boolean(this.config?.live?.enabled);return avatarNetworkPolicy({requested:this.mode,...network,localReady,liveReady,liveOptIn:this.liveOptIn,allowLiveOnCellular:Boolean(this.config?.auto?.allowLiveOnCellular)});}
  async apply(){
    const decision=await this.decision();this.lastDecision=decision;let target=decision.mode;if(target==='live'&&!this.engines.has('live'))target=await this.localReady()?'local':'portrait';
    if(this.activeId!==target){const previous=this.engines.get(this.activeId);previous?.interrupt?.();await previous?.destroy?.();const engine=this.engines.get(target)||this.engines.get('portrait');try{await engine.activate();this.activeId=engine.id;}catch(error){await engine.destroy?.();const fallback=this.engines.get('portrait');await fallback.activate();this.activeId='portrait';decision.reason=target==='local'?'local-not-ready':'live-not-ready';this.bus.emit('pg23.avatar.engine.failed',{engine:target,message:String(error?.message||error)});}}
    this.renderStatus();this.bus.emit('pg23.avatar.mode.changed',{requested:this.mode,active:this.activeId,reason:decision.reason});return this.diagnostic();
  }
  async setMode(mode,{explicit=false}={}){this.mode=normalizeAvatarMode(mode);if(explicit&&this.mode==='live')this.liveOptIn=true;this.storage?.setItem?.(this.config?.storageKey||'pocketguide.avatar.mode.v1',this.mode);if(this.nodes.select)this.nodes.select.value=this.mode;return this.apply();}
  async installLocalPack({onProgress}={}){let result;try{result=await avatarPackManager.install(this.config.local.packManifest,{onProgress});}catch(error){result={installed:false,reason:'manifest-unavailable',error};}if(result.installed){this.config.local.ready=true;await this.apply();}else{this.lastDecision={mode:'portrait',reason:'local-install-failed'};this.renderStatus();this.bus.emit('pg23.avatar.pack.failed',{reason:result.reason,message:String(result.error?.message||'Pack indisponible')});}return result;}
  async ensureLocalPack(options={}){if(await this.localReady())return{installed:true,reused:true};if(this.packInstallPromise)return this.packInstallPromise;this.packInstallPromise=this.installLocalPack(options).finally(()=>{this.packInstallPromise=null;});return this.packInstallPromise;}
  renderStatus(){if(this.nodes.status)this.nodes.status.textContent=REASONS[this.lastDecision?.reason]||`${LABELS[this.activeId]||this.activeId} actif`;if(this.nodes.root)this.nodes.root.dataset.avatarEngine=this.activeId||'portrait';}
  interrupt(){this.engines.get(this.activeId)?.interrupt?.();}
  diagnostic(){return{requested:this.mode,active:this.activeId,decision:this.lastDecision,local:this.engines.get('local')?.diagnostic?.(),liveOptIn:this.liveOptIn};}
  async destroy(){for(const off of this.unsubs.splice(0))off?.();for(const engine of this.engines.values())await engine.destroy?.();this.engines.clear();this.packInstallPromise=null;this.installed=false;}
}

export const avatarEngineController=new AvatarEngineController();

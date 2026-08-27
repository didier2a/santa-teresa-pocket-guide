import {eventBus} from '../../pg16/core/event-bus.js';
import {avatarPackManager} from './avatar-pack-manager.js';
import {TalkingHeadLocalEngine} from './talkinghead-local-engine.js';

const REASONS={
  'local-loading':'Démarrage de Claire 3D…',
  'local-network':'Claire 3D locale · mise en cache en arrière-plan',
  'local-installed':'Claire 3D locale · disponible hors ligne',
  'local-active':'Claire 3D locale active',
  'local-not-ready':'Claire se prépare · connexion requise au premier lancement',
  'local-install-failed':'Téléchargement interrompu · Claire peut être relancée',
  'local-runtime-failed':'Claire n’a pas pu démarrer · touchez Réessayer'
};

class ClaireFallbackEngine{
  constructor(){this.id='portrait';this.root=null;this.portrait=null;this.active=false;}
  install({root,portrait}={}){this.root=root;this.portrait=portrait;return this;}
  async activate(){this.active=true;if(this.portrait){this.portrait.hidden=false;this.portrait.removeAttribute('aria-hidden');}return{active:true};}
  setPresence(){}
  interrupt(){}
  diagnostic(){return{id:this.id,active:this.active,identity:'Claire',offline:true};}
  async destroy(){this.active=false;}
}

export class AvatarEngineController{
  constructor({bus=eventBus,fetchImpl=globalThis.fetch}={}){this.bus=bus;this.fetchImpl=fetchImpl;this.config=null;this.activeId='';this.engines=new Map();this.nodes={};this.unsubs=[];this.installed=false;this.lastDecision=null;this.packInstallPromise=null;}
  async install({root,portrait,host,audioBus,status,retry}={}){
    if(this.installed)return this;this.installed=true;this.nodes={root,portrait,host,status,retry};
    try{const response=await this.fetchImpl('./data/v23-avatar-config.json',{cache:'no-store'});if(!response.ok)throw new Error(`Configuration ${response.status}`);this.config=await response.json();}catch{this.config={defaultMode:'local',fallbackMode:'portrait',local:{enabled:false,ready:false},live:{enabled:false}};}
    this.engines.set('portrait',new ClaireFallbackEngine().install({root,portrait}));
    this.engines.set('local',new TalkingHeadLocalEngine({bus:this.bus}).install({host,portrait,audioBus,config:this.config.local}));
    retry?.addEventListener('click',()=>void this.retry());
    const reconsider=()=>void this.apply();globalThis.addEventListener?.('online',reconsider);globalThis.addEventListener?.('offline',reconsider);
    this.unsubs.push(()=>globalThis.removeEventListener?.('online',reconsider),()=>globalThis.removeEventListener?.('offline',reconsider),this.bus.on('pg23.presence.changed',payload=>this.engines.get(this.activeId)?.setPresence?.(payload?.state)));
    await this.apply();
    if(this.config?.local?.enabled&&this.config.local.ready&&!this.packInstalled())this.schedulePackInstall();
    return this;
  }
  packInstalled(){const installed=avatarPackManager.installed(),expected=String(this.config?.local?.packVersion||'');return Boolean(installed&&(!expected||String(installed.version)===expected));}
  async localReady(){return Boolean(this.config?.local?.enabled&&this.config.local.ready);}
  async decision(){if(await this.localReady())return{mode:'local',reason:this.packInstalled()?'local-installed':'local-network'};return{mode:'portrait',reason:'local-not-ready'};}
  async apply(){
    const decision=await this.decision();this.lastDecision=decision;const target=decision.mode;
    if(this.activeId!==target){
      const previous=this.engines.get(this.activeId);previous?.interrupt?.();await previous?.destroy?.();
      const engine=this.engines.get(target)||this.engines.get('portrait');
      if(target==='local'){this.lastDecision={mode:'local',reason:'local-loading'};this.renderStatus('preparing');}
      try{await engine.activate();this.activeId=engine.id;this.lastDecision={mode:this.activeId,reason:this.activeId==='local'?'local-active':decision.reason};}
      catch(error){await engine.destroy?.();const fallback=this.engines.get('portrait');await fallback.activate();this.activeId='portrait';this.lastDecision={mode:'portrait',reason:'local-runtime-failed'};this.bus.emit('pg23.avatar.engine.failed',{engine:target,message:String(error?.message||error)});}
    }
    this.renderStatus();this.bus.emit('pg23.avatar.mode.changed',{requested:'local',active:this.activeId,reason:this.lastDecision?.reason});return this.diagnostic();
  }
  schedulePackInstall(){const start=()=>void this.ensureLocalPack({onProgress:progress=>{if(this.nodes.status)this.nodes.status.textContent=`Claire hors ligne · ${progress.index}/${progress.total} fichiers`;}});if(typeof globalThis.requestIdleCallback==='function')globalThis.requestIdleCallback(start,{timeout:5000});else globalThis.setTimeout?.(start,1800);}
  async installLocalPack({onProgress}={}){let result;try{result=await avatarPackManager.install(this.config.local.packManifest,{onProgress});}catch(error){result={installed:false,reason:'manifest-unavailable',error};}if(result.installed){this.lastDecision={mode:this.activeId||'local',reason:'local-installed'};if(this.activeId!=='local')await this.apply();else this.renderStatus();}else{this.lastDecision={mode:this.activeId||'portrait',reason:'local-install-failed'};this.renderStatus(this.activeId==='local'?'local':'failed');this.bus.emit('pg23.avatar.pack.failed',{reason:result.reason,message:String(result.error?.message||'Pack indisponible')});}return result;}
  async ensureLocalPack(options={}){if(this.packInstalled())return{installed:true,reused:true};if(this.packInstallPromise)return this.packInstallPromise;this.packInstallPromise=this.installLocalPack(options).finally(()=>{this.packInstallPromise=null;});return this.packInstallPromise;}
  async retry(){if(this.nodes.retry)this.nodes.retry.hidden=true;this.lastDecision={mode:'local',reason:'local-loading'};this.renderStatus('preparing');const result=await this.ensureLocalPack({onProgress:progress=>{if(this.nodes.status)this.nodes.status.textContent=`Nouvelle tentative · ${progress.index}/${progress.total}`;}});if(result.installed&&this.activeId!=='local')await this.apply();return result;}
  async setMode(){return this.apply();}
  renderStatus(state=''){
    if(this.nodes.status)this.nodes.status.textContent=REASONS[this.lastDecision?.reason]||'Claire 3D locale';
    const failed=['local-runtime-failed','local-install-failed'].includes(this.lastDecision?.reason);if(this.nodes.retry)this.nodes.retry.hidden=!failed;
    if(this.nodes.root)this.nodes.root.dataset.avatarEngine=state||((this.activeId==='local')?'local':failed?'failed':this.activeId||'preparing');
  }
  interrupt(){this.engines.get(this.activeId)?.interrupt?.();}
  diagnostic(){return{requested:'local',identity:'Claire',active:this.activeId,decision:this.lastDecision,packInstalled:this.packInstalled(),local:this.engines.get('local')?.diagnostic?.()};}
  async destroy(){for(const off of this.unsubs.splice(0))off?.();for(const engine of this.engines.values())await engine.destroy?.();this.engines.clear();this.packInstallPromise=null;this.installed=false;}
}

export const avatarEngineController=new AvatarEngineController();

import {eventBus} from '../../pg16/core/event-bus.js';
import {livingSceneStore} from '../storage/living-scene-store.js';

export const SCENE_TYPES=Object.freeze(['speech','thinking','route','media','poi','map','direction','arrival','preview','memory','consent','continuity','error']);
const ICONS={thinking:'✦',route:'⌁',media:'◫',poi:'◎',map:'⌖',direction:'➜',arrival:'◇',preview:'◉',memory:'♡',consent:'◌',continuity:'↺',error:'!'};
const KICKERS={speech:'Votre accompagnatrice',thinking:'Je réfléchis avec vous',route:'Votre parcours',media:'Je vous montre',poi:'Une étape à découvrir',map:'Votre chemin',direction:'En marchant',arrival:'Nous y sommes',preview:'Avant de partir',memory:'Votre souvenir privé',consent:'Votre choix',continuity:'Mode essentiel',error:'Je reste avec vous'};
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const safeUrl=value=>{const input=String(value||'').trim();if(!input)return'';try{const url=new URL(input,globalThis.location?.href||'https://pocketguide.local/');return ['https:','http:','blob:','data:'].includes(url.protocol)?url.href:'';}catch{return'';}};

export function normalizeScene(input={},index=0){
  const type=SCENE_TYPES.includes(input.type)?input.type:'continuity',createdAt=input.createdAt||new Date().toISOString(),id=String(input.id||`${type}-${Date.now()}-${index}`).replace(/[^a-zA-Z0-9._:-]/g,'-').slice(0,120);return{id,type,createdAt,source:String(input.source||'runtime').slice(0,80),persist:Boolean(input.persist),title:String(input.title||KICKERS[type]||'PocketGuide').trim().slice(0,240),text:String(input.text||'').trim().slice(0,4000),image:safeUrl(input.image),attribution:input.attribution?{label:String(input.attribution.label||'').slice(0,300),url:safeUrl(input.attribution.url)}:null,places:Array.isArray(input.places)?input.places.slice(0,10).map(place=>String(place?.name||place).slice(0,160)):[],meta:input.meta&&typeof input.meta==='object'?{...input.meta}:{}};
}

export function sceneMarkup(scene){
  const avatar=scene.type==='speech'?'<div class="scene-avatar" aria-hidden="true"><span class="claire-mark">C</span></div>':`<div class="scene-icon" aria-hidden="true">${ICONS[scene.type]||'•'}</div>`,caption=scene.attribution?.url?`<a href="${esc(scene.attribution.url)}" target="_blank" rel="noopener noreferrer">${esc(scene.attribution.label||'Source de l’image')}</a>`:esc(scene.attribution?.label||'Illustration du parcours'),image=scene.image?`<figure class="scene-media"><img src="${esc(scene.image)}" alt="${esc(scene.title)}" loading="lazy"><figcaption>${caption}</figcaption></figure>`:'',places=scene.places.length?`<div class="scene-places">${scene.places.map(place=>`<span>${esc(place)}</span>`).join('')}</div>`:'';return`${avatar}<div class="scene-copy"><span class="scene-kicker">${esc(KICKERS[scene.type]||'PocketGuide')}</span><h3>${esc(scene.title)}</h3>${scene.text?`<p>${esc(scene.text)}</p>`:''}<small>${esc(scene.persist?'Conservé avec le voyage':'Pour cette conversation')}</small></div>${image}${places}`;
}

export class LivingSceneEngine{
  constructor({bus=eventBus,limit=48,store=livingSceneStore}={}){this.bus=bus;this.limit=limit;this.store=store;this.scopeId='default';this.items=[];this.ids=new Map();this.host=null;this.countHost=null;this.onScene=null;}
  install({host,countHost,scopeId}={}){this.host=host||this.host;this.countHost=countHost||this.countHost;this.scopeId=scopeId||this.scopeId;if(this.host?.querySelector('[data-scene-id="welcome"]')){const welcome=normalizeScene({id:'welcome',type:'speech',title:'Je suis avec vous.',text:'Parlez naturellement. Les cartes, les images et les étapes apparaîtront ici au rythme de notre échange.',source:'shell'});this.items=[welcome];this.ids.set(welcome.id,welcome);}this.restore(this.scopeId,{keepEphemeral:true});this.renderCount();return this;}
  create(input={}){
    const scene=normalizeScene(input,this.items.length),existing=this.ids.get(scene.id);if(existing){const updated={...existing,...scene,createdAt:existing.createdAt};this.ids.set(scene.id,updated);this.items=this.items.map(item=>item.id===scene.id?updated:item);this.render(updated,true);if(updated.persist)this.persist();this.bus.emit('pg23.scene.updated',{scene:updated});return updated;}
    this.items.push(scene);this.ids.set(scene.id,scene);while(this.items.length>this.limit){const removed=this.items.shift();if(removed)this.ids.delete(removed.id);this.host?.querySelector?.(`[data-scene-id="${globalThis.CSS?.escape?.(removed?.id)||removed?.id}"]`)?.remove?.();}this.render(scene,false);this.renderCount();if(scene.persist)this.persist();this.bus.emit('pg23.scene.created',{scene});this.onScene?.(scene);return scene;
  }
  render(scene,update=false){if(!this.host||typeof document==='undefined')return null;let node=this.host.querySelector(`[data-scene-id="${globalThis.CSS?.escape?.(scene.id)||scene.id}"]`);if(!node){node=document.createElement('article');node.dataset.sceneId=scene.id;node.dataset.sceneType=scene.type;node.className=`living-scene living-scene--${scene.type}`;this.host.append(node);}node.dataset.mediaStatus=scene.meta?.mediaStatus||'';node.innerHTML=sceneMarkup(scene);node.classList.toggle('is-current',scene===this.items.at(-1));for(const other of this.host.querySelectorAll('.living-scene.is-current'))if(other!==node)other.classList.remove('is-current');if(!update)requestAnimationFrame(()=>node.classList.add('is-presented'));else node.classList.add('is-presented');this.bus.emit('pg23.scene.presented',{scene,node});return node;}
  renderCount(){if(this.countHost)this.countHost.textContent=`${this.items.length} scène${this.items.length>1?'s':''}`;}
  byType(type){return this.items.filter(item=>item.type===type);}
  persistent(){return this.items.filter(item=>item.persist);}
  persist(){return this.store?.save?.(this.scopeId,this.persistent())||0;}
  restore(scopeId=this.scopeId,{keepEphemeral=false}={}){
    this.scopeId=String(scopeId||'default');const restored=(this.store?.load?.(this.scopeId)||[]).map(normalizeScene),base=keepEphemeral?this.items.filter(item=>!item.persist):[];this.items=base;this.ids=new Map(base.map(item=>[item.id,item]));for(const scene of restored){if(this.ids.has(scene.id))continue;this.items.push(scene);this.ids.set(scene.id,scene);this.render(scene,false);}this.renderCount();this.bus.emit('pg23.scene.restored',{scopeId:this.scopeId,count:restored.length});return restored;
  }
  setScope(scopeId,{restore=true}={}){if(scopeId===this.scopeId)return this.scopeId;this.persist();if(this.host)for(const node of this.host.querySelectorAll('[data-scene-id]'))node.remove();this.items=[];this.ids.clear();this.scopeId=String(scopeId||'default');if(restore)this.restore(this.scopeId);return this.scopeId;}
  clearEphemeral(){const keep=this.persistent();this.items=keep;this.ids=new Map(keep.map(item=>[item.id,item]));if(this.host)for(const node of this.host.querySelectorAll('[data-scene-id]'))if(!this.ids.has(node.dataset.sceneId))node.remove();this.persist();this.renderCount();return keep;}
}

export const livingSceneEngine=new LivingSceneEngine();
export {safeUrl};

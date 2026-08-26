const PREFIX='pocketguide.pg231.scenes.v1';

function cleanScope(value='default'){
  return String(value||'default').replace(/[^a-zA-Z0-9._:-]/g,'-').slice(0,96)||'default';
}

function serializableScene(scene={}){
  return {
    id:String(scene.id||''),type:String(scene.type||'continuity'),createdAt:String(scene.createdAt||''),source:String(scene.source||'runtime'),persist:true,
    title:String(scene.title||''),text:String(scene.text||''),image:String(scene.image||''),attribution:scene.attribution?{label:String(scene.attribution.label||''),url:String(scene.attribution.url||'')}:null,
    places:Array.isArray(scene.places)?scene.places.map(String):[],meta:scene.meta&&typeof scene.meta==='object'?JSON.parse(JSON.stringify(scene.meta)):{}
  };
}

export class MemorySceneStorage{
  constructor(){this.values=new Map();}
  getItem(key){return this.values.has(key)?this.values.get(key):null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}

export class LivingSceneStore{
  constructor({storage=globalThis.localStorage,prefix=PREFIX,limit=48}={}){this.storage=storage;this.prefix=prefix;this.limit=limit;}
  key(scopeId){return`${this.prefix}:${cleanScope(scopeId)}`;}
  load(scopeId){
    try{const parsed=JSON.parse(this.storage?.getItem?.(this.key(scopeId))||'[]');return Array.isArray(parsed)?parsed.filter(item=>item?.persist&&item?.id).slice(-this.limit):[];}catch{return[];}
  }
  save(scopeId,scenes=[]){
    const values=(Array.isArray(scenes)?scenes:[]).filter(scene=>scene?.persist&&scene?.id).slice(-this.limit).map(serializableScene);
    try{this.storage?.setItem?.(this.key(scopeId),JSON.stringify(values));return values.length;}catch{return 0;}
  }
  clear(scopeId){try{this.storage?.removeItem?.(this.key(scopeId));return true;}catch{return false;}}
}

export const livingSceneStore=new LivingSceneStore();
export {PREFIX as LIVING_SCENE_STORAGE_PREFIX,cleanScope,serializableScene};

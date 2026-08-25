import {pocketGuideState} from './pocketguide-state.js';
import {eventBus} from './event-bus.js';

const STORAGE_KEY='pocketguide-16-state-rc1';
const MAX_AGE_MS=1000*60*60*24*30;

function storage(){try{return globalThis.localStorage||null}catch{return null}}
function safeParse(raw){try{return JSON.parse(raw)}catch{return null}}
function persistable(state){
  const copy=structuredClone?structuredClone(state):JSON.parse(JSON.stringify(state));
  if(copy?.conversation){copy.conversation.status='idle';}
  if(copy?.proposals){copy.proposals.pending=null;}
  if(copy?.perception){copy.perception.camera='unknown';copy.perception.microphone='unknown';copy.perception.orientation='unknown';}
  return {savedAt:new Date().toISOString(),state:copy};
}

export function saveStateSnapshot(){
  const target=storage();if(!target)return false;
  try{target.setItem(STORAGE_KEY,JSON.stringify(persistable(pocketGuideState.get())));eventBus.emit('state.persisted',{key:STORAGE_KEY});return true}catch(error){eventBus.emit('state.persist.failed',{error:String(error?.message||error)});return false;}
}

export function restoreStateSnapshot(){
  const target=storage();if(!target)return null;
  const parsed=safeParse(target.getItem(STORAGE_KEY));if(!parsed?.state||!parsed.savedAt)return null;
  const age=Date.now()-Date.parse(parsed.savedAt);if(!Number.isFinite(age)||age<0||age>MAX_AGE_MS)return null;
  const restored=pocketGuideState.replace(parsed.state,{source:'state-persistence'});
  pocketGuideState.patch({boot:{restoredAt:new Date().toISOString()},session:{lastActiveAt:new Date().toISOString()},trip:{resumedAt:new Date().toISOString()}},{source:'state-persistence',event:'app.state.restored'});
  return restored;
}

export function clearStateSnapshot(){const target=storage();if(!target)return false;target.removeItem(STORAGE_KEY);eventBus.emit('state.persist.cleared',{});return true;}

export function installAutoPersistence(){
  if(typeof addEventListener!=='function')return ()=>{};
  const save=()=>saveStateSnapshot();
  addEventListener('pagehide',save);addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});
  const off=eventBus.on('*',event=>{if(/^(route\.|preference\.|memory\.|proposal\.|transaction\.)/.test(event.type))save();});
  return ()=>off?.();
}

export {STORAGE_KEY};
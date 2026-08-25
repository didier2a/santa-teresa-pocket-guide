import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';

const VALID_SCOPE=new Set(['working','session','trip','persistent']);

function now(){return new Date().toISOString();}
function cleanKey(key){const value=String(key||'').trim();if(!/^[a-z][a-z0-9_.-]{1,80}$/i.test(value))throw new Error('Clé mémoire invalide');return value;}
function memoryPath(scope){if(scope==='persistent')return 'preferences.persistent';if(scope==='session')return 'memory.session';if(scope==='trip')return 'memory.trip';return 'memory.working';}
function getAt(obj,path){return path.split('.').reduce((v,k)=>v?.[k],obj);}

export class MemoryStore {
  remember(key,value,{scope='session',source='user',confidence=1}={}){
    if(!VALID_SCOPE.has(scope))throw new Error(`Portée mémoire invalide: ${scope}`);key=cleanKey(key);
    const path=memoryPath(scope);const current=pocketGuideState.select(path)||{};
    const entry={value,scope,source,confidence:Math.max(0,Math.min(1,Number(confidence)||0)),createdAt:current[key]?.createdAt||now(),updatedAt:now(),lastUsedAt:null};
    const root=path.split('.')[0],leaf=path.split('.')[1];
    pocketGuideState.patch({[root]:{[leaf]:{...current,[key]:entry}}},{source:'memory-store',event:'memory.remembered'});
    return entry;
  }

  recall(key,{scope}={}){
    key=cleanKey(key);const scopes=scope?[scope]:['working','session','trip','persistent'];
    for(const candidate of scopes){if(!VALID_SCOPE.has(candidate))continue;const path=memoryPath(candidate);const current=pocketGuideState.select(path)||{};const entry=current[key];if(entry){entry.lastUsedAt=now();return {...entry};}}
    return null;
  }

  forget(key,{scope}={}){
    key=cleanKey(key);const targets=scope?[scope]:['working','session','trip','persistent'];let removed=false;
    for(const candidate of targets){if(!VALID_SCOPE.has(candidate))continue;const path=memoryPath(candidate);const current={...(pocketGuideState.select(path)||{})};if(!(key in current))continue;delete current[key];const root=path.split('.')[0],leaf=path.split('.')[1];pocketGuideState.patch({[root]:{[leaf]:current}},{source:'memory-store',event:'memory.forgotten'});removed=true;}
    return removed;
  }

  list({scope}={}){
    if(scope){const path=memoryPath(scope);return {...(pocketGuideState.select(path)||{})};}
    const s=pocketGuideState.get();return {working:{...(s.memory?.working||{})},session:{...(s.memory?.session||{})},trip:{...(s.memory?.trip||{})},persistent:{...(s.preferences?.persistent||{})}};
  }

  setPreference(key,value,{scope='persistent',source='user'}={}){return this.remember(`preference.${cleanKey(key)}`,value,{scope:scope==='session'?'session':'persistent',source,confidence:1});}
  forgetPreference(key){const normalized=`preference.${cleanKey(key)}`;return this.forget(normalized);}
}

export const memoryStore=new MemoryStore();
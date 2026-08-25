import {eventBus} from './event-bus.js';

const DEFAULT_STATE=Object.freeze({
  version:'1.6.0-rc1',
  boot:{status:'idle',startedAt:null,restoredAt:null},
  user:{language:'fr'},
  session:{id:null,startedAt:null,lastActiveAt:null,simulation:false},
  trip:{active:false,startedAt:null,resumedAt:null},
  route:{activeId:null,title:null,pack:null,currentEventId:null,nextEventId:null,completedEventIds:[],skippedEventIds:[],remainingMinutes:null},
  location:{lat:null,lng:null,accuracy:null,heading:null,updatedAt:null},
  device:{online:typeof navigator==='undefined'?true:navigator.onLine,standalone:false,platform:'web',battery:null},
  connectivity:{online:typeof navigator==='undefined'?true:navigator.onLine,lastChangedAt:null,realtime:false},
  perception:{gps:'unknown',orientation:'unknown',camera:'unknown',microphone:'unknown'},
  conversation:{status:'idle',currentTopic:null,currentPlaceId:null,lastMentionedPlaceId:null,lastAction:null,lastObjectType:null,lastObjectId:null},
  preferences:{session:{},persistent:{}},
  memory:{working:{},session:{},trip:{}},
  proposals:{pending:null,lastResolved:null},
  ui:{panel:'guide',ar:false,mapReady:false},
  diagnostics:{lastError:null}
});

function clone(value){return typeof globalThis.structuredClone==='function'?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));}
function deepMerge(target,patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))return patch;
  const out={...(target&&typeof target==='object'&&!Array.isArray(target)?target:{})};
  for(const [key,value] of Object.entries(patch))out[key]=value&&typeof value==='object'&&!Array.isArray(value)?deepMerge(out[key],value):value;
  return out;
}

export class PocketGuideState {
  constructor(initial={}){this._state=deepMerge(clone(DEFAULT_STATE),initial);}
  get(){return clone(this._state);}
  select(path){return path.split('.').reduce((value,key)=>value?.[key],this._state);}
  patch(patch,{source='core',event='state.changed'}={}){
    const before=this.get();this._state=deepMerge(this._state,patch);const after=this.get();
    eventBus.emit(event,{source,patch:clone(patch),before,after});return after;
  }
  replace(next,{source='core'}={}){const before=this.get();this._state=deepMerge(clone(DEFAULT_STATE),next);const after=this.get();eventBus.emit('state.replaced',{source,before,after});return after;}
  reset({source='core'}={}){return this.replace({}, {source});}
}

export const pocketGuideState=new PocketGuideState();
export {DEFAULT_STATE};
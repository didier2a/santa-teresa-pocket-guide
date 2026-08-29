function clone(value){
  if(typeof structuredClone==='function')return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function merge(base,patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))return patch;
  const next={...(base&&typeof base==='object'&&!Array.isArray(base)?base:{})};
  for(const [key,value] of Object.entries(patch))next[key]=value&&typeof value==='object'&&!Array.isArray(value)?merge(next[key],value):value;
  return next;
}

export class StateStore{
  constructor(initialState={},bus=null){this.state=clone(initialState);this.bus=bus;}
  get(){return clone(this.state);}
  select(path){return String(path||'').split('.').filter(Boolean).reduce((value,key)=>value?.[key],this.state);}
  patch(patch,meta={}){
    const before=this.get();this.state=merge(this.state,patch);const after=this.get();
    this.bus?.emit('pg4.state.changed',{before,after,patch:clone(patch),meta});return after;
  }
}

export const initialV4State={
  version:'4.0.0-preview.3',
  presence:'ready',
  view:'guide',
  intent:null,
  action:null,
  proposal:null,
  activeRoute:null,
  evidence:null,
  sensors:{microphone:'unknown',gps:'unknown',camera:'unknown',orientation:'unknown'},
  network:{online:typeof navigator==='undefined'?true:navigator.onLine!==false}
};

const DEFAULT_KEY='pg4-action-audit-v1';
const SECRET_KEY=/token|secret|authorization|api.?key|password/i;
const SECRET_VALUE=/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/g;

function redact(value,key=''){
  if(SECRET_KEY.test(key))return'[redacted]';
  if(typeof value==='string')return value.replace(SECRET_VALUE,'[redacted]');
  if(Array.isArray(value))return value.map(item=>redact(item));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([childKey,child])=>[childKey,redact(child,childKey)]));
  return value;
}

export class AuditLog{
  constructor({storage=globalThis.localStorage,key=DEFAULT_KEY,limit=200}={}){this.storage=storage;this.key=key;this.limit=limit;this.memory=[];}
  list(){
    try{const value=JSON.parse(this.storage?.getItem?.(this.key)||'[]');return Array.isArray(value)?value:this.memory;}
    catch{return[...this.memory]}
  }
  append(entry){
    const safe=redact(entry);const next=[safe,...this.list()].slice(0,this.limit);this.memory=next;
    try{this.storage?.setItem?.(this.key,JSON.stringify(next))}catch{}
    return safe;
  }
  clear(){this.memory=[];try{this.storage?.removeItem?.(this.key)}catch{}}
}

export {DEFAULT_KEY as PG4_AUDIT_KEY,redact as redactAuditValue};


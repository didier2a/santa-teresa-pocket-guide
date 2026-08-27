const VERSION='2.3.3';
const EVENTS=new Set(['runtime.ready','command.completed','command.failed','gps.denied','gps.error','gps.unavailable','presentation.failed']);
const sent=new Set();
const clean=value=>String(value||'').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(0,48);

export function buildClientDiagnostic(event,detail={},navigatorLike=globalThis.navigator){
  const type=clean(event);if(!EVENTS.has(type))return null;return{event:type,version:VERSION,status:clean(detail.status),code:clean(detail.code),intent:clean(detail.intent),serviceWorker:navigatorLike?.serviceWorker?.controller?'controlled':'uncontrolled',online:navigatorLike?.onLine!==false};
}

export async function reportClientDiagnostic(event,detail={},options={}){
  const locationLike=options.locationLike||globalThis.location,navigatorLike=options.navigatorLike||globalThis.navigator,hostname=String(locationLike?.hostname||'').toLowerCase();if(!hostname.endsWith('.vercel.app'))return false;const payload=buildClientDiagnostic(event,detail,navigatorLike);if(!payload)return false;const key=[payload.event,payload.status,payload.code,payload.intent].join(':');if(sent.has(key))return true;sent.add(key);
  const fetchImpl=options.fetchImpl||globalThis.fetch?.bind(globalThis);if(!fetchImpl)return false;try{const response=await fetchImpl('/api/client-diagnostic',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload),keepalive:true});return response.ok;}catch{return false;}
}

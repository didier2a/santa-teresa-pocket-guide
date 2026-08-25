// PocketGuide 1.5.1 Cloudflare Worker — OpenAI Realtime GA + verified AI Planner
const ALLOWED_ORIGINS=new Set(['https://didier2a.github.io']);
const RATE=new Map();
const RATE_WINDOW_MS=60_000;
const LIMITS={plan:8,realtime:20};

function cors(origin){
  const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  if(ALLOWED_ORIGINS.has(origin))headers.set('Access-Control-Allow-Origin',origin);
  if(origin.startsWith('http://localhost')||origin.startsWith('http://127.0.0.1'))headers.set('Access-Control-Allow-Origin',origin);
  headers.set('Vary','Origin');
  headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers','Content-Type');
  return headers;
}
function json(data,status=200,origin=''){const h=cors(origin);h.set('Content-Type','application/json;charset=UTF-8');return new Response(JSON.stringify(data),{status,headers:h})}
function allowedOrigin(origin){return ALLOWED_ORIGINS.has(origin)||origin.startsWith('http://localhost')||origin.startsWith('http://127.0.0.1')}
function clientIp(request){return request.headers.get('CF-Connecting-IP')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'}
function rateOk(request,bucket){const now=Date.now(),key=`${bucket}:${clientIp(request)}`,limit=LIMITS[bucket]||10;let x=RATE.get(key);if(!x||now-x.start>RATE_WINDOW_MS)x={start:now,count:0};x.count++;RATE.set(key,x);if(RATE.size>1500)for(const [k,v] of RATE)if(now-v.start>RATE_WINDOW_MS*2)RATE.delete(k);return x.count<=limit}
function slug(value='route'){return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,58)||'route'}
function extractOutputText(payload){if(typeof payload?.output_text==='string')return payload.output_text;const chunks=[];for(const item of payload?.output||[]){for(const c of item?.content||[]){if(typeof c?.text==='string')chunks.push(c.text)}}return chunks.join('\n').trim()}
function parseJsonText(text=''){let raw=String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();const first=raw.indexOf('{'),last=raw.lastIndexOf('}');if(first>=0&&last>first)raw=raw.slice(first,last+1);return JSON.parse(raw)}
function collectSourceUrls(value,out=new Set()){if(!value||out.size>=20)return out;if(typeof value==='string'&&/^https:\/\//.test(value)){out.add(value);return out}if(Array.isArray(value)){for(const v of value)collectSourceUrls(v,out);return out}if(typeof value==='object')for(const [k,v] of Object.entries(value)){if((k==='url'||k==='source_url')&&typeof v==='string'&&/^https:\/\//.test(v))out.add(v);else collectSourceUrls(v,out)}return out}
function basicPackCheck(pack){if(!pack||pack.schemaVersion!=='1.0'||!pack.id||!pack.title||!pack.timezone||!Array.isArray(pack.days)||!pack.days.length||!Array.isArray(pack.places)||!pack.places.length)return false;const ids=new Set(pack.places.map(p=>p.id));return pack.places.every(p=>p.id&&p.name&&Number.isFinite(p.lat)&&p.lat>=-90&&p.lat<=90&&Number.isFinite(p.lng)&&p.lng>=-180&&p.lng<=180)&&pack.days.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')&&Array.isArray(d.events)&&d.events.every(e=>e.id&&e.title&&/^\d{2}:\d{2}$/.test(e.time||'')&&/^\d{2}:\d{2}$/.test(e.end||'')&&(!e.placeId||ids.has(e.placeId))))}
function routePackSchema(maxPlaces){return{type:'object',additionalProperties:false,required:['schemaVersion','id','title','subtitle','timezone','travelers','start','end','days','places','meta'],properties:{schemaVersion:{type:'string',enum:['1.0']},id:{type:'string',pattern:'^[a-z0-9][a-z0-9-]{2,63}$'},title:{type:'string'},subtitle:{type:'string'},timezone:{type:'string'},travelers:{type:'integer',minimum:1,maximum:20},start:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},end:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},days:{type:'array',minItems:1,maxItems:7,items:{type:'object',additionalProperties:false,required:['date','label','events'],properties:{date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},label:{type:'string'},events:{type:'array',minItems:1,maxItems:16,items:{type:'object',additionalProperties:false,required:['id','time','end','title','placeId','place','type','priority','mustSee'],properties:{id:{type:'string'},time:{type:'string',pattern:'^\\d{2}:\\d{2}$'},end:{type:'string',pattern:'^\\d{2}:\\d{2}$'},title:{type:'string'},placeId:{type:'string'},place:{type:'string'},type:{type:'string'},priority:{type:'integer',minimum:0,maximum:100},mustSee:{type:'boolean'}}}}}}},places:{type:'array',minItems:3,maxItems:maxPlaces,items:{type:'object',additionalProperties:false,required:['id','name','lat','lng','description','historyShort','historyLong','arCue','note','priority','mustSee','sourceLabel','sourceUrl'],properties:{id:{type:'string'},name:{type:'string'},lat:{type:'number',minimum:-90,maximum:90},lng:{type:'number',minimum:-180,maximum:180},description:{type:'string'},historyShort:{type:'string'},historyLong:{type:'string'},arCue:{type:'string'},note:{type:'string'},priority:{type:'integer',minimum:0,maximum:100},mustSee:{type:'boolean'},sourceLabel:{type:'string'},sourceUrl:{type:'string'}}}},meta:{type:'object',additionalProperties:false,required:['source','verifiedAt'],properties:{source:{type:'string'},verifiedAt:{type:'string'}}}}}}

async function realtimeCall(request,env,origin){
  if(!env.OPENAI_API_KEY)return json({error:'OPENAI_API_KEY absente du Worker'},503,origin);
  if(!rateOk(request,'realtime'))return json({error:'Trop de connexions Realtime. Réessayez dans une minute.'},429,origin);
  const contentType=request.headers.get('Content-Type')||'';if(!contentType.includes('application/sdp'))return json({error:'SDP attendu'},415,origin);
  const declared=Number(request.headers.get('Content-Length')||0);if(declared>250000)return json({error:'SDP trop volumineux'},413,origin);
  const sdp=await request.text();if(!sdp||sdp.length>250000)return json({error:'SDP invalide'},400,origin);
  const model=String(env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1').slice(0,80);
  const requestedVoice=(new URL(request.url)).searchParams.get('voice')||'marin';const voice=['marin','cedar','coral','alloy','ash','ballad','echo','sage','shimmer','verse'].includes(requestedVoice)?requestedVoice:'marin';
  const session={type:'realtime',model,audio:{output:{voice}}};const form=new FormData();form.set('sdp',sdp);form.set('session',JSON.stringify(session));
  const response=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form});
  const body=await response.text();const headers=cors(origin);headers.set('Content-Type',response.headers.get('Content-Type')||'application/sdp');return new Response(body,{status:response.status,headers});
}

async function planRoute(request,env,origin){
  if(!env.OPENAI_API_KEY)return json({error:'OPENAI_API_KEY absente du Worker'},503,origin);
  if(!rateOk(request,'plan'))return json({error:'Trop de demandes Planner. Réessayez dans une minute.'},429,origin);
  const declared=Number(request.headers.get('Content-Length')||0);if(declared>60000)return json({error:'Demande trop volumineuse'},413,origin);
  const raw=await request.text();if(raw.length>60000)return json({error:'Demande trop volumineuse'},413,origin);
  let input;try{input=JSON.parse(raw)}catch{return json({error:'JSON invalide'},400,origin)}
  if(!input||typeof input.prompt!=='string'||input.prompt.trim().length<8||input.prompt.length>8000)return json({error:'Demande de balade insuffisante ou trop longue'},400,origin);
  const destination=String(input.destination||'').trim().slice(0,160);const maxPlaces=Math.max(3,Math.min(10,Number(input.maxPlaces)||5));const timezone=String(input.timezone||'Europe/Paris').trim().slice(0,80)||'Europe/Paris';
  const today=new Date().toISOString().slice(0,10);const routeId=`${slug(destination||input.prompt)}-${today.replaceAll('-','')}`.slice(0,63);const model=String(env.OPENAI_PLANNER_MODEL||'gpt-5.6-terra').slice(0,80);
  const instructions=`Tu es le Planner vérificateur de PocketGuide 1.5.1. Utilise la recherche web pour vérifier chaque lieu réel avant de l'inclure : nom, existence, coordonnées, contexte historique et pertinence touristique. Les coordonnées doivent être fondées sur les résultats de recherche, jamais inventées. Conçois un parcours cohérent à pied. Chaque lieu reçoit priority 0-100 et mustSee. Chaque événement reprend ces notions. Les événements sont sans chevauchement. sourceUrl doit être une URL HTTPS de référence utilisée pour vérifier le lieu. Favorise offices de tourisme, collectivités, monuments officiels et sources encyclopédiques fiables. Date de référence ${today}, fuseau ${timezone}. L'identifiant principal doit être ${routeId}. Produis uniquement l'objet structuré demandé.`;
  const user=`Destination: ${destination||'à déduire'}\nDemande: ${input.prompt.trim()}\nNombre cible de lieux: ${maxPlaces}`;
  const body={model,tools:[{type:'web_search'}],input:[{role:'developer',content:instructions},{role:'user',content:user}],text:{format:{type:'json_schema',name:'pocketguide_routepack',strict:true,schema:routePackSchema(maxPlaces)}},max_output_tokens:9000};
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));if(!response.ok)return json({error:payload?.error?.message||`OpenAI ${response.status}`},response.status,origin);
  let pack;try{pack=parseJsonText(extractOutputText(payload))}catch(error){return json({error:`Réponse Planner non exploitable: ${error.message}`},502,origin)}
  if(!basicPackCheck(pack))return json({error:'Le Planner a produit un RoutePack structurellement incomplet'},502,origin);
  const ids=new Set(pack.places.map(p=>p.id));if(pack.days.some(d=>d.events.some(e=>!ids.has(e.placeId))))return json({error:'Le Planner a produit une référence de lieu invalide'},502,origin);
  pack.meta={...(pack.meta||{}),source:'pocketguide-1.5.1-openai-verified',verifiedAt:new Date().toISOString(),plannerModel:model};
  const verificationSources=[...collectSourceUrls(payload)].slice(0,20);
  return json({ok:true,pack,plannerModel:model,verificationSources},200,origin);
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin')||'';
    if(request.method==='OPTIONS'){if(origin&&!allowedOrigin(origin))return json({error:'Origine non autorisée'},403,origin);return new Response(null,{status:204,headers:cors(origin)})}
    if(url.pathname==='/health'||url.pathname==='/v2/health'||url.pathname==='/v1/health')return json({ok:true,service:'pocketguide-1.5.1',openaiConfigured:Boolean(env.OPENAI_API_KEY),realtimeModel:env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1',plannerModel:env.OPENAI_PLANNER_MODEL||'gpt-5.6-terra',version:'1.5.1'},200,origin);
    if(request.method==='POST'&&!allowedOrigin(origin))return json({error:'Origine non autorisée'},403,origin);
    if(url.pathname==='/v2/realtime/call'&&request.method==='POST')return realtimeCall(request,env,origin);
    if(url.pathname==='/v1/plan'&&request.method==='POST')return planRoute(request,env,origin);
    return json({error:'Route inconnue'},404,origin);
  }
};

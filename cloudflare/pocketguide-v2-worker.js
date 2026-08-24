// PocketGuide 1.5 Cloudflare Worker — OpenAI Realtime GA + AI Planner
const ALLOWED_ORIGINS=new Set(['https://didier2a.github.io']);

function cors(origin){
  const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(ALLOWED_ORIGINS.has(origin))headers.set('Access-Control-Allow-Origin',origin);
  headers.set('Vary','Origin');
  headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers','Content-Type');
  return headers;
}
function json(data,status=200,origin=''){const h=cors(origin);h.set('Content-Type','application/json;charset=UTF-8');return new Response(JSON.stringify(data),{status,headers:h})}
function allowed(req){const origin=req.headers.get('Origin')||'';return !origin||ALLOWED_ORIGINS.has(origin)||origin.includes('localhost')||origin.startsWith('http://127.0.0.1')}
function slug(value='route'){return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,58)||'route'}
function extractOutputText(payload){if(typeof payload?.output_text==='string')return payload.output_text;const chunks=[];for(const item of payload?.output||[]){for(const c of item?.content||[]){if(typeof c?.text==='string')chunks.push(c.text)}}return chunks.join('\n').trim()}
function parseJsonText(text=''){let raw=String(text).trim();raw=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();const first=raw.indexOf('{'),last=raw.lastIndexOf('}');if(first>=0&&last>first)raw=raw.slice(first,last+1);return JSON.parse(raw)}
function basicPackCheck(pack){if(!pack||pack.schemaVersion!=='1.0'||!pack.id||!pack.title||!pack.timezone||!Array.isArray(pack.days)||!pack.days.length||!Array.isArray(pack.places)||!pack.places.length)return false;const ids=new Set(pack.places.map(p=>p.id));return pack.places.every(p=>p.id&&p.name&&Number.isFinite(p.lat)&&Number.isFinite(p.lng))&&pack.days.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')&&Array.isArray(d.events)&&d.events.every(e=>e.id&&e.title&&/^\d{2}:\d{2}$/.test(e.time||'')&&/^\d{2}:\d{2}$/.test(e.end||'')&&(!e.placeId||ids.has(e.placeId))))}

async function realtimeCall(request,env,url,origin){
  if(!env.OPENAI_API_KEY)return json({error:'OPENAI_API_KEY absente du Worker'},503,origin);
  const contentType=request.headers.get('Content-Type')||'';
  if(!contentType.includes('application/sdp'))return json({error:'SDP attendu'},415,origin);
  const sdp=await request.text();if(!sdp||sdp.length>250000)return json({error:'SDP invalide'},400,origin);
  const model=(url.searchParams.get('model')||env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1').slice(0,80);
  const voice=(url.searchParams.get('voice')||'marin').slice(0,40);
  const session={type:'realtime',model,audio:{output:{voice}}};
  const form=new FormData();form.set('sdp',sdp);form.set('session',JSON.stringify(session));
  const response=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form});
  const body=await response.text();const headers=cors(origin);headers.set('Content-Type',response.headers.get('Content-Type')||'application/sdp');return new Response(body,{status:response.status,headers});
}

async function planRoute(request,env,origin){
  if(!env.OPENAI_API_KEY)return json({error:'OPENAI_API_KEY absente du Worker'},503,origin);
  const input=await request.json().catch(()=>null);if(!input||typeof input.prompt!=='string'||input.prompt.trim().length<8)return json({error:'Demande de balade insuffisante'},400,origin);
  const destination=String(input.destination||'').trim();const maxPlaces=Math.max(3,Math.min(10,Number(input.maxPlaces)||5));const timezone=String(input.timezone||'Europe/Paris').trim()||'Europe/Paris';
  const today=new Date().toISOString().slice(0,10);const routeId=`${slug(destination||input.prompt)}-${today.replaceAll('-','')}`.slice(0,63);
  const instructions=`Tu es le Planner de PocketGuide 1.5. Produis UNIQUEMENT un objet JSON RoutePack valide, sans markdown. Le voyage est destiné à un guide touristique audio et Geo-AR mobile. Choisis des lieux réels et géolocalisés, avec latitude et longitude plausibles et précises. Chaque lieu doit avoir id, name, lat, lng, description, historyShort, historyLong, arCue. Crée exactement ${maxPlaces} lieux sauf impossibilité manifeste. Organise un parcours réaliste et cohérent géographiquement, avec horaires sans chevauchement. Les dates sont YYYY-MM-DD et les heures HH:MM. Le JSON doit respecter : {schemaVersion:'1.0',id,title,subtitle,timezone,travelers,start,end,days:[{date,label,events:[{id,time,end,title,placeId,place,type}]}],places:[{id,name,lat,lng,description,historyShort,historyLong,arCue,note}],meta:{source}}. Les placeId doivent référencer les ids des places. L'id principal et tous les ids doivent être simples, minuscules, sans accents ni espaces. Ne mets aucune clé inconnue nécessaire au fonctionnement. Date de référence : ${today}. Fuseau : ${timezone}.`;
  const user=`Destination indiquée: ${destination||'à déduire de la demande'}\nDemande du voyageur: ${input.prompt.trim()}\nIdentifiant RoutePack souhaité: ${routeId}`;
  const model=env.OPENAI_PLANNER_MODEL||'gpt-5.6-terra';
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'developer',content:instructions},{role:'user',content:user}],max_output_tokens:7000})});
  const payload=await response.json().catch(()=>({}));if(!response.ok)return json({error:payload?.error?.message||`OpenAI ${response.status}`},response.status,origin);
  let pack;try{pack=parseJsonText(extractOutputText(payload))}catch(error){return json({error:`Réponse Planner non exploitable: ${error.message}`},502,origin)}
  if(!pack.id)pack.id=routeId;if(!pack.timezone)pack.timezone=timezone;if(!pack.schemaVersion)pack.schemaVersion='1.0';if(!pack.start)pack.start=pack.days?.[0]?.date||today;if(!pack.end)pack.end=pack.days?.at?.(-1)?.date||pack.start;if(!pack.travelers)pack.travelers=1;pack.meta={...(pack.meta||{}),source:'pocketguide-1.5-openai',plannerModel:model};
  if(!basicPackCheck(pack))return json({error:'Le Planner a produit un RoutePack structurellement incomplet'},502,origin);
  return json({ok:true,pack,plannerModel:model},200,origin);
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin')||'';
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
    if(!allowed(request))return json({error:'Origine non autorisée'},403,origin);
    if(url.pathname==='/health'||url.pathname==='/v2/health'||url.pathname==='/v1/health')return json({ok:true,service:'pocketguide-1.5',openaiConfigured:Boolean(env.OPENAI_API_KEY),realtimeModel:env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1',plannerModel:env.OPENAI_PLANNER_MODEL||'gpt-5.6-terra',version:'1.5.0'},200,origin);
    if(url.pathname==='/v2/realtime/call'&&request.method==='POST')return realtimeCall(request,env,url,origin);
    if(url.pathname==='/v1/plan'&&request.method==='POST')return planRoute(request,env,origin);
    return json({error:'Route inconnue'},404,origin);
  }
};

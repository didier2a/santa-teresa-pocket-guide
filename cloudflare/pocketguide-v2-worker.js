// PocketGuide V2 Cloudflare Worker — OpenAI Realtime GA bridge
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

export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin')||'';
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
    if(!allowed(request))return json({error:'Origine non autorisée'},403,origin);
    if(url.pathname==='/health'||url.pathname==='/v2/health')return json({ok:true,service:'pocketguide-v2',openaiConfigured:Boolean(env.OPENAI_API_KEY),version:'2.0.1'},200,origin);
    if(url.pathname==='/v2/realtime/call'&&request.method==='POST'){
      if(!env.OPENAI_API_KEY)return json({error:'OPENAI_API_KEY absente du Worker'},503,origin);
      const contentType=request.headers.get('Content-Type')||'';
      if(!contentType.includes('application/sdp'))return json({error:'SDP attendu'},415,origin);
      const sdp=await request.text();if(!sdp||sdp.length>250000)return json({error:'SDP invalide'},400,origin);
      const model=(url.searchParams.get('model')||env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1').slice(0,80);
      const voice=(url.searchParams.get('voice')||'marin').slice(0,40);
      const session={type:'realtime',model,audio:{output:{voice}}};
      const form=new FormData();
      form.set('sdp',sdp);
      form.set('session',JSON.stringify(session));
      const response=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form});
      const body=await response.text();const headers=cors(origin);headers.set('Content-Type',response.headers.get('Content-Type')||'application/sdp');return new Response(body,{status:response.status,headers});
    }
    return json({error:'Route inconnue'},404,origin);
  }
};

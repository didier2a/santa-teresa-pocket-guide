import {cors} from './_util.js';

const AVATARS_URL='https://api.liveavatar.com/v1/avatars?page=1&page_size=100';

function apiKey(){
  return process.env.LIVEAVATAR_API_KEY||process.env.HEYGEN_API_KEY||'';
}

function originAllowed(req){
  const origin=String(req.headers.origin||'');
  if(!origin)return false;
  let host='';
  try{host=new URL(origin).hostname}catch{return false}
  return origin==='https://didier2a.github.io'||/\.vercel\.app$/i.test(host);
}

function statusCounts(results){
  const counts={ACTIVE:0,INIT:0,DEPLOYING:0,FAILED:0,OTHER:0};
  for(const avatar of results){
    const status=String(avatar?.status||'').toUpperCase();
    if(Object.hasOwn(counts,status))counts[status]+=1;
    else counts.OTHER+=1;
  }
  return counts;
}

function isPocketGuide(avatar){
  return /pocket\s*guide/i.test(String(avatar?.name||''));
}

export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Méthode non autorisée'});
  if(!originAllowed(req))return res.status(403).json({ok:false,error:'Origine non autorisée'});
  const key=apiKey();
  if(!key)return res.status(503).json({ok:false,configured:false,error:'LiveAvatar non configuré'});

  try{
    const response=await fetch(AVATARS_URL,{headers:{'X-API-KEY':key}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      console.error('PocketGuide LiveAvatar diagnostic',response.status);
      return res.status(502).json({
        ok:false,
        configured:true,
        authenticated:false,
        providerStatus:response.status,
        error:'Clé LiveAvatar refusée ou accès insuffisant'
      });
    }

    const results=Array.isArray(payload?.data?.results)?payload.data.results:[];
    const matches=results.filter(isPocketGuide);
    const readyMatches=matches.filter(avatar=>avatar?.status==='ACTIVE'&&!avatar?.is_expired);
    const readyCustom=results.filter(avatar=>avatar?.status==='ACTIVE'&&!avatar?.is_expired);
    return res.status(200).json({
      ok:true,
      configured:true,
      authenticated:true,
      customAvatarCount:Number(payload?.data?.count??results.length),
      statusCounts:statusCounts(results),
      pocketGuide:{
        found:matches.length>0,
        ready:readyMatches.length>0,
        activeCount:readyMatches.length,
        failed:matches.some(avatar=>avatar?.status==='FAILED')
      },
      anyCustomAvatarReady:readyCustom.length>0
    });
  }catch(error){
    console.error('PocketGuide LiveAvatar diagnostic',error?.message||error);
    return res.status(502).json({
      ok:false,
      configured:true,
      authenticated:false,
      error:'LiveAvatar injoignable'
    });
  }
}

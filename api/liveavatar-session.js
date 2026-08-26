import {cors} from './_util.js';

const LIVEAVATAR_TOKEN_URL='https://api.liveavatar.com/v1/sessions/token';

function apiKey(){
  return process.env.LIVEAVATAR_API_KEY||process.env.HEYGEN_API_KEY||'';
}

function originAllowed(req){
  const origin=String(req.headers.origin||'');
  if(!origin)return true;
  let host='';
  try{host=new URL(origin).hostname}catch{return false}
  return origin==='https://didier2a.github.io'||/\.vercel\.app$/i.test(host);
}

function boolEnv(value,fallback=true){
  if(value==null||value==='')return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée'});
  if(!originAllowed(req))return res.status(403).json({error:'Origine non autorisée'});
  const key=apiKey();
  if(!key)return res.status(503).json({error:'LiveAvatar non configuré'});
  if(!process.env.HEYGEN_AVATAR_ID)return res.status(503).json({error:'Identité LiveAvatar non configurée'});

  try{
    const response=await fetch(LIVEAVATAR_TOKEN_URL,{
      method:'POST',
      headers:{
        'X-API-KEY':key,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        mode:'LITE',
        avatar_id:process.env.HEYGEN_AVATAR_ID,
        is_sandbox:boolEnv(process.env.HEYGEN_LIVEAVATAR_SANDBOX,true)
      })
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload?.data?.session_token){
      console.error('PocketGuide LiveAvatar token',response.status,payload?.message||'Réponse invalide');
      return res.status(response.ok?502:response.status).json({error:'Session LiveAvatar indisponible'});
    }
    return res.status(200).json({
      sessionToken:payload.data.session_token,
      sessionId:payload.data.session_id,
      mode:'LITE',
      sandbox:boolEnv(process.env.HEYGEN_LIVEAVATAR_SANDBOX,true)
    });
  }catch(error){
    console.error('PocketGuide LiveAvatar',error?.message||error);
    return res.status(502).json({error:'Connexion LiveAvatar indisponible'});
  }
}

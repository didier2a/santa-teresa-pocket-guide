import {cors,isAllowedOrigin} from './_util.js';

const AVATAR_URL='https://api.liveavatar.com/v1/avatars';
const EMBED_URL='https://api.liveavatar.com/v2/embeddings';
export const POCKETGUIDE_AVATAR_ID='664ff8bb-4932-4644-91f8-b90975d6f549';

function apiKey(){
  return process.env.LIVEAVATAR_API_KEY||process.env.HEYGEN_API_KEY||'';
}

function boolEnv(value,fallback=true){
  if(value==null||value==='')return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function avatarId(){
  return String(process.env.HEYGEN_AVATAR_ID||POCKETGUIDE_AVATAR_ID).trim();
}

function safeHttpsUrl(value){
  try{const url=new URL(String(value||''));return url.protocol==='https:'?url.href:'';}catch{return'';}
}

async function providerJson(url,options){
  const response=await fetch(url,options);
  const payload=await response.json().catch(()=>({}));
  return{response,payload};
}

export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée'});
  if(!isAllowedOrigin(String(req.headers.origin||'')))return res.status(403).json({error:'Origine non autorisée'});

  const key=apiKey();
  if(!key)return res.status(503).json({error:'LiveAvatar non configuré'});

  try{
    const id=avatarId();
    const avatarResult=await providerJson(`${AVATAR_URL}/${encodeURIComponent(id)}`,{
      headers:{'X-API-KEY':key}
    });
    const avatar=avatarResult.payload?.data;
    if(!avatarResult.response.ok||!avatar||avatar.id!==id){
      console.error('PocketGuide LiveAvatar avatar',avatarResult.response.status);
      return res.status(502).json({error:'Identité LiveAvatar invalide ou inaccessible'});
    }
    if(avatar.is_expired)return res.status(410).json({error:'Identité LiveAvatar expirée'});
    if(String(avatar.status||'').toUpperCase()!=='ACTIVE'){
      return res.status(409).json({error:'Identité LiveAvatar pas encore active'});
    }

    const body={
      avatar_id:id,
      type:'DEFAULT',
      max_session_duration:300,
      default_language:'fr',
      is_sandbox:boolEnv(process.env.HEYGEN_LIVEAVATAR_SANDBOX,true),
      orientation:'vertical'
    };
    const voiceId=String(process.env.LIVEAVATAR_VOICE_ID||avatar.default_voice?.id||'').trim();
    const contextId=String(process.env.LIVEAVATAR_CONTEXT_ID||'').trim();
    if(voiceId)body.voice_id=voiceId;
    if(contextId)body.context_id=contextId;

    const embedResult=await providerJson(EMBED_URL,{
      method:'POST',
      headers:{'X-API-KEY':key,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const embed=embedResult.payload?.data;
    const url=safeHttpsUrl(embed?.url);
    if(!embedResult.response.ok||!url){
      console.error('PocketGuide LiveAvatar embed',embedResult.response.status);
      return res.status(502).json({error:'Embed LiveAvatar indisponible'});
    }

    return res.status(200).json({
      url,
      orientation:'vertical',
      sandbox:body.is_sandbox,
      avatarName:String(avatar.name||'Pocket Guide')
    });
  }catch(error){
    console.error('PocketGuide LiveAvatar embed',error?.message||error);
    return res.status(502).json({error:'Connexion LiveAvatar indisponible'});
  }
}

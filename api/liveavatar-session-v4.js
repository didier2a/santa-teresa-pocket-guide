import {cors,isAllowedOrigin} from './_util.js';

const TOKEN_URL='https://api.liveavatar.com/v1/sessions/token';
const SECRETS_URL='https://api.liveavatar.com/v1/secrets';
const CONTEXTS_URL='https://api.liveavatar.com/v1/contexts';
const DEFAULT_AVATAR_ID='664ff8bb-4932-4644-91f8-b90975d6f549';
const OPENAI_SECRET_NAME='PocketGuide OpenAI Realtime';
const CONTEXT_NAME='PocketGuide V4 Orchestrator Realtime';
const CONTEXT=`Tu incarnes PocketGuide V4, une accompagnatrice numérique de voyage chaleureuse, cultivée, élégante et attentive. Tu parles exclusivement en français naturel avec la voix configurée par OpenAI Realtime.

L’application PocketGuide V4 est l’unique source de vérité pour les itinéraires, cartes, coordonnées, photos, textes, capteurs et sauvegardes. Une demande vocale peut exprimer une intention, mais tu ne prétends jamais avoir exécuté une fonction avant la preuve produite par l’application.

Lorsqu’un message commence par [POCKETGUIDE_APP_RESULT], il contient la preuve d’une action réellement exécutée. Prononce seulement ce résultat en une ou deux phrases naturelles. N’invente aucun lieu, trajet, média, état de capteur, autorisation ou succès absent de cette preuve.

Les nouvelles routes restent des propositions jusqu’à confirmation explicite. Les actions peuvent être interrompues. Si une information manque ou si une fonction est dégradée, dis-le clairement sans masquer le défaut.`;

function liveAvatarKey(){return process.env.LIVEAVATAR_API_KEY||process.env.HEYGEN_API_KEY||'';}
function avatarId(){return String(process.env.HEYGEN_AVATAR_ID||DEFAULT_AVATAR_ID).trim();}
function safeProviderMessage(payload,fallback){const value=String(payload?.message||'').trim();return value&&!/key|token|secret/i.test(value)?value:fallback;}
async function providerJson(url,options={}){const response=await fetch(url,options),payload=await response.json().catch(()=>({}));return{response,payload};}

async function ensureOpenAISecret(key){
  const configured=String(process.env.LIVEAVATAR_OPENAI_SECRET_ID||'').trim();if(configured)return configured;
  const listed=await providerJson(SECRETS_URL,{headers:{'X-API-KEY':key}});if(!listed.response.ok)throw new Error(`Secrets LiveAvatar ${listed.response.status}`);
  const existing=(Array.isArray(listed.payload?.data)?listed.payload.data:[]).find(item=>item?.secret_name===OPENAI_SECRET_NAME&&item?.secret_type==='OPENAI_API_KEY');if(existing?.id)return String(existing.id);
  const openaiKey=String(process.env.OPENAI_API_KEY||'').trim();if(!openaiKey)throw new Error('OpenAI Realtime non configuré');
  const created=await providerJson(SECRETS_URL,{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({secret_name:OPENAI_SECRET_NAME,secret_type:'OPENAI_API_KEY',secret_value:openaiKey})});
  if(!created.response.ok||!created.payload?.data?.id)throw new Error(`Création du secret LiveAvatar ${created.response.status}`);return String(created.payload.data.id);
}

async function ensureContext(key){
  const configured=String(process.env.LIVEAVATAR_CONTEXT_V4_ID||'').trim();if(configured)return configured;
  const listed=await providerJson(`${CONTEXTS_URL}?page=1&page_size=100`,{headers:{'X-API-KEY':key}});if(!listed.response.ok)throw new Error(`Contextes LiveAvatar ${listed.response.status}`);
  const existing=(listed.payload?.data?.results||[]).find(item=>item?.name===CONTEXT_NAME);if(existing?.id)return String(existing.id);
  const created=await providerJson(CONTEXTS_URL,{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({name:CONTEXT_NAME,prompt:CONTEXT,opening_text:'Bonjour. Je suis Pocket Guide V4. Dites-moi ce que vous voulez vivre, je vais préparer et afficher le résultat.'})});
  if(!created.response.ok||!created.payload?.data?.id)throw new Error(`Création du contexte LiveAvatar ${created.response.status}`);return String(created.payload.data.id);
}

export default async function handler(req,res){
  cors(req,res);if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée'});if(!isAllowedOrigin(String(req.headers.origin||'')))return res.status(403).json({error:'Origine non autorisée'});
  const key=liveAvatarKey();if(!key)return res.status(503).json({error:'LiveAvatar non configuré'});if(!process.env.OPENAI_API_KEY&&!process.env.LIVEAVATAR_OPENAI_SECRET_ID)return res.status(503).json({error:'OpenAI Realtime non configuré'});
  try{
    const [secretId,contextId]=await Promise.all([ensureOpenAISecret(key),ensureContext(key)]),model=String(process.env.LIVEAVATAR_OPENAI_MODEL||'gpt-realtime').trim();
    const body={mode:'LITE',avatar_id:avatarId(),is_sandbox:false,max_session_duration:300,video_settings:{quality:'high',encoding:'H264'},openai_realtime_config:{secret_id:secretId,context_id:contextId,voice:'marin',model,temperature:.8}};
    const result=await providerJson(TOKEN_URL,{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify(body)}),token=result.payload?.data?.session_token;
    if(!result.response.ok||!token){console.error('PocketGuide V4 LiveAvatar token',result.response.status);return res.status(result.response.ok?502:result.response.status).json({error:safeProviderMessage(result.payload,'Session LiveAvatar Realtime indisponible')});}
    return res.status(200).json({sessionToken:String(token),sessionId:String(result.payload.data.session_id||''),mode:'LITE',connector:'OPENAI_REALTIME',voice:'marin',model,orientation:'vertical',appVersion:'4.0.0'});
  }catch(error){console.error('PocketGuide V4 LiveAvatar',String(error?.message||error).replace(/sk-[A-Za-z0-9_-]+/g,'[secret]'));return res.status(502).json({error:'Connexion LiveAvatar Realtime indisponible'});}
}


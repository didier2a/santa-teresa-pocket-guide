import {cors,isAllowedOrigin} from './_util.js';

const LIVEAVATAR_TOKEN_URL='https://api.liveavatar.com/v1/sessions/token';
const LIVEAVATAR_SECRETS_URL='https://api.liveavatar.com/v1/secrets';
const LIVEAVATAR_CONTEXTS_URL='https://api.liveavatar.com/v1/contexts';
export const POCKETGUIDE_AVATAR_ID='664ff8bb-4932-4644-91f8-b90975d6f549';
export const OPENAI_SECRET_NAME='PocketGuide OpenAI Realtime';
export const POCKETGUIDE_CONTEXT_NAME='PocketGuide 2.3.2 Realtime';
export const POCKETGUIDE_CONTEXT_233_NAME='PocketGuide 2.3.3 Application Realtime';
export const POCKETGUIDE_CONTEXT_152_NAME='PocketGuide 1.5.2 Companion Realtime';

const POCKETGUIDE_CONTEXT=`Tu incarnes PocketGuide 2.3.2, une accompagnatrice numérique de voyage chaleureuse, cultivée, élégante et attentive. Tu ne te présentes jamais comme une personne physique. Tu parles exclusivement en français naturel avec la voix configurée par OpenAI Realtime.

Réponds brièvement pendant la marche, généralement en une ou deux phrases. N'invente jamais une position, une distance, une direction, un horaire, un état de capteur ou un fait touristique. Lorsque l'information manque, dis-le simplement. Les modifications de parcours restent des propositions jusqu'à confirmation explicite. Tu peux être interrompue naturellement et tu ne répètes pas inutilement ta réponse.`;

const POCKETGUIDE_CONTEXT_233=`Tu incarnes PocketGuide 2.3.3, une accompagnatrice numérique de voyage chaleureuse, cultivée, élégante et attentive. Tu ne te présentes jamais comme une personne physique. Tu parles exclusivement en français naturel avec la voix configurée par OpenAI Realtime.

L'application PocketGuide est la seule source de vérité pour l'itinéraire, le GPS, les cartes, les fiches, les photographies et les voyages sauvegardés. Ne prétends jamais avoir créé, modifié, affiché, sauvegardé ou ouvert quelque chose avant que l'application ne te transmette un résultat.

Lorsqu'un message commence par [POCKETGUIDE_APP_RESULT], il contient le résultat fiable d'une action réellement exécutée par l'application. Prononce ce résultat en français naturel, en une ou deux phrases, sans mentionner le marqueur, la consigne interne ni un outil. N'ajoute aucune action qui ne figure pas dans ce résultat.

Réponds brièvement pendant la marche. N'invente jamais une position, une distance, une direction, un horaire, un état de capteur ou un fait touristique. Les modifications de parcours restent des propositions jusqu'à confirmation explicite. Tu peux être interrompue naturellement et tu ne répètes pas inutilement ta réponse.`;

const POCKETGUIDE_CONTEXT_152=`Tu incarnes le Companion de PocketGuide 1.5.2, une accompagnatrice numérique de voyage chaleureuse, cultivée, élégante et attentive. Tu ne te présentes jamais comme une personne physique. Tu parles exclusivement en français naturel avec la voix configurée par OpenAI Realtime.

Le moteur natif PocketGuide 1.5.2 reste l'unique source de vérité pour le RoutePack, les étapes, les horaires, les cartes, le GPS, la Geo-AR, les médias, les capteurs, le mode hors ligne et les voyages sauvegardés. Le SDK Companion traduit en parallèle certaines demandes vocales explicites en actions de l'application. Tu ne prétends jamais qu'une action a réussi avant que son résultat soit visible dans l'application.

Les actions actuellement raccordées sont l'ouverture de Guide, Carte, Parcours ou Créer, l'activation du GPS ou de la Geo-AR, le raccourcissement du parcours, le saut de la prochaine étape et la sélection d'un lieu nommé. Les autres modifications du RoutePack ne sont pas encore disponibles : explique cette limite au lieu d'inventer un succès.

Réponds brièvement pendant la marche, généralement en une ou deux phrases. N'invente jamais une position, une distance, une direction, un horaire, un état de capteur ou un fait touristique. Les modifications de parcours restent des propositions jusqu'à confirmation explicite. Tu peux être interrompue naturellement et tu ne répètes pas inutilement ta réponse.`;

function contextFor(appVersion){
  if(appVersion==='1.5.2')return{name:POCKETGUIDE_CONTEXT_152_NAME,prompt:POCKETGUIDE_CONTEXT_152,openingText:'Bonjour. Je suis Pocket Guide. La base 1.5.2 est prête et je peux vous accompagner.',configuredId:process.env.LIVEAVATAR_CONTEXT_152_ID};
  return appVersion==='2.3.3'?{name:POCKETGUIDE_CONTEXT_233_NAME,prompt:POCKETGUIDE_CONTEXT_233,openingText:'Bonjour. Je suis Pocket Guide. Je peux agir avec vous sur votre voyage.',configuredId:process.env.LIVEAVATAR_CONTEXT_233_ID}:{name:POCKETGUIDE_CONTEXT_NAME,prompt:POCKETGUIDE_CONTEXT,openingText:'Bonjour. Je suis Pocket Guide. Je vous écoute.',configuredId:process.env.LIVEAVATAR_CONTEXT_ID};
}

function liveAvatarKey(){
  return process.env.LIVEAVATAR_API_KEY||process.env.HEYGEN_API_KEY||'';
}

function avatarId(){
  return String(process.env.HEYGEN_AVATAR_ID||POCKETGUIDE_AVATAR_ID).trim();
}

function safeProviderMessage(payload,fallback){
  const value=String(payload?.message||'').trim();
  return value&&!/key|token|secret/i.test(value)?value:fallback;
}

async function providerJson(url,options={}){
  const response=await fetch(url,options);
  const payload=await response.json().catch(()=>({}));
  return{response,payload};
}

async function ensureOpenAISecret(key){
  const configured=String(process.env.LIVEAVATAR_OPENAI_SECRET_ID||'').trim();
  if(configured)return configured;

  const listed=await providerJson(LIVEAVATAR_SECRETS_URL,{headers:{'X-API-KEY':key}});
  if(!listed.response.ok)throw new Error(`Secrets LiveAvatar ${listed.response.status}`);
  const existing=(Array.isArray(listed.payload?.data)?listed.payload.data:[]).find(item=>item?.secret_name===OPENAI_SECRET_NAME&&item?.secret_type==='OPENAI_API_KEY');
  if(existing?.id)return String(existing.id);

  const openaiKey=String(process.env.OPENAI_API_KEY||'').trim();
  if(!openaiKey)throw new Error('OpenAI Realtime non configuré');
  const created=await providerJson(LIVEAVATAR_SECRETS_URL,{
    method:'POST',
    headers:{'X-API-KEY':key,'Content-Type':'application/json'},
    body:JSON.stringify({secret_name:OPENAI_SECRET_NAME,secret_type:'OPENAI_API_KEY',secret_value:openaiKey})
  });
  if(!created.response.ok||!created.payload?.data?.id)throw new Error(`Création du secret LiveAvatar ${created.response.status}`);
  return String(created.payload.data.id);
}

async function ensurePocketGuideContext(key,context){
  const configured=String(context.configuredId||'').trim();
  if(configured)return configured;

  const listed=await providerJson(`${LIVEAVATAR_CONTEXTS_URL}?page=1&page_size=100`,{headers:{'X-API-KEY':key}});
  if(!listed.response.ok)throw new Error(`Contextes LiveAvatar ${listed.response.status}`);
  const existing=(listed.payload?.data?.results||[]).find(item=>item?.name===context.name);
  if(existing?.id)return String(existing.id);

  const created=await providerJson(LIVEAVATAR_CONTEXTS_URL,{
    method:'POST',
    headers:{'X-API-KEY':key,'Content-Type':'application/json'},
    body:JSON.stringify({
      name:context.name,
      prompt:context.prompt,
      opening_text:context.openingText
    })
  });
  if(!created.response.ok||!created.payload?.data?.id)throw new Error(`Création du contexte LiveAvatar ${created.response.status}`);
  return String(created.payload.data.id);
}

export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée'});
  if(!isAllowedOrigin(String(req.headers.origin||'')))return res.status(403).json({error:'Origine non autorisée'});

  const key=liveAvatarKey();
  if(!key)return res.status(503).json({error:'LiveAvatar non configuré'});
  if(!process.env.OPENAI_API_KEY&&!process.env.LIVEAVATAR_OPENAI_SECRET_ID)return res.status(503).json({error:'OpenAI Realtime non configuré'});

  try{
    const input=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{},requestedVersion=String(input.appVersion||'2.3.2'),appVersion=['1.5.2','2.3.3'].includes(requestedVersion)?requestedVersion:'2.3.2',context=contextFor(appVersion);
    const [secretId,contextId]=await Promise.all([ensureOpenAISecret(key),ensurePocketGuideContext(key,context)]);
    const body={
      mode:'LITE',
      avatar_id:avatarId(),
      is_sandbox:false,
      max_session_duration:300,
      video_settings:{quality:'high',encoding:'H264'},
      openai_realtime_config:{
        secret_id:secretId,
        context_id:contextId,
        voice:'marin',
        model:String(process.env.LIVEAVATAR_OPENAI_MODEL||'gpt-realtime').trim(),
        temperature:0.8
      }
    };
    const tokenResult=await providerJson(LIVEAVATAR_TOKEN_URL,{
      method:'POST',
      headers:{'X-API-KEY':key,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const token=tokenResult.payload?.data?.session_token;
    if(!tokenResult.response.ok||!token){
      console.error('PocketGuide LiveAvatar Realtime token',tokenResult.response.status);
      return res.status(tokenResult.response.ok?502:tokenResult.response.status).json({error:safeProviderMessage(tokenResult.payload,'Session LiveAvatar Realtime indisponible')});
    }
    return res.status(200).json({
      sessionToken:String(token),
      sessionId:String(tokenResult.payload.data.session_id||''),
      mode:'LITE',
      connector:'OPENAI_REALTIME',
      voice:'marin',
      model:body.openai_realtime_config.model,
      orientation:'vertical',
      appVersion
    });
  }catch(error){
    console.error('PocketGuide LiveAvatar Realtime',String(error?.message||error).replace(/sk-[A-Za-z0-9_-]+/g,'[secret]'));
    return res.status(502).json({error:'Connexion LiveAvatar Realtime indisponible'});
  }
}

const ALLOWED_ORIGINS=new Set([
  'https://didier2a.github.io',
  'https://pocketguide-v2.infoserv2a.workers.dev'
]);

export function isAllowedOrigin(origin){
  const value=String(origin||'');
  if(!value)return false;
  let host='';
  try{host=new URL(value).hostname}catch{return false}
  return ALLOWED_ORIGINS.has(value)||/\.vercel\.app$/i.test(host)||/\.winter-chanter\.workers\.dev$/i.test(host);
}

export function cors(req,res){
  const origin=String(req.headers.origin||'');
  if(isAllowedOrigin(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control','no-store');
}

export function guard(req,res){
  cors(req,res);
  if(req.method==='OPTIONS'){res.status(204).end();return false}
  if(req.method!=='POST'){res.status(405).json({error:'Méthode non autorisée'});return false}
  const origin=String(req.headers.origin||'');
  if(origin&&!isAllowedOrigin(origin)){
    res.status(403).json({error:'Origine non autorisée'});return false;
  }
  if(!process.env.OPENAI_API_KEY){res.status(503).json({error:'AI Planner non configuré'});return false}
  return true;
}

export function outputText(payload){
  if(typeof payload?.output_text==='string'&&payload.output_text.trim())return payload.output_text.trim();
  for(const item of payload?.output||[]){for(const part of item?.content||[]){if(typeof part?.text==='string'&&part.text.trim())return part.text.trim()}}
  return '';
}

export function cleanJson(text){
  const value=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  return JSON.parse(value);
}

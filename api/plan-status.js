import {cleanJson,cors,outputText} from './_util.js';
import {validateRoutePack} from '../engine/routepack.js';

export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({error:'Méthode non autorisée'});
  const origin=String(req.headers.origin||'');
  let host='';try{host=new URL(origin||'https://invalid.local').hostname}catch{}
  if(origin&&origin!=='https://didier2a.github.io'&&!/\.vercel\.app$/i.test(host))return res.status(403).json({error:'Origine non autorisée'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'AI Planner non configuré'});
  const id=String(req.query?.id||'').trim();
  if(!/^resp_[A-Za-z0-9_-]{8,}$/.test(id))return res.status(400).json({error:'Identifiant de génération invalide'});
  try{
    const response=await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){const message=payload?.error?.message||`OpenAI Responses ${response.status}`;return res.status(response.status).json({error:message,code:payload?.error?.code||''})}
    const status=payload?.status||'unknown';
    if(status==='queued'||status==='in_progress')return res.status(202).json({status});
    if(status==='failed'||status==='cancelled'||status==='incomplete')return res.status(502).json({status,error:payload?.error?.message||payload?.incomplete_details?.reason||`Génération ${status}`});
    if(status!=='completed')return res.status(202).json({status});
    const text=outputText(payload);if(!text)return res.status(502).json({error:'Réponse structurée vide'});
    const pack=cleanJson(text);
    const report=validateRoutePack(pack);if(!report.valid)return res.status(502).json({error:`RoutePack généré invalide : ${report.errors.map(item=>item.code).join(', ')}`});
    if((pack.places||[]).some(place=>!/^https:\/\//.test(place.sourceUrl||'')))return res.status(502).json({error:'RoutePack généré sans source HTTPS vérifiée'});
    pack.meta={...pack.meta,createdBy:'PocketGuide V4',generator:'openai-ai-planner-v4-base-1.5.2',sourcesCheckedAt:new Date().toISOString()};
    return res.status(200).json({status:'completed',pack,model:payload?.model||process.env.OPENAI_PLANNER_MODEL||'gpt-5.4-mini'});
  }catch(error){console.error('PocketGuide planner status',error?.message||error);return res.status(500).json({error:error?.message||'Impossible de récupérer la génération.'})}
}

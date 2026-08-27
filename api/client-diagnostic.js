import {cors,isAllowedOrigin} from './_util.js';

const EVENTS=new Set(['runtime.ready','command.completed','command.failed','gps.denied','gps.error','gps.unavailable','presentation.failed']);
const clean=value=>String(value||'').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(0,48);

export function normalizeClientDiagnostic(input={}){
  const event=clean(input.event);if(!EVENTS.has(event))return null;
  return {event,version:'2.3.3',status:clean(input.status),code:clean(input.code),intent:clean(input.intent),serviceWorker:input.serviceWorker==='controlled'?'controlled':'uncontrolled',online:input.online!==false};
}

export default function handler(req,res){
  cors(req,res);if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée'});
  const origin=String(req.headers.origin||'');if(origin&&!isAllowedOrigin(origin))return res.status(403).json({error:'Origine non autorisée'});if(Number(req.headers['content-length']||0)>2048)return res.status(413).json({error:'Diagnostic trop volumineux'});
  try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{},diagnostic=normalizeClientDiagnostic(body);if(!diagnostic)return res.status(400).json({error:'Diagnostic invalide'});console.info('[PocketGuide 2.3.3 client]',JSON.stringify(diagnostic));return res.status(204).end();}catch{return res.status(400).json({error:'Diagnostic invalide'});}
}

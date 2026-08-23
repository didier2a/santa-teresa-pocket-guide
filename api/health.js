import {cors} from './_util.js';

export default function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Méthode non autorisée'});
  return res.status(200).json({
    ok:true,
    version:'1.4.6',
    openaiConfigured:Boolean(process.env.OPENAI_API_KEY),
    plannerModel:process.env.OPENAI_PLANNER_MODEL||'gpt-5.4-mini',
    transcribeModel:process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe',
    plannerMode:'background-polling'
  });
}

import {cors} from './_util.js';

export default function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Méthode non autorisée'});
  return res.status(200).json({
    ok:true,
    version:'1.4.9',
    diagnosticRevision:'liveavatar-realtime-v2.4',
    openaiConfigured:Boolean(process.env.OPENAI_API_KEY),
    liveAvatarConfigured:Boolean(process.env.LIVEAVATAR_API_KEY||process.env.HEYGEN_API_KEY),
    liveAvatarIdentityConfigured:Boolean(process.env.HEYGEN_AVATAR_ID),
    liveAvatarMode:'LITE',
    liveAvatarSandbox:/^(1|true|yes|on)$/i.test(String(process.env.HEYGEN_LIVEAVATAR_SANDBOX??'false')),
    plannerModel:process.env.OPENAI_PLANNER_MODEL||'gpt-5.4-mini',
    transcribeModel:process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe',
    ttsModel:process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts',
    ttsVoice:process.env.OPENAI_TTS_VOICE||'coral',
    plannerMode:'background-polling',
    mediaMode:'wikimedia-client-enrichment',
    libraryMode:'local-routepack-library',
    orientationMode:'portrait-landscape-switchable',
    audioCompanionMode:'gps-contextual-openai-tts'
  });
}

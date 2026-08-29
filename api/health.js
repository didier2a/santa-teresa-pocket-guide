import {cors} from './_util.js';

export default function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Méthode non autorisée'});
  return res.status(200).json({
    ok:true,
    version:'4.0.0-preview.6',
    openaiConfigured:Boolean(process.env.OPENAI_API_KEY),
    plannerModel:process.env.OPENAI_PLANNER_MODEL||'gpt-5.4-mini',
    transcribeModel:process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe',
    ttsModel:process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts',
    ttsVoice:process.env.OPENAI_TTS_VOICE||'coral',
    plannerMode:'background-polling',
    mediaMode:'wikimedia-client-enrichment',
    libraryMode:'local-routepack-library',
    orientationMode:'portrait-landscape-switchable',
    liveAvatarConfigured:Boolean(process.env.LIVEAVATAR_API_KEY||process.env.HEYGEN_API_KEY),
    liveAvatarOpenAIConfigured:Boolean(process.env.OPENAI_API_KEY||process.env.LIVEAVATAR_OPENAI_SECRET_ID),
    liveAvatarMode:'LITE',
    avatarIdentityConfigured:Boolean(process.env.HEYGEN_AVATAR_ID),
    audioCompanionMode:'liveavatar-v3-native-openai-realtime-marin',
    companionSdk:'0.2.0',
    companionProvider:'liveavatar-v3',
    orchestrationMode:'native-conversation-capability-sidecar',
    baseVersion:'1.5.2',
    parityGate:'14-capabilities',
    responsiveMedia:'9:16-portrait-16:9-landscape'
  });
}

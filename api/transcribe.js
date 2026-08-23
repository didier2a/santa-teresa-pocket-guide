import {guard} from './_util.js';

const MAX_AUDIO_BYTES=4_500_000;

export default async function handler(req,res){
  if(!guard(req,res))return;
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const base64=String(body.audio||'');
    const mimeType=String(body.mimeType||'audio/webm').slice(0,80);
    if(!base64){return res.status(400).json({error:'Audio absent'})}
    const bytes=Buffer.from(base64,'base64');
    if(!bytes.length||bytes.length>MAX_AUDIO_BYTES)return res.status(413).json({error:'Enregistrement trop volumineux'});

    const ext=mimeType.includes('mp4')?'m4a':mimeType.includes('ogg')?'ogg':'webm';
    const form=new FormData();
    form.append('model',process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe');
    form.append('language','fr');
    form.append('file',new Blob([bytes],{type:mimeType}),`pocketguide-voice.${ext}`);

    const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:form
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload?.error?.message||`Transcription OpenAI ${response.status}`);
    const text=String(payload.text||'').trim();
    if(!text)throw new Error('Aucune parole reconnue');
    res.status(200).json({text,model:process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe'});
  }catch(error){
    console.error('PocketGuide transcribe',error?.message||error);
    res.status(500).json({error:'La transcription a échoué. Réessayez dans quelques secondes.'});
  }
}

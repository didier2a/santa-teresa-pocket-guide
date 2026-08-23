import {guard} from './_util.js';

const MAX_CHARS=4200;

export default async function handler(req,res){
  if(!guard(req,res))return;
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const input=String(body.input||'').trim().slice(0,MAX_CHARS);
    if(!input)return res.status(400).json({error:'Texte audio absent.'});
    const voice=String(body.voice||process.env.OPENAI_TTS_VOICE||'coral').trim().slice(0,32);
    const instructions=String(body.instructions||'').trim().slice(0,1200)||'Parle en français naturel, chaleureux et fluide, comme un guide culturel local expérimenté qui accompagne un petit groupe à pied. Débit calme mais vivant, articulation claire, intonation humaine, sans emphase publicitaire. Fais de courtes respirations aux changements d’idée.';
    const model=process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts';
    const response=await fetch('https://api.openai.com/v1/audio/speech',{
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,voice,input,instructions,response_format:'mp3'})
    });
    if(!response.ok){
      const payload=await response.json().catch(()=>({}));
      const message=payload?.error?.message||`OpenAI TTS ${response.status}`;
      console.error('PocketGuide TTS',response.status,message);
      return res.status(response.status).json({error:message});
    }
    const bytes=Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type','audio/mpeg');
    res.setHeader('Content-Length',String(bytes.length));
    res.setHeader('Cache-Control','private, max-age=300');
    res.status(200).send(bytes);
  }catch(error){
    console.error('PocketGuide TTS',error?.message||error);
    res.status(500).json({error:error?.message||'Synthèse vocale indisponible.'});
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);const read=p=>readFile(new URL(p,root),'utf8');

test('V1.4: le Studio propose texte et micro sur la même demande',async()=>{
  const html=await read('studio.html'),js=await read('js/studio-v1-4.js');
  assert.match(html,/id="prompt"/);assert.match(html,/id="mic"/);assert.match(html,/🎙️ Parler/);
  assert.match(js,/getUserMedia/);assert.match(js,/MediaRecorder/);assert.match(js,/SpeechRecognition\|\|window\.webkitSpeechRecognition/);
  assert.match(js,/appendTranscript/);assert.match(js,/\/api\/transcribe/);
});

test('V1.4.4: dictée Chrome insère une seule transcription finale nettoyée',async()=>{
  const js=await read('js/studio-v1-4.js'),html=await read('studio.html');
  assert.match(js,/rec\.continuous=false/);
  assert.match(js,/function dedupeTranscript/);
  assert.match(js,/words\.splice\(i\+size,size\)/);
  assert.match(js,/const transcript=dedupeTranscript\(bestFinal\|\|bestInterim\)/);
  assert.match(js,/if\(transcript\)appendTranscript\(transcript\)/);
  assert.doesNotMatch(js,/box\.value=live/);
  assert.match(html,/studio-v1-4\.js\?v=1\.4\.4/);
});

test('V1.4.4: backend health et URL Vercel sont configurés',async()=>{
  const js=await read('js/studio-v1-4.js'),cfg=await read('data/ai-config.json'),health=await read('api/health.js');
  assert.match(js,/\/api\/health/);assert.match(cfg,/santa-teresa-pocket-guide\.vercel\.app/);assert.match(health,/openaiConfigured/);
});

test('V1.4.4: AI Planner passe par Responses API, web search et validateur',async()=>{
  const js=await read('js/studio-v1-4.js'),api=await read('api/plan.js');
  assert.match(js,/\/api\/plan/);assert.match(js,/validateRoutePack/);assert.match(api,/v1\/responses/);assert.match(api,/web_search/);assert.match(api,/json_schema/);assert.match(api,/gpt-5\.4-mini/);
});

test('V1.4: transcription utilise un modèle OpenAI audio côté serveur',async()=>{
  const api=await read('api/transcribe.js');
  assert.match(api,/v1\/audio\/transcriptions/);assert.match(api,/gpt-4o-mini-transcribe/);assert.match(api,/OPENAI_API_KEY/);assert.match(api,/MAX_AUDIO_BYTES/);
});

test('V1.4: aucune clé OpenAI en clair ne se trouve dans les fichiers publics',async()=>{
  for(const path of ['studio.html','js/studio-v1-4.js','data/ai-config.json','api/plan.js','api/transcribe.js','api/health.js']){
    const text=await read(path);assert.doesNotMatch(text,/sk-(?:proj-)?[A-Za-z0-9_-]{12,}/,path);
  }
});

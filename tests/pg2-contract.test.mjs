import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [contract,html,css,manifest,config,realtime,orchestrator,actions,sessionStore,app,worker,serviceWorker]=await Promise.all([
  read('docs/PG2_ACCEPTANCE_CONTRACT.md'),read('pocketguide-v2.html'),read('pocketguide-v2.css'),read('manifest-v2.webmanifest'),read('data/v2-companion-config.json'),read('js/pg2/companion/realtime-companion.js'),read('js/pg2/companion/companion-orchestrator.js'),read('js/pg2/core/v2-actions.js'),read('js/pg2/core/session-store.js'),read('js/pg2/bootstrap/app.js'),read('cloudflare/pocketguide-v2-worker.js'),read('service-worker.js')
]);

test('V2 contract defines every gate from G53 through G80',()=>{
  for(let gate=53;gate<=80;gate+=1)assert.match(contract,new RegExp(`G${gate}\\b`));
  assert.match(contract,/compagnon vocal et audiovisuel est l’interface principale/i);
});

test('V2 exposes one companion and exactly three primary spaces',()=>{
  assert.match(html,/data-view-panel="companion"/);assert.match(html,/data-view-panel="journey"/);assert.match(html,/data-view-panel="memories"/);
  assert.equal((html.match(/data-view-target=/g)||[]).length,3);
  assert.doesNotMatch(html,/IA locale|IA Realtime/);
  assert.match(html,/Je suis avec vous/);assert.match(html,/Regarde avec moi/);assert.match(html,/Voir en AR/);
});

test('V2 selects a light realtime companion and Terra on demand',()=>{
  const parsed=JSON.parse(config);assert.equal(parsed.companionModel,'gpt-realtime-2.1-mini');assert.equal(parsed.premiumRealtimeModel,'gpt-realtime-2.1');assert.equal(parsed.plannerModel,'gpt-5.6-terra');assert.equal(parsed.reasoningEffort,'low');
  assert.match(realtime,/research_tourist_question/);assert.match(realtime,/\/v2\/guide\/answer/);
});

test('Realtime readiness follows the actual data-channel open event',()=>{
  assert.match(realtime,/const opened=new Promise/);assert.match(realtime,/channel\.onopen=.*resolve\(true\)/s);assert.match(realtime,/await opened;\s*clearTimeout/s);assert.match(realtime,/this\.connected=true/);
  assert.match(realtime,/connectionTimeoutMs/);assert.match(realtime,/channel\.onerror/);assert.match(realtime,/channel\.onclose/);assert.match(realtime,/pc\.onconnectionstatechange/);
});

test('Realtime session explicitly configures bidirectional audio and interruption',()=>{
  assert.match(realtime,/noise_reduction/);assert.match(realtime,/transcription/);assert.match(realtime,/semantic_vad/);assert.match(realtime,/create_response:true/);assert.match(realtime,/interrupt_response:true/);assert.match(realtime,/response\.cancel/);assert.match(realtime,/getAudioTracks/);
});

test('Orchestrator keeps one interface while retaining local fallback',()=>{
  assert.match(orchestrator,/realtimeCompanion\.connect/);assert.match(orchestrator,/voiceController\.start/);assert.match(orchestrator,/humanGuide\.handleText/);assert.match(orchestrator,/plannerEngine\.proposeReplacement/);assert.match(orchestrator,/isNewRouteRequest/);
  assert.match(orchestrator,/je reste avec vous/i);
});

test('V2 UI actions make the companion the operating surface',()=>{
  assert.match(actions,/const VIEWS=new Set\(\['companion','journey','memories'\]\)/);
  assert.match(actions,/ui\.open_\$\{view\}/);
  for(const action of ['ui.open_preview','ui.request_vision','ui.open_journal'])assert.match(actions,new RegExp(action.replace('.','\\.')));
  assert.match(actions,/ui\.open_map':'journey'/);assert.match(actions,/ar\.open/);
});

test('real sessions clear every simulated or stale sensor value',()=>{
  assert.match(sessionStore,/session:\{simulation:false\}/);assert.match(sessionStore,/lat:null,lng:null,accuracy:null,heading:null/);assert.match(sessionStore,/gps:'unknown'/);assert.match(sessionStore,/camera:'unknown'/);assert.match(sessionStore,/microphone:'unknown'/);
  assert.doesNotMatch(sessionStore,/location:\{lat:value/);
});

test('V1.8 route, preview, storage, media and backup engines are reused',()=>{
  for(const module of ['route-actions','walking-guidance-engine','walking-simulator','itinerary-manager','itinerary-store','photo-preview-engine','audiovisual-journal','photo-capture','portable-backup'])assert.match(app,new RegExp(module));
  assert.match(html,/accept="image\/\*" capture="environment"/);assert.match(html,/\.pocketguide,application\/vnd\.pocketguide\+json/);
  assert.match(app,/transmettra ponctuellement cette image à OpenAI/);assert.match(app,/savePersonalPhoto/);
});

test('V2 is an independent installable PWA and does not replace V1.8 entry',()=>{
  const parsed=JSON.parse(manifest);assert.match(parsed.start_url,/pocketguide-v2\.html/);assert.equal(parsed.short_name,'PocketGuide V2');
  assert.match(serviceWorker,/PG2_CACHE='pocketguide-v2-companion-rc1'/);assert.match(serviceWorker,/\.\/pocketguide-v2\.html/);assert.match(serviceWorker,/manifest-v2\.webmanifest/);assert.match(serviceWorker,/\/js\/pg2\//);
  assert.match(serviceWorker,/\.\/pocketguide-18\.html/);
});

test('worker allows only selected companion models and provides verified research',()=>{
  assert.match(worker,/REALTIME_MODELS=new Set\(\['gpt-realtime-2\.1-mini','gpt-realtime-2\.1'\]\)/);
  assert.match(worker,/REALTIME_MODELS\.has\(requestedModel\)/);assert.match(worker,/async function guideAnswer/);assert.match(worker,/tools:\[\{type:'web_search'\}\]/);assert.match(worker,/gpt-5\.6-terra/);
});

test('premium mobile design retains accessibility guarantees',()=>{
  assert.match(css,/--sand:#eacb82/);assert.match(css,/min-height:46px/);assert.match(css,/min-height:48px/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(html,/aria-live="polite"/);assert.match(html,/aria-label="Navigation principale"/);
});

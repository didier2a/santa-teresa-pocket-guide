import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('pocketguide-15.html','utf8');
const rootHtml=fs.readFileSync('index.html','utf8');
const engineHtml=fs.readFileSync('engine.html','utf8');
const css=fs.readFileSync('v15.css','utf8');
const js=fs.readFileSync('js/pocketguide-v1-5.js','utf8');
const plannerVoice=fs.readFileSync('js/planner-voice-v151.js','utf8');
const proactive=fs.readFileSync('js/pocketguide-v1-5-proactive.js','utf8');
const worker=fs.readFileSync('cloudflare/pocketguide-v2-worker.js','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
const sw=fs.readFileSync('service-worker.js','utf8');
const arCore=fs.readFileSync('js/ar-core.js','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const cfg=JSON.parse(fs.readFileSync('data/v2-config.json','utf8'));

test('V1.5 is a single field-guide application and design shell is unchanged',()=>{
  assert.match(html,/PocketGuide 1\.5/);
  for(const id of ['voiceMain','arToggle','map','timeline','planPrompt','planVoiceBtn','libraryList'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/Conversation terrain/);
  assert.match(html,/Studio intégré/);
  assert.match(css,/\.voice-console/);
  assert.match(css,/\.bottom-nav/);
  assert.match(css,/\.ar-label/);
});

test('V1.5.1 Planner accepts long interactive voice description',()=>{
  assert.match(html,/🎙️ Décrire par la voix/);
  assert.match(html,/planner-voice-v151\.js/);
  assert.match(plannerVoice,/SpeechRecognition\|\|window\.webkitSpeechRecognition/);
  assert.match(plannerVoice,/continuous=true/);
  assert.match(plannerVoice,/interimResults=true/);
  assert.match(plannerVoice,/dedupeTranscript/);
  assert.match(plannerVoice,/Arrêter la dictée/);
  assert.match(plannerVoice,/suspendRealtimeMic/);
  assert.match(plannerVoice,/track\.enabled=false/);
  assert.match(plannerVoice,/planButton\?\.addEventListener\('click'/);
});

test('P0: root promotes V1.5.1 without breaking legacy engine',()=>{
  assert.match(rootHtml,/pocketguide-15\.html/);
  assert.match(rootHtml,/location\.pathname\.endsWith\('\/engine\.html'\)/);
  assert.match(rootHtml,/location\.replace\(target\)/);
  assert.match(engineHtml,/fetch\('\.\/index\.html'/);
  assert.match(engineHtml,/route-bootstrap\.js/);
  assert.match(rootHtml,/orientation-v149\.js/);
  assert.match(rootHtml,/audio-companion-v149\.js/);
});

test('P0: Realtime voice can be interrupted without muting future audio',()=>{
  assert.match(js,/RTCPeerConnection/);
  assert.match(js,/response\.cancel/);
  assert.match(js,/remoteAudio'\)\.play|remoteAudio.*play/);
  const interrupt=js.match(/function interrupt\(\)\{[^}]+\}/s)?.[0]||'';
  assert.doesNotMatch(interrupt,/\.pause\(/);
  assert.match(js,/responding:false/);
});

test('P0: compass context is throttled and orientation stops with AR',()=>{
  assert.match(js,/CONTEXT_HEADING_MS=1200/);
  assert.match(js,/CONTEXT_HEADING_DELTA=15/);
  assert.match(js,/ORIENTATION_RENDER_MS=75/);
  assert.match(js,/shouldSendContext/);
  assert.match(js,/deltaHeading/);
  assert.match(js,/stopCamera\(\);stopOrientation\(\)/);
});

test('P0: Cloudflare bridge protects cost and fixes model selection server-side',()=>{
  assert.match(worker,/allowedOrigin/);
  assert.match(worker,/Content-Length/);
  assert.match(worker,/await rateOk\(request,env,'plan'\)/);
  assert.match(worker,/await rateOk\(request,env,'realtime'\)/);
  assert.match(worker,/env\.OPENAI_REALTIME_MODEL/);
  assert.doesNotMatch(worker,/searchParams\.get\('model'\)/);
  assert.match(wrangler,/PLAN_RATE_LIMITER/);
  assert.match(wrangler,/REALTIME_RATE_LIMITER/);
  assert.match(wrangler,/"ratelimits"/);
});

test('P1: Realtime transcription and semantic VAD are explicitly configured',()=>{
  assert.match(js,/gpt-4o-mini-transcribe/);
  assert.match(js,/language:'fr'/);
  assert.match(js,/semantic_vad/);
  assert.match(js,/interrupt_response:true/);
  assert.match(js,/conversation\.item\.input_audio_transcription\.completed/);
});

test('P1: adaptive route state persists and must-see stops are preserved',()=>{
  for(const tool of ['get_trip_state','get_nearby_places','focus_place_in_ar','skip_next_stop','go_to_place','shorten_route','open_ar'])assert.match(js,new RegExp(tool));
  assert.match(js,/pg15-state-v2/);
  assert.match(js,/persistState/);
  assert.match(js,/restoreState/);
  assert.match(js,/isMustSee/);
  assert.match(js,/priorityOf/);
  assert.match(js,/preservedMustSee:true/);
});

test('P1: Planner verifies places with web search and strict JSON Schema',()=>{
  assert.match(worker,/type:'web_search'/);
  assert.match(worker,/type:'json_schema'/);
  assert.match(worker,/strict:true/);
  assert.match(worker,/sourceUrl/);
  assert.match(worker,/priority/);
  assert.match(worker,/mustSee/);
  assert.match(worker,/verifiedAt/);
  assert.match(js,/verificationSources/);
});

test('P1: proactive guide has accuracy guard hysteresis per-place and global cooldown',()=>{
  assert.equal(cfg.autoGuideGlobalCooldownSeconds,75);
  assert.match(proactive,/exitRadiusMeters/);
  assert.match(proactive,/globalCooldownMs/);
  assert.match(proactive,/position\.accuracy/);
  assert.match(proactive,/seenKey/);
  assert.match(proactive,/state\.responding/);
  assert.match(proactive,/requestProactiveGuide/);
});

test('P1: Geo-AR has compass fallback, manual controls and clean shutdown',()=>{
  assert.match(js,/ensureManualARControls/);
  assert.match(js,/Boussole indisponible/);
  assert.match(js,/↶ 15°/);
  assert.match(js,/15° ↷/);
  assert.match(js,/stopOrientation/);
  assert.match(js,/height\*\.62/);
});

test('P1: legacy V1.4.9 modules do not boot inside V1.5',()=>{
  assert.match(arCore,/!document\.querySelector\('#pg15App'\)/);
  assert.match(arCore,/document\.querySelector\('#today'\)/);
});

test('P1: panel navigation scrolls to the active view and timeline returns to terrain',()=>{
  assert.match(js,/function showPanel/);
  assert.match(js,/scrollTo\(/);
  assert.match(js,/showPanel\('guide',\{terrain:true\}\)/);
});

test('P2: offline intent fallback handles location next route skip shorten and AR',()=>{
  assert.match(js,/function localReply/);
  for(const word of ['raccour','saute','ensuite','parcours','position','regarde'])assert.match(js,new RegExp(word));
  assert.match(js,/toggleAR\(true\)/);
});

test('P2: map follows GPS, can recenter, demo has a marker and nearby cards are interactive',()=>{
  assert.match(js,/followMap/);
  assert.match(js,/Recentrer/);
  assert.match(js,/updateMapPosition\(\)/);
  assert.match(js,/data-nearby/);
  assert.match(js,/tabindex="0"/);
  assert.match(js,/GPS DÉMO/);
});

test('P2: PWA install is resilient and updates do not force navigation reloads',()=>{
  assert.equal(manifest.start_url,'./pocketguide-15.html?app=7.1.1');
  assert.equal(manifest.orientation,'any');
  assert.match(sw,/pocketguide-v15-1-voice-geoar-b/);
  assert.match(sw,/planner-voice-v151\.js/);
  assert.doesNotMatch(sw,/modesto\.svg/);
  assert.doesNotMatch(sw,/client\.navigate/);
  assert.match(sw,/POCKETGUIDE_UPDATE_READY/);
  assert.match(sw,/Promise\.allSettled/);
  assert.match(js,/Mise à jour prête/);
});

test('V1.5.1 assets are cache-busted for Android PWA updates',()=>{
  assert.match(html,/v15\.css\?v=1\.5\.1/);
  assert.match(html,/pocketguide-v1-5\.js\?v=1\.5\.1/);
  assert.match(html,/pocketguide-v1-5-proactive\.js\?v=1\.5\.1/);
  assert.match(html,/planner-voice-v151\.js\?v=1\.5\.1a/);
  assert.equal(cfg.version,'1.5.1');
});

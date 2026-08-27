import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('pocketguide-15.html','utf8');
const rootHtml=fs.readFileSync('index.html','utf8');
const engineHtml=fs.readFileSync('engine.html','utf8');
const css=fs.readFileSync('v15.css','utf8');
const css152=fs.readFileSync('v152.css','utf8');
const js=fs.readFileSync('js/pocketguide-v1-5.js','utf8');
const plannerVoice=fs.readFileSync('js/planner-voice-v151.js','utf8');
const platform=fs.readFileSync('js/platform-v152.js','utf8');
const offline=fs.readFileSync('js/offline-v152.js','utf8');
const diagnosticHtml=fs.readFileSync('diagnostic.html','utf8');
const diagnostic=fs.readFileSync('js/diagnostic-v152.js','utf8');
const proactive=fs.readFileSync('js/pocketguide-v1-5-proactive.js','utf8');
const worker=fs.readFileSync('cloudflare/pocketguide-v2-worker.js','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
const sw=fs.readFileSync('service-worker.js','utf8');
const arCore=fs.readFileSync('js/ar-core.js','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const cfg=JSON.parse(fs.readFileSync('data/v2-config.json','utf8'));

test('V1.5.2 keeps the unified field-guide design and activates compatibility modules',()=>{
  assert.match(html,/PocketGuide 1\.5\.2/);
  for(const id of ['voiceMain','arToggle','map','timeline','planPrompt','planVoiceBtn','libraryList'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/Conversation terrain/);
  assert.match(html,/Studio intégré/);
  assert.match(html,/v152\.css\?v=1\.5\.2/);
  assert.match(html,/platform-v152\.js\?v=1\.5\.2/);
  assert.match(html,/offline-v152\.js\?v=1\.5\.2/);
  assert.match(css,/\.voice-console/);
  assert.match(css,/\.bottom-nav/);
  assert.match(css,/\.ar-label/);
});

test('Correction 1: iOS orientation permission is requested from the AR user gesture',()=>{
  assert.match(platform,/DeviceOrientationEvent\.requestPermission/);
  assert.match(platform,/pointerdown/);
  assert.match(platform,/requestOrientationFromGesture/);
  assert.match(platform,/installOrientationListener/);
  assert.match(platform,/deviceorientationabsolute/);
  assert.match(platform,/state\.orientationPermission==='granted'/);
});

test('Correction 2: Planner voice has MediaRecorder server transcription fallback',()=>{
  assert.match(html,/🎙️ Décrire par la voix/);
  assert.match(plannerVoice,/SpeechRecognition\|\|window\.webkitSpeechRecognition/);
  assert.match(plannerVoice,/MediaRecorder/);
  assert.match(plannerVoice,/startRecorderFallback/);
  assert.match(plannerVoice,/\/v1\/transcribe/);
  assert.match(plannerVoice,/audio\/mp4/);
  assert.match(plannerVoice,/speechWatchdog/);
  assert.match(plannerVoice,/suspendRealtimeMic/);
  assert.match(plannerVoice,/planButton\?\.addEventListener\('click'/);
  assert.match(worker,/\/v1\/transcribe/);
  assert.match(worker,/audio\/transcriptions/);
  assert.match(worker,/OPENAI_TRANSCRIBE_MODEL/);
  assert.match(worker,/20_000_000/);
  assert.match(wrangler,/TRANSCRIBE_RATE_LIMITER/);
});

test('Correction 3: camera and microphone can be reset without restarting the app',()=>{
  assert.match(platform,/resetMedia/);
  assert.match(platform,/stopAppMedia/);
  assert.match(platform,/resetSensorsBtn/);
  assert.match(platform,/Réinitialiser caméra & micro/);
  assert.match(platform,/getTracks\?\.\(\)\.forEach/);
  assert.match(platform,/navigator\.geolocation\.clearWatch/);
});

test('Correction 4: iPhone safe areas and touch targets are protected',()=>{
  assert.match(css152,/safe-area-inset-top/);
  assert.match(css152,/safe-area-inset-bottom/);
  assert.match(css152,/safe-area-inset-left/);
  assert.match(css152,/safe-area-inset-right/);
  assert.match(css152,/min-height:44px/);
  assert.match(css152,/min-width:44px/);
  assert.match(css152,/font-size:16px/);
});

test('Correction 5: current route can be downloaded, persisted and reopened offline after restart',()=>{
  assert.match(offline,/downloadCurrentRoute/);
  assert.match(offline,/makeSvg/);
  assert.match(offline,/pg152-offline-pack/);
  assert.match(offline,/pocketguide-v152-route-download/);
  assert.match(offline,/Télécharger hors ligne/);
  assert.match(offline,/navigator\.onLine/);
  assert.match(offline,/localStorage\.setItem/);
  assert.match(offline,/persistInLibrary/);
  assert.match(offline,/saveRoutePack/);
  assert.match(offline,/openOfflinePack/);
  assert.match(offline,/pg-route-handoff-v1/);
  assert.match(offline,/handoff.*local/);
  assert.match(offline,/Ouvrir le parcours hors ligne/);
});

test('Correction 6: universal diagnostic covers browser and required sensors',()=>{
  assert.match(diagnosticHtml,/Diagnostic de compatibilité/);
  assert.match(diagnosticHtml,/Tester GPS, caméra, micro et boussole/);
  for(const capability of ['Service Worker','GPS Web','Caméra / micro','WebRTC','Orientation','SpeechRecognition','MediaRecorder fallback','Cache API'])assert.match(diagnostic,new RegExp(capability.replace(/[\/]/g,'\\/')));
  const clickBlock=diagnostic.match(/#testPermissions'\)\.onclick=async\(\)=>\{[\s\S]*?detail\.textContent=out\.join/)?.[0]||'';
  assert.match(clickBlock,/DeviceOrientationEvent\?\.requestPermission/);
  assert.ok(clickBlock.indexOf('requestPermission')<clickBlock.indexOf('geolocation.getCurrentPosition'),'orientation permission must be requested before GPS async work on iOS');
});

test('Correction 7: current PWA build caches cross-platform assets and diagnostic',()=>{
  assert.equal(manifest.start_url,'./pocketguide-15.html?app=7.2.0');
  assert.equal(manifest.orientation,'any');
  assert.equal(cfg.version,'1.5.2');
  assert.match(sw,/APP_VERSION='8\.3\.13'/);
  assert.match(sw,/pocketguide-v15-2-multiplatform-a/);
  for(const asset of ['v152.css','platform-v152.js','offline-v152.js','diagnostic.html','diagnostic-v152.js'])assert.match(sw,new RegExp(asset.replace(/[.]/g,'\\.')));
  assert.match(sw,/pocketguide-v152-route-download/);
  assert.doesNotMatch(sw,/client\.navigate/);
});

test('Planner strict schema protects coordinates dates times and verified sources',()=>{
  assert.match(worker,/minimum:-90,maximum:90/);
  assert.match(worker,/minimum:-180,maximum:180/);
  assert.match(worker,/pattern:'\^\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}\$'/);
  assert.match(worker,/pattern:'\^\\\\d\{2\}:\\\\d\{2\}\$'/);
  assert.ok(worker.includes("sourceUrl:{type:'string',pattern:'^https://.+'}"));
  assert.match(worker,/ids\.size!==p\.places\.length/);
  assert.match(worker,/ids\.has\(e\.placeId\)/);
  assert.match(worker,/maxItems:7/);
  assert.match(worker,/maxItems:16/);
  assert.match(worker,/Math\.min\(10/);
});

test('Existing Realtime stability fixes remain intact',()=>{
  assert.match(js,/RTCPeerConnection/);
  assert.match(js,/response\.cancel/);
  const interrupt=js.match(/function interrupt\(\)\{[^}]+\}/s)?.[0]||'';
  assert.doesNotMatch(interrupt,/\.pause\(/);
  assert.match(js,/CONTEXT_HEADING_MS=1200/);
  assert.match(js,/CONTEXT_HEADING_DELTA=15/);
  assert.match(js,/ORIENTATION_RENDER_MS=75/);
  assert.match(js,/semantic_vad/);
  assert.match(js,/gpt-4o-mini-transcribe/);
});

test('Adaptive RoutePack state and must-see protection remain intact',()=>{
  for(const tool of ['get_trip_state','get_nearby_places','focus_place_in_ar','skip_next_stop','go_to_place','shorten_route','open_ar'])assert.match(js,new RegExp(tool));
  assert.match(js,/pg15-state-v2/);
  assert.match(js,/persistState/);
  assert.match(js,/restoreState/);
  assert.match(js,/isMustSee/);
  assert.match(js,/priorityOf/);
  assert.match(js,/preservedMustSee:true/);
});

test('Verified Planner and server-side protections remain intact',()=>{
  assert.match(worker,/type:'web_search'/);
  assert.match(worker,/type:'json_schema'/);
  assert.match(worker,/strict:true/);
  assert.match(worker,/sourceUrl/);
  assert.match(worker,/mustSee/);
  assert.match(worker,/allowedOrigin/);
  assert.match(worker,/rateOk/);
  for(const limiter of ['PLAN_RATE_LIMITER','REALTIME_RATE_LIMITER','TRANSCRIBE_RATE_LIMITER'])assert.match(wrangler,new RegExp(limiter));
});

test('Proactive guide, Geo-AR fallback and offline intent fallback remain intact',()=>{
  assert.equal(cfg.autoGuideGlobalCooldownSeconds,75);
  assert.match(proactive,/exitRadiusMeters/);
  assert.match(proactive,/globalCooldownMs/);
  assert.match(proactive,/position\.accuracy/);
  assert.match(js,/ensureManualARControls/);
  assert.match(js,/Boussole indisponible/);
  assert.match(js,/function localReply/);
  assert.match(js,/followMap/);
  assert.match(js,/data-nearby/);
});

test('Legacy engine remains isolated from the unified app',()=>{
  assert.match(rootHtml,/pocketguide-15\.html/);
  assert.match(engineHtml,/fetch\('\.\/index\.html'/);
  assert.match(engineHtml,/route-bootstrap\.js/);
  assert.match(arCore,/!document\.querySelector\('#pg15App'\)/);
});

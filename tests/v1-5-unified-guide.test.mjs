import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('pocketguide-15.html','utf8');
const css=fs.readFileSync('v15.css','utf8');
const js=fs.readFileSync('js/pocketguide-v1-5.js','utf8');
const proactive=fs.readFileSync('js/pocketguide-v1-5-proactive.js','utf8');
const worker=fs.readFileSync('cloudflare/pocketguide-v2-worker.js','utf8');
const sw=fs.readFileSync('service-worker.js','utf8');
const arCore=fs.readFileSync('js/ar-core.js','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));

test('V1.5 is a single field-guide application',()=>{
  assert.match(html,/PocketGuide 1\.5/);
  for(const id of ['voiceMain','arToggle','map','timeline','planPrompt','libraryList'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/Conversation terrain/);
  assert.match(html,/Studio intégré/);
});

test('V1.5.1 unifies realtime voice GPS and Geo-AR without muting future audio',()=>{
  assert.match(js,/RTCPeerConnection/);
  assert.match(js,/navigator\.geolocation\.watchPosition/);
  assert.match(js,/getUserMedia/);
  assert.match(js,/projectPlaces/);
  assert.match(js,/DeviceOrientationEvent/);
  assert.match(js,/response\.cancel/);
  assert.match(js,/semantic_vad/);
  assert.match(js,/gpt-4o-mini-transcribe/);
  assert.match(js,/response\.output_audio_transcript\.done/);
  const interrupt=js.match(/function interrupt\(\)\{[^}]+\}/s)?.[0]||'';
  assert.doesNotMatch(interrupt,/remoteAudio.*pause/);
});

test('V1.5.1 throttles compass context and cleans orientation when AR closes',()=>{
  assert.match(js,/CONTEXT_HEADING_MS/);
  assert.match(js,/CONTEXT_HEADING_DELTA/);
  assert.match(js,/ORIENTATION_RENDER_MS/);
  assert.match(js,/sendContext\('cap'\)/);
  assert.match(js,/stopCamera\(\);stopOrientation\(\)/);
});

test('V1.5.1 persists adaptive RoutePack state and preserves must-see stops',()=>{
  for(const tool of ['get_trip_state','get_nearby_places','focus_place_in_ar','skip_next_stop','go_to_place','shorten_route','open_ar'])assert.match(js,new RegExp(tool));
  assert.match(js,/pg15-state-v2/);
  assert.match(js,/persistState/);
  assert.match(js,/restoreState/);
  assert.match(js,/isMustSee/);
  assert.match(js,/priorityOf/);
});

test('V1.5.1 has useful offline intent fallback and clickable nearby places',()=>{
  assert.match(js,/function localReply/);
  assert.match(js,/data-nearby/);
  assert.match(js,/Raccour|raccour/);
  assert.match(js,/followMap/);
  assert.match(js,/Recentrer/);
});

test('V1.5.1 Planner uses web search, strict structured output and server-side protection',()=>{
  assert.match(js,/\/v1\/plan/);
  assert.match(worker,/\/v1\/plan/);
  assert.match(worker,/api\.openai\.com\/v1\/responses/);
  assert.match(worker,/type:'web_search'/);
  assert.match(worker,/type:'json_schema'/);
  assert.match(worker,/strict:true/);
  assert.match(worker,/OPENAI_PLANNER_MODEL/);
  assert.match(worker,/rateOk/);
  assert.match(worker,/allowedOrigin/);
  assert.doesNotMatch(js,/OPENAI_API_KEY/);
});

test('V1.5.1 proactive guide uses accuracy guard, hysteresis and global cooldown',()=>{
  assert.match(proactive,/exitRadiusMeters/);
  assert.match(proactive,/globalCooldownMs/);
  assert.match(proactive,/position\.accuracy/);
  assert.match(proactive,/requestProactiveGuide/);
});

test('V1.5 does not boot V1.4.9 audio/orientation modules inside the unified app',()=>{
  assert.match(arCore,/!document\.querySelector\('#pg15App'\)/);
});

test('V1.5 mobile-first design remains intact',()=>{
  assert.match(css,/\.voice-console/);
  assert.match(css,/\.voice-orb/);
  assert.match(css,/\.bottom-nav/);
  assert.match(css,/\.ar-label/);
  assert.match(css,/@media\(max-width:760px\)/);
});

test('V1.5.1 PWA is resilient and non-intrusive',()=>{
  assert.equal(manifest.start_url,'./pocketguide-15.html?app=7.1.0');
  assert.equal(manifest.orientation,'any');
  assert.match(sw,/pocketguide-v15-1-voice-geoar/);
  assert.doesNotMatch(sw,/modesto\.svg/);
  assert.doesNotMatch(sw,/client\.navigate/);
  assert.match(sw,/POCKETGUIDE_UPDATE_READY/);
  assert.match(sw,/Promise\.allSettled/);
});

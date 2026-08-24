import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('v2.html','utf8');
const css=fs.readFileSync('v2.css','utf8');
const js=fs.readFileSync('js/v2-guide.js','utf8');
const cfg=JSON.parse(fs.readFileSync('data/v2-config.json','utf8'));
const worker=fs.readFileSync('cloudflare/pocketguide-v2-worker.js','utf8');
const sw=fs.readFileSync('service-worker.js','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));

test('V2 is voice-first and standalone',()=>{
  assert.match(html,/PocketGuide V2/);
  assert.match(html,/id="voiceMain"/);
  assert.match(html,/id="conversationLog"/);
  assert.match(html,/js\/v2-guide\.js/);
  assert.match(html,/serviceWorker\.register/);
});

test('V2 keeps Geo-AR, GPS, map and landscape controls',()=>{
  assert.match(html,/id="openARV2"/);
  assert.match(html,/id="gpsBtn"/);
  assert.match(html,/id="v2Map"/);
  assert.match(html,/id="orientationBtn"/);
  assert.match(css,/v2-landscape/);
  assert.match(js,/screen\.orientation\?\.lock/);
  assert.match(js,/engine\.html/);
  assert.match(js,/navigator\.geolocation\.watchPosition/);
});

test('V2 exposes the tourist guide tool set',()=>{
  for(const tool of ['get_trip_state','get_nearby_places','focus_place_in_ar','skip_next_stop','go_to_place','shorten_route','open_ar'])assert.match(js,new RegExp(tool));
  assert.match(js,/systemInstructions/);
  assert.match(js,/RoutePack/);
});

test('V2 supports Realtime WebRTC and interruption',()=>{
  assert.equal(cfg.realtimeModel,'gpt-realtime-2.1');
  assert.match(js,/RTCPeerConnection/);
  assert.match(js,/createDataChannel/);
  assert.match(js,/getUserMedia/);
  assert.match(js,/response\.cancel/);
  assert.match(js,/response\.function_call_arguments\.done/);
  assert.match(js,/function_call_output/);
});

test('V2 has a no-backend simulation path',()=>{
  assert.match(html,/Simulation/);
  assert.match(js,/activateSimulation/);
  assert.match(js,/simulationReply/);
  assert.match(js,/speechSynthesis/);
  assert.match(js,/qs\.get\('sim'\)===\'1\'/);
});

test('Cloudflare bridge protects the permanent OpenAI key',()=>{
  assert.match(worker,/env\.OPENAI_API_KEY/);
  assert.match(worker,/api\.openai\.com\/v1\/realtime\/calls/);
  assert.match(worker,/Authorization:`Bearer \$\{env\.OPENAI_API_KEY\}`/);
  assert.match(worker,/application\/sdp/);
  assert.doesNotMatch(js,/OPENAI_API_KEY/);
  assert.doesNotMatch(html,/OPENAI_API_KEY/);
});

test('PWA promotes V1.5 while retaining V2 offline assets',()=>{
  assert.equal(manifest.start_url,'./pocketguide-15.html?app=7.0.0');
  assert.equal(manifest.orientation,'any');
  assert.match(sw,/pocketguide-v15-voice-geoar-a/);
  assert.match(sw,/\.\/pocketguide-15\.html/);
  assert.match(sw,/\.\/v2\.html/);
  assert.match(sw,/\.\/v2\.css/);
  assert.match(sw,/\.\/js\/v2-guide\.js/);
  assert.match(sw,/\.\/data\/v2-config\.json/);
});

test('Legacy entrypoints remain present alongside V1.5 and V2',()=>{
  assert.ok(fs.existsSync('pocketguide-15.html'));
  assert.ok(fs.existsSync('index.html'));
  assert.ok(fs.existsSync('engine.html'));
  assert.ok(fs.existsSync('studio-148.html'));
});

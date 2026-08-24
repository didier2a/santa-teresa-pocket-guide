import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('pocketguide-15.html','utf8');
const css=fs.readFileSync('v15.css','utf8');
const js=fs.readFileSync('js/pocketguide-v1-5.js','utf8');
const worker=fs.readFileSync('cloudflare/pocketguide-v2-worker.js','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));

test('V1.5 is a single field-guide application',()=>{
  assert.match(html,/PocketGuide 1\.5/);
  for(const id of ['voiceMain','arToggle','map','timeline','planPrompt','libraryList'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/Conversation terrain/);
  assert.match(html,/Studio intégré/);
});

test('V1.5 unifies realtime voice GPS and Geo-AR',()=>{
  assert.match(js,/RTCPeerConnection/);
  assert.match(js,/navigator\.geolocation\.watchPosition/);
  assert.match(js,/getUserMedia/);
  assert.match(js,/projectPlaces/);
  assert.match(js,/DeviceOrientationEvent/);
  assert.match(js,/response\.cancel/);
  assert.match(js,/semantic_vad/);
  assert.match(js,/response\.output_audio_transcript\.done/);
});

test('V1.5 keeps adaptive RoutePack tools',()=>{
  for(const tool of ['get_trip_state','get_nearby_places','focus_place_in_ar','skip_next_stop','go_to_place','shorten_route','open_ar'])assert.match(js,new RegExp(tool));
  assert.match(js,/validateRoutePack/);
  assert.match(js,/saveRoutePack/);
  assert.match(js,/loadSavedRoute/);
});

test('V1.5 Planner uses the same secured Cloudflare Worker',()=>{
  assert.match(js,/\/v1\/plan/);
  assert.match(worker,/\/v1\/plan/);
  assert.match(worker,/api\.openai\.com\/v1\/responses/);
  assert.match(worker,/OPENAI_PLANNER_MODEL/);
  assert.match(worker,/gpt-5\.6-terra/);
  assert.doesNotMatch(js,/OPENAI_API_KEY/);
});

test('V1.5 mobile-first interface exposes persistent voice and bottom navigation',()=>{
  assert.match(css,/\.voice-console/);
  assert.match(css,/\.voice-orb/);
  assert.match(css,/\.bottom-nav/);
  assert.match(css,/\.ar-label/);
  assert.match(css,/@media\(max-width:760px\)/);
});

test('V1.5 is the PWA entrypoint',()=>{
  assert.equal(manifest.start_url,'./pocketguide-15.html?app=7.0.0');
  assert.equal(manifest.orientation,'any');
});

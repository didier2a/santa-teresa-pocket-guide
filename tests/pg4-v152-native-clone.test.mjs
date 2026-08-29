import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const html=read('pocketguide-15.html');
const base=read('js/pocketguide-v1-5.js');
const bridge=read('js/pg4/companion-v152-bridge.js');
const broker=read('api/liveavatar-session.js');
const sw=read('service-worker.js');
const vercel=JSON.parse(read('vercel.json'));

test('la preview V4 charge réellement le shell final 1.5.2',()=>{
  const rewrite=vercel.rewrites.find(item=>item.source==='/pocketguide-4-preview');
  assert.equal(rewrite?.destination,'/pocketguide-15.html?companion=1');
  assert.match(html,/id="map" class="map"/);
  assert.match(html,/leaflet@1\.9\.4\/dist\/leaflet\.js/);
  assert.match(html,/js\/pocketguide-v1-5\.js\?v=1\.5\.2/);
  assert.match(html,/js\/pocketguide-v1-5-proactive\.js\?v=1\.5\.2/);
  assert.match(html,/js\/planner-voice-v151\.js\?v=1\.5\.2/);
  assert.match(html,/js\/platform-v152\.js\?v=1\.5\.2/);
  assert.match(html,/js\/offline-v152\.js\?v=1\.5\.2/);
});

test('la carte GPS native reste propriétaire de son état',()=>{
  assert.match(base,/function initMap\(\)/);
  assert.match(base,/L\.tileLayer\('https:\/\/\{s\}\.tile\.openstreetmap\.org/);
  assert.match(base,/navigator\.geolocation\.watchPosition/);
  assert.match(base,/state\.map\?\.invalidateSize\(\)/);
  assert.match(base,/function updateMapPosition\(\)/);
  assert.doesNotMatch(bridge,/SceneDirector|mapCard|mountMap|L\.map/);
});

test('le Companion est une greffe conditionnelle Provider Controller SDK',()=>{
  assert.match(bridge,/get\('companion'\)===\s*'1'/);
  assert.match(bridge,/pocketguide-4-preview/);
  assert.match(bridge,/createCompanionWebSdk/);
  assert.match(bridge,/sessionEndpoint:'\/api\/companion-session'/);
  assert.match(bridge,/appVersion:'1\.5\.2'/);
  assert.match(broker,/PocketGuide 1\.5\.2 Companion Realtime/);
  assert.match(broker,/LIVEAVATAR_CONTEXT_152_ID/);
  assert.match(bridge,/mapOwner:'pocketguide-v1-5'/);
  assert.match(bridge,/conversationOwner:'liveavatar-v3'/);
  assert.match(bridge,/app\.showPanel\(view\)/);
  assert.match(bridge,/app\.toolCall\('shorten_route'/);
});

test('le service worker sert le clone 1.5.2 pour la route de preview',()=>{
  assert.match(sw,/pocketguide-v15-2-multiplatform-a-companion-v4-c/);
  assert.match(sw,/pocketguide-4-preview'\)\)return'\.\/pocketguide-15\.html'/);
  assert.match(sw,/js\/pg4\/companion-v152-bridge\.js/);
  assert.match(sw,/v152-companion\.css/);
});

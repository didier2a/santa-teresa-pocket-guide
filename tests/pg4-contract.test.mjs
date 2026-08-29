import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(file,'utf8');
const html=read('pocketguide-v4.html'),css=read('pocketguide-v4.css'),bootstrap=read('js/pg4/bootstrap/app.js'),sdk=read('js/companion-sdk/companion-web-sdk.js'),controller=read('js/companion-sdk/core/companion-controller.js'),provider=read('js/companion-sdk/providers/liveavatar-v3-provider.js'),adapter=read('js/pg4/adapters/avatar-audio-adapter.js'),endpoint=read('api/companion-session.js'),broker=read('api/liveavatar-session.js'),sw=read('service-worker.js'),env=read('.env.example'),vercel=JSON.parse(read('vercel.json'));

test('la coque V4 reprend le blueprint S22 validé',()=>{
  assert.match(html,/data-pg-version="4\.0\.0"/);for(const id of ['avatarStage','avatar3dHost','voiceAction','guideScene','mapScene','routeScene','createScene'])assert.match(html,new RegExp(`id="${id}"`));
  for(const label of ['Guide','Carte','Parcours','Créer'])assert.match(html,new RegExp(`>${label}<`));assert.match(css,/width:min\(100%,360px\)/);assert.match(css,/height:100svh/);assert.match(css,/min-height:44px/);assert.match(css,/--mint:#79dccf/);
  assert.match(html,/id="avatarStage"[^>]+data-pg-version="2\.3\.3"/);assert.match(css,/\.avatar-shell\{position:absolute;inset:0;width:100%;height:100%;border-radius:0/);assert.doesNotMatch(css,/\.avatar-shell\{width:140px/);
});

test('la navigation S22 reste stable et immédiatement tactile',()=>{
  assert.match(css,/html,body\{width:100%;height:100%;overflow:hidden/);
  assert.match(css,/\.pg4-app\[data-view="guide"\] \.pg4-panels\{grid-row:1\/4/);
  assert.doesNotMatch(css,/min-height:640px/);
  assert.doesNotMatch(css,/@media\(max-height:700px\)[^}]*\.avatar-shell\{width:/);
  assert.match(css,/touch-action:manipulation/);
  assert.match(bootstrap,/state\.patch\(\{view\},\{source:'navigation-touch'\}\)/);
  assert.match(html,/Votre carte apparaîtra ici/);
  assert.match(html,/Aucun parcours actif/);
  assert.match(sw,/V4_VERSION='4\.0\.0-preview\.6'/);
});

test('Avatar + Audio V3 est industrialisé derrière Provider, Controller et SDK',()=>{
  assert.match(provider,/class LiveAvatarV3Provider/);assert.match(provider,/voice:'marin'/);assert.match(provider,/session\.attach\(video\)/);assert.match(provider,/sessionEndpoint='\/api\/companion-session'/);assert.doesNotMatch(provider,/session\.message\(/);assert.doesNotMatch(provider,/createGain|createDynamicsCompressor/);
  assert.match(controller,/class CompanionController/);assert.match(sdk,/class CompanionWebSdk/);assert.match(sdk,/createCompanionWebSdk/);assert.match(adapter,/createCompanionWebSdk/);assert.doesNotMatch(adapter,/LiveAvatarRealtimeController|liveavatar-session-v4/);assert.doesNotMatch(`${sdk}\n${controller}\n${provider}\n${adapter}`,/OPENAI_API_KEY|LIVEAVATAR_API_KEY|HEYGEN_API_KEY/);assert.match(bootstrap,/AvatarAudioAdapter/);
  assert.match(adapter,/startListening\(\)/);assert.match(bootstrap,/await avatar\.startListening\(\)/);assert.doesNotMatch(bootstrap,/await avatar\.toggleListening\(\)/);
});

test('les secrets restent côté serveur et la preview Vercel est distincte',()=>{
  assert.match(endpoint,/liveavatar-session\.js/);assert.match(broker,/process\.env\.OPENAI_API_KEY/);assert.match(broker,/process\.env\.LIVEAVATAR_API_KEY/);assert.doesNotMatch(`${html}\n${bootstrap}\n${sdk}\n${provider}\n${adapter}`,/sk-(?:proj-)?[A-Za-z0-9_-]{8,}/);assert.match(env,/OPENAI_API_KEY=/);assert.ok(vercel.rewrites.some(item=>item.source==='/pocketguide-4-preview'));assert.ok(vercel.functions['api/companion-session.js']);
});

test('la PWA met en cache le noyau V4 et son entrée',()=>{
  for(const asset of ['pocketguide-v4.html','pocketguide-v4.css','manifest-v4.webmanifest','js/companion-sdk/companion-web-sdk.js','js/companion-sdk/core/companion-controller.js','js/companion-sdk/providers/liveavatar-v3-provider.js','js/pg4/bootstrap/app.js','js/pg4/core/capability-registry.js','js/pg4/adapters/terrain-adapter.js','js/pg4/adapters/orientation-layout-adapter.js','js/pg4/v152-parity.js','js/pg4/scenes/scene-director.js'])assert.match(sw,new RegExp(asset.replace(/[.]/g,'\\.')));
  assert.ok(sw.includes("if(url.origin===location.origin&&url.pathname.startsWith('/api/')){event.respondWith(fetch(event.request,{cache:'no-store'}));return}"));
});

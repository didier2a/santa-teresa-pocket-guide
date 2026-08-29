import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=file=>fs.readFileSync(file,'utf8');
const html=read('pocketguide-v4.html'),css=read('pocketguide-v4.css'),bootstrap=read('js/pg4/bootstrap/app.js'),controller=read('js/pg23/avatar/liveavatar-realtime-controller.js'),adapter=read('js/pg4/adapters/avatar-audio-adapter.js'),endpoint=read('api/liveavatar-session-v4.js'),sw=read('service-worker.js'),env=read('.env.example'),vercel=JSON.parse(read('vercel.json'));

test('la coque V4 reprend le blueprint S22 validé',()=>{
  assert.match(html,/data-pg-version="4\.0\.0"/);for(const id of ['avatarStage','avatar3dHost','voiceAction','guideScene','mapScene','routeScene','createScene'])assert.match(html,new RegExp(`id="${id}"`));
  for(const label of ['Guide','Carte','Parcours','Créer'])assert.match(html,new RegExp(`>${label}<`));assert.match(css,/width:min\(100%,360px\)/);assert.match(css,/height:100dvh/);assert.match(css,/min-height:44px/);assert.match(css,/--mint:#79dccf/);
});

test('Avatar + Audio reste isolé derrière un adaptateur V4',()=>{
  assert.match(controller,/class LiveAvatarRealtimeController/);assert.match(controller,/voice:'marin'/);assert.match(controller,/session\.attach\(video\)/);assert.match(adapter,/new LiveAvatarRealtimeController/);assert.match(adapter,/liveavatar-session-v4/);assert.doesNotMatch(adapter,/OPENAI_API_KEY|LIVEAVATAR_API_KEY|HEYGEN_API_KEY/);assert.match(bootstrap,/AvatarAudioAdapter/);
});

test('les secrets restent côté serveur et la preview Vercel est distincte',()=>{
  assert.match(endpoint,/process\.env\.OPENAI_API_KEY/);assert.match(endpoint,/process\.env\.LIVEAVATAR_API_KEY/);assert.doesNotMatch(`${html}\n${bootstrap}\n${adapter}`,/sk-(?:proj-)?[A-Za-z0-9_-]{8,}/);assert.match(env,/OPENAI_API_KEY=/);assert.ok(vercel.rewrites.some(item=>item.source==='/pocketguide-4-preview'));assert.ok(vercel.functions['api/liveavatar-session-v4.js']);
});

test('la PWA met en cache le noyau V4 et son entrée',()=>{
  for(const asset of ['pocketguide-v4.html','pocketguide-v4.css','manifest-v4.webmanifest','js/pg4/bootstrap/app.js','js/pg4/core/capability-registry.js','js/pg4/scenes/scene-director.js','liveavatar-realtime-controller.js'])assert.match(sw,new RegExp(asset.replace(/[.]/g,'\\.')));
});


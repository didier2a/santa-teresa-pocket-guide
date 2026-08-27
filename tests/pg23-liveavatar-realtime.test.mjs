import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {liveAvatarRealtimeRequested} from '../js/pg23/avatar/liveavatar-realtime-controller.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [endpoint,controller,runtime,css,html,sw,util,envText,vercelText]=await Promise.all([
  read('api/liveavatar-session.js'),read('js/pg23/avatar/liveavatar-realtime-controller.js'),read('js/pg23/bootstrap/living-companion-runtime.js'),read('pocketguide-v23.css'),read('pocketguide-v23.html'),read('service-worker.js'),read('api/_util.js'),read('.env.example'),read('vercel.json')
]);

test('le mode LiveAvatar Realtime reste explicitement opt-in sur PocketGuide 2.3.2',()=>{
  assert.equal(liveAvatarRealtimeRequested('?liveavatar=1'),true);assert.equal(liveAvatarRealtimeRequested('?liveavatar=0'),false);assert.equal(liveAvatarRealtimeRequested(''),false);
  assert.match(runtime,/liveAvatarRealtimeRequested\(\)\?liveAvatarRealtimeController:avatarEngineController/);assert.match(html,/data-pg-version="2\.3\.2"/);assert.match(html,/app\.js\?v=2\.3\.2\.13/);
});

test('OpenAI Realtime marin pilote la vidéo LiveAvatar verticale et son labial',()=>{
  assert.match(endpoint,/664ff8bb-4932-4644-91f8-b90975d6f549/);assert.match(endpoint,/mode:'LITE'/);assert.match(endpoint,/openai_realtime_config/);assert.match(endpoint,/voice:'marin'/);assert.match(endpoint,/is_sandbox:false/);assert.match(endpoint,/encoding:'H264'/);
  assert.match(controller,/@heygen\/liveavatar-web-sdk@0\.0\.18/);assert.match(controller,/new sdk\.LiveAvatarSession/);assert.match(controller,/session\.attach\(video\)/);assert.match(controller,/voiceChat/);assert.match(controller,/Pocket-Guide-LiveAvatar-1080x1920\.jpg/);assert.match(css,/\.liveavatar-realtime-video\{[^}]*object-fit:cover/);
});

test('les clés restent exclusivement côté Vercel et le navigateur ne reçoit qu’un jeton éphémère',()=>{
  assert.match(endpoint,/process\.env\.LIVEAVATAR_API_KEY/);assert.match(endpoint,/process\.env\.OPENAI_API_KEY/);assert.match(endpoint,/secret_type:'OPENAI_API_KEY'/);assert.doesNotMatch(controller,/X-API-KEY|LIVEAVATAR_API_KEY|HEYGEN_API_KEY|OPENAI_API_KEY/);assert.doesNotMatch(`${endpoint}\n${envText}`,/sk-(?:proj-)?[A-Za-z0-9_-]{12,}/);
  assert.match(util,/pocketguide-v2\.infoserv2a\.workers\.dev/);assert.match(util,/winter-chanter\\\.workers\\\.dev/);const vercel=JSON.parse(vercelText);assert.ok(Number(vercel.functions?.['api/liveavatar-session.js']?.maxDuration)>0);assert.equal(vercel.functions?.['api/liveavatar-embed.js'],undefined);
});

test('le portrait de chargement et le contrôleur Realtime sont disponibles dans le cache 2.3.2',()=>{
  assert.match(sw,/liveavatar-realtime-controller\.js/);assert.match(sw,/Pocket-Guide-LiveAvatar-1080x1920\.jpg/);assert.match(sw,/pocketguide-v23-liveavatar-realtime-2-3-2-b/);assert.doesNotMatch(sw,/liveavatar-embed-controller/);
});

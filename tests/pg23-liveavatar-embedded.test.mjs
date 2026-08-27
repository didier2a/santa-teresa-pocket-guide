import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {liveAvatarEmbeddedRequested} from '../js/pg23/avatar/liveavatar-embed-controller.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [endpoint,controller,runtime,css,html,sw,util,envText,vercelText]=await Promise.all([
  read('api/liveavatar-embed.js'),read('js/pg23/avatar/liveavatar-embed-controller.js'),read('js/pg23/bootstrap/living-companion-runtime.js'),read('pocketguide-v23.css'),read('pocketguide-v23.html'),read('service-worker.js'),read('api/_util.js'),read('.env.example'),read('vercel.json')
]);

test('le mode LiveAvatar reste explicitement opt-in sur PocketGuide 2.3.2',()=>{
  assert.equal(liveAvatarEmbeddedRequested('?liveavatar=1'),true);assert.equal(liveAvatarEmbeddedRequested('?liveavatar=0'),false);assert.equal(liveAvatarEmbeddedRequested(''),false);
  assert.match(runtime,/liveAvatarEmbeddedRequested\(\)\?liveAvatarEmbedController:avatarEngineController/);assert.match(html,/data-pg-version="2\.3\.2"/);assert.match(html,/app\.js\?v=2\.3\.2\.12/);
});

test('le portrait Embedded utilise le bon avatar, le français et une orientation verticale',()=>{
  assert.match(endpoint,/664ff8bb-4932-4644-91f8-b90975d6f549/);assert.match(endpoint,/default_language:'fr'/);assert.match(endpoint,/orientation:'vertical'/);assert.match(endpoint,/is_sandbox/);
  assert.match(controller,/Pocket-Guide-LiveAvatar-1080x1920\.jpg/);assert.match(controller,/frame\.allow='microphone; autoplay'/);assert.match(controller,/\/api\/liveavatar-embed/);assert.match(css,/\.liveavatar-embed-frame\{[^}]*aspect-ratio:9\/16/);
});

test('la clé LiveAvatar ne quitte jamais la fonction Vercel',()=>{
  assert.match(endpoint,/process\.env\.LIVEAVATAR_API_KEY/);assert.match(endpoint,/X-API-KEY/);assert.doesNotMatch(controller,/X-API-KEY|LIVEAVATAR_API_KEY|HEYGEN_API_KEY/);assert.doesNotMatch(`${endpoint}\n${envText}`,/sk-(?:proj-)?[A-Za-z0-9_-]{12,}/);
  assert.match(util,/pocketguide-v2\.infoserv2a\.workers\.dev/);assert.match(util,/winter-chanter\\\.workers\\\.dev/);
  const vercel=JSON.parse(vercelText);assert.ok(Number(vercel.functions?.['api/liveavatar-embed.js']?.maxDuration)>0);
});

test('le mode Embedded et son portrait de chargement sont disponibles dans le cache 2.3.2',()=>{
  assert.match(sw,/liveavatar-embed-controller\.js/);assert.match(sw,/Pocket-Guide-LiveAvatar-1080x1920\.jpg/);assert.match(sw,/pocketguide-v23-liveavatar-test-2-3-2-a/);
});

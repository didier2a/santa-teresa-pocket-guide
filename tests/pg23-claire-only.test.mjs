import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [html,css,configText,packText,controller,manager,engine,scenes,sw,build,worker]=await Promise.all([
  read('pocketguide-v23.html'),read('pocketguide-v23.css'),read('data/v23-avatar-config.json'),read('assets/avatar-local/avatar-pack-v1.json'),read('js/pg23/avatar/avatar-engine-controller.js'),read('js/pg23/avatar/avatar-pack-manager.js'),read('js/pg23/avatar/talkinghead-local-engine.js'),read('js/pg23/scenes/living-scene-engine.js'),read('service-worker.js'),read('scripts/cloudflare/build-preview.mjs'),read('cloudflare/pocketguide-v2-worker.js')
]);
const config=JSON.parse(configText),pack=JSON.parse(packText);

test('Pocket Guide 2.3.2 publie Claire comme seule identité',()=>{
  assert.match(html,/data-pg-version="2\.3\.2"/);assert.match(html,/Claire · guide 3D locale/);assert.match(html,/id="retryClaire"/);
  assert.doesNotMatch(html,/human-guide-v21|human-guide-visemes-v22|avatarModeSelect|LiveAvatar/);
  assert.doesNotMatch(css,/human-guide-v21|human-guide-visemes-v22/);assert.doesNotMatch(scenes,/human-guide-v21/);
});

test('Claire locale est imposée sans flux LiveAvatar',()=>{
  assert.equal(config.defaultMode,'local');assert.equal(config.local.displayName,'Claire');assert.equal(config.local.ready,true);assert.equal(config.local.packVersion,'3');assert.equal(config.live.enabled,false);
  assert.match(controller,/requested:'local'/);assert.doesNotMatch(controller,/LiveAvatar|manual-live|auto-live/);
});

test('le premier rendu 3D ne dépend pas du téléchargement hors ligne ni de Head Audio',()=>{
  assert.match(controller,/packInstalled\(\)\|\|globalThis\.navigator\?\.onLine!==false/);
  assert.match(engine,/supported\(\)\{return Boolean\(this\.host&&this\.capabilities\(\)\.webgl\)/);
  assert.match(engine,/void this\.installAudio\(session\)/);
});

test('le pack mobile télécharge en parallèle avec délai, reprise et cache',()=>{
  assert.equal(pack.version,'3');assert.equal(pack.cacheName,'pocketguide-local-avatar-v3');assert.ok(pack.assets.length>=18);
  assert.match(manager,/timeoutMs=18000/);assert.match(manager,/retries=1/);assert.match(manager,/concurrency=4/);assert.match(manager,/AbortController/);assert.match(manager,/Promise\.allSettled/);assert.match(manager,/target\.match\(url\)/);
});

test('le service worker 2.3.2 installe uniquement des ressources publiées',()=>{
  assert.match(sw,/APP_VERSION='8\.3\.5'/);assert.match(sw,/pocketguide-v23-claire-2-3-2-a/);assert.match(sw,/pocketguide-local-avatar-v3/);assert.match(sw,/endsWith\('\/pocketguide-v23'\)/);assert.doesNotMatch(sw,/docs\/PG23_/);
});

test('le bundle Cloudflare exclut les sources et publie la route Claire',async()=>{
  assert.match(build,/assets\/avatar-local\/references/);assert.match(build,/_redirects/);assert.match(build,/Pocket Guide V2\.3\.2/);
  assert.match(worker,/\.infoserv2a\.workers\.dev/);assert.match(worker,/\.pages\.dev/);
  const model=await stat(new URL('../assets/avatar-local/models/claire-rocketbox.glb',import.meta.url));assert.equal(model.size,pack.model.bytes);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [html,css,configText,packText,controller,manager,engine,threeStage,talkingHead,retargeter,dynamicBones,scenes,sw,build,worker,diagnosticHtml,diagnosticJs]=await Promise.all([
  read('pocketguide-v23.html'),read('pocketguide-v23.css'),read('data/v23-avatar-config.json'),read('assets/avatar-local/avatar-pack-v1.json'),read('js/pg23/avatar/avatar-engine-controller.js'),read('js/pg23/avatar/avatar-pack-manager.js'),read('js/pg23/avatar/talkinghead-local-engine.js'),read('js/pg23/avatar/claire-three-stage.js'),read('vendor/avatar-local/talkinghead-1.7.0/talkinghead.mjs'),read('vendor/avatar-local/talkinghead-1.7.0/retargeter.mjs'),read('vendor/avatar-local/talkinghead-1.7.0/dynamicbones.mjs'),read('js/pg23/scenes/living-scene-engine.js'),read('service-worker.js'),read('scripts/cloudflare/build-preview.mjs'),read('cloudflare/pocketguide-v2-worker.js'),read('claire-diagnostic-v10.html'),read('js/pg23/avatar/claire-diagnostic-v10.js')
]);
const stageModule=await import(new URL('../js/pg23/avatar/claire-three-stage.js',import.meta.url));
const config=JSON.parse(configText),pack=JSON.parse(packText);

test('le renderer Claire est un module JavaScript réellement importable',()=>{
  assert.equal(typeof stageModule.ClaireThreeStage,'function');
});

test('Pocket Guide 2.3.2 publie Claire comme seule identité',()=>{
  assert.match(html,/data-pg-version="2\.3\.2"/);assert.match(html,/Claire · guide 3D locale/);assert.match(html,/id="retryClaire"/);
  assert.doesNotMatch(html,/human-guide-v21|human-guide-visemes-v22|avatarModeSelect|LiveAvatar/);
  assert.doesNotMatch(css,/human-guide-v21|human-guide-visemes-v22/);assert.doesNotMatch(scenes,/human-guide-v21/);
});

test('Claire locale est imposée sans flux LiveAvatar',()=>{
  assert.equal(config.defaultMode,'local');assert.equal(config.local.displayName,'Claire');assert.equal(config.local.ready,true);assert.equal(config.local.packVersion,'9');assert.equal(config.live.enabled,false);
  assert.match(controller,/requested:'local'/);assert.match(controller,/fetchImpl\.bind\(globalThis\)/);assert.match(controller,/CONFIG_URL=new URL/);assert.doesNotMatch(controller,/LiveAvatar|manual-live|auto-live/);
});

test('le premier rendu 3D ne dépend pas du téléchargement hors ligne ni de Head Audio',()=>{
  assert.match(controller,/Boolean\(this\.config\?\.local\?\.enabled&&this\.config\.local\.ready\)/);
  assert.match(engine,/supported\(\)\{return Boolean\(this\.host&&this\.capabilities\(\)\.webgl\)/);
  assert.match(engine,/await this\.prepareHost\(\)/);assert.match(engine,/getContext\('webgl2'/);assert.match(engine,/new ClaireThreeStage/);assert.match(engine,/avatarOnly:true/);assert.match(engine,/avatarOnlyScene:this\.threeStage\.scene/);assert.match(engine,/avatarOnlyCamera:this\.threeStage\.camera/);assert.match(engine,/lipsyncModules:\[\]/);assert.match(engine,/this\.stage='claire-model'/);assert.match(engine,/this\.stage='first-frame'/);assert.match(engine,/this\.threeStage\.fit/);assert.match(engine,/this\.threeStage\.sample/);assert.match(engine,/renderer:'three-external'/);assert.match(engine,/Rendu 3D transparent/);assert.match(engine,/configuredRatio\*deviceRatio/);assert.doesNotMatch(engine,/rendererCanvas:prepared\.canvas|rendererContext:prepared\.gl/);
  assert.match(threeStage,/new THREE\.WebGLRenderer/);assert.match(threeStage,/setFromObject\(root,true\)/);assert.match(threeStage,/gl\.readPixels\(0,0,width,height/);assert.match(threeStage,/this\.head\.animate/);assert.match(threeStage,/this\.camera\.lookAt\(target\)/);
  assert.match(engine,/void this\.installAudio\(session\)/);
  assert.match(engine,/TALKING_HEAD_MODULE/);assert.match(talkingHead,/rendererCanvas/);assert.match(talkingHead,/rendererContext/);assert.match(talkingHead,/antialias: false/);assert.match(talkingHead,/powerPreference: 'low-power'/);assert.match(controller,/Claire doit être relancée/);for(const source of [talkingHead,retargeter,dynamicBones]){assert.doesNotMatch(source,/from ['"]three(?:\/|['"])/);assert.match(source,/\.\.\/three-0\.180\.0\//);}
});

test('le pack mobile télécharge en parallèle avec délai, reprise et cache',()=>{
  assert.equal(pack.version,'9');assert.equal(pack.cacheName,'pocketguide-local-avatar-v9');assert.ok(pack.assets.length>=19);assert.equal(pack.assets.find(asset=>asset.url.endsWith('/three.core.min.js'))?.bytes,381125);assert.equal(pack.assets.find(asset=>asset.url.endsWith('/talkinghead.mjs'))?.bytes,219842);
  assert.match(manager,/timeoutMs=18000/);assert.match(manager,/fetchImpl\.bind\(globalThis\)/);assert.match(manager,/retries=1/);assert.match(manager,/concurrency=4/);assert.match(manager,/AbortController/);assert.match(manager,/Promise\.allSettled/);assert.match(manager,/target\.match\(url\)/);
});

test('le service worker 2.3.2 installe uniquement des ressources publiées',()=>{
  assert.match(sw,/APP_VERSION='8\.3\.14'/);assert.match(sw,/pocketguide-v23-claire-2-3-2-j/);assert.match(sw,/pocketguide-local-avatar-v9/);assert.match(sw,/claire-three-stage\.js/);assert.match(sw,/endsWith\('\/pocketguide-v23'\)/);assert.doesNotMatch(sw,/docs\/PG23_/);
});

test('le bundle Cloudflare exclut les sources et publie la route Claire',async()=>{
  assert.match(build,/assets\/avatar-local\/references/);assert.doesNotMatch(build,/writeFile\(path\.join\(output, '_redirects'\)/);assert.match(build,/Pocket Guide V2\.3\.2/);assert.match(build,/Cache-Control: no-cache, must-revalidate/);assert.doesNotMatch(build,/avatar-local\/\*\\n  Cache-Control: public, max-age=31536000, immutable/);
  assert.match(worker,/\.infoserv2a\.workers\.dev/);assert.match(worker,/\.pages\.dev/);
  const model=await stat(new URL('../assets/avatar-local/models/claire-rocketbox.glb',import.meta.url));assert.equal(model.size,pack.model.bytes);const core=await stat(new URL('../vendor/avatar-local/three-0.180.0/build/three.core.min.js',import.meta.url));assert.equal(core.size,pack.assets.find(asset=>asset.url.endsWith('/three.core.min.js')).bytes);
});

test('le diagnostic S22 reproduit exactement le renderer externe corrigé',()=>{
  assert.match(diagnosticHtml,/Validation du nouveau renderer Claire/);assert.match(diagnosticHtml,/claire-diagnostic-v10\.js/);for(const stage of ['WebGL2','Modules Three.js','Téléchargement GLB','Décodage GLB','Rendu Three.js de référence','TalkingHead animateur','Renderer PocketGuide corrigé'])assert.match(diagnosticJs,new RegExp(stage.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.match(diagnosticJs,/EXPECTED_MODEL_HASH/);assert.match(diagnosticJs,/REQUIRED_BONES/);assert.match(diagnosticJs,/avatarOnly:true/);assert.match(diagnosticJs,/new ClaireThreeStage/);assert.match(diagnosticJs,/readPixels\(0,0,width,height/);
});

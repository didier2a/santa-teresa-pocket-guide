import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');

test('Vercel: le runtime PocketGuide 2.3.3 déclenche un déploiement, pas les anciennes pages isolées',async()=>{
  const cfg=JSON.parse(await read('vercel.json'));
  const filter=await read('scripts/vercel-ignore-build.sh');
  assert.equal(typeof cfg.ignoreCommand,'string');
  assert.equal(cfg.ignoreCommand,'bash scripts/vercel-ignore-build.sh');
  assert.ok(cfg.ignoreCommand.length<=256);
  assert.match(filter,/VERCEL_GIT_PREVIOUS_SHA/);
  assert.match(filter,/git diff --quiet/);
  assert.match(filter,/api\//);
  assert.match(filter,/engine\//);
  for(const runtime of ['pg16','pg17','pg18','pg2','pg21','pg22','pg23','pg233'])assert.match(filter,new RegExp(`js/${runtime}/`));
  assert.match(filter,/data\//);
  assert.match(filter,/pocketguide-v233\.css/);
  assert.match(filter,/manifest-v233\.webmanifest/);
  assert.match(filter,/service-worker\.js/);
  assert.match(filter,/vercel\.json/);
  assert.doesNotMatch(filter,/studio-148\.html/);
  assert.doesNotMatch(filter,/ar-v149\.css/);
});

test('Vercel: les fonctions backend importantes ont une durée explicite',async()=>{
  const cfg=JSON.parse(await read('vercel.json'));
  for(const path of ['api/plan.js','api/plan-status.js','api/transcribe.js','api/tts.js','api/validate-routepack.js','api/client-diagnostic.js']){
    assert.ok(cfg.functions?.[path],`${path} doit rester configuré`);
    assert.ok(Number(cfg.functions[path].maxDuration)>0,`${path} doit avoir maxDuration`);
  }
});

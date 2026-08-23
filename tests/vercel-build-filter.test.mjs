import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');

test('Vercel: les changements frontend seuls ne déclenchent pas de build backend',async()=>{
  const cfg=JSON.parse(await read('vercel.json'));
  assert.equal(typeof cfg.ignoreCommand,'string');
  assert.match(cfg.ignoreCommand,/VERCEL_GIT_PREVIOUS_SHA/);
  assert.match(cfg.ignoreCommand,/git diff --quiet/);
  assert.match(cfg.ignoreCommand,/api\//);
  assert.match(cfg.ignoreCommand,/engine\//);
  assert.match(cfg.ignoreCommand,/vercel\.json/);
  assert.doesNotMatch(cfg.ignoreCommand,/studio-148\.html/);
  assert.doesNotMatch(cfg.ignoreCommand,/ar-v149\.css/);
  assert.doesNotMatch(cfg.ignoreCommand,/service-worker\.js/);
});

test('Vercel: les fonctions backend importantes ont une durée explicite',async()=>{
  const cfg=JSON.parse(await read('vercel.json'));
  for(const path of ['api/plan.js','api/plan-status.js','api/transcribe.js','api/tts.js','api/validate-routepack.js']){
    assert.ok(cfg.functions?.[path],`${path} doit rester configuré`);
    assert.ok(Number(cfg.functions[path].maxDuration)>0,`${path} doit avoir maxDuration`);
  }
});

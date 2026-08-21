import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('P1: un seul moteur applicatif est chargé',async()=>{
  const html=await read('index.html');
  assert.match(html,/type="module" src="js\/app\.js"/);
  assert.doesNotMatch(html,/js\/v5\.js/);
  assert.doesNotMatch(html,/v4b-bootstrap\.js/);
});

test('P2: navigation pédestre et moteur de contraintes sont présents',async()=>{
  const app=await read('js/app.js');
  assert.match(app,/travelmode=walking/);
  assert.match(app,/shiftFlexibleBlock/);
  assert.match(app,/navigator\.geolocation\.watchPosition/);
  assert.equal((app.match(/watchPosition/g)||[]).length,1);
});

test('P2: PWA V5.1 contient icônes PNG et cache dédié',async()=>{
  const manifest=JSON.parse(await read('manifest.webmanifest'));
  assert.ok(manifest.icons.some(x=>x.sizes==='192x192'));
  assert.ok(manifest.icons.some(x=>x.sizes==='512x512'));
  const sw=await read('service-worker.js');
  assert.match(sw,/santa-teresa-v5-1/);
  assert.match(sw,/schedule-engine\.js/);
});

test('P5: diagnostic terrain est exposé dans l’interface',async()=>{
  const html=await read('index.html');
  assert.match(html,/id="runDiagnostics"/);
  assert.match(html,/id="diagnosticResults"/);
});

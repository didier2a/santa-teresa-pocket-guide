import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeSharedPack,encodeSharedPack,loadPocketGuideRoute,packShareUrl} from '../js/route-runtime.js';
import {validateRoutePack} from '../engine/routepack.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Engine V1.2+: Bonifacio reste un deuxième RoutePack valide et publié',async()=>{
  const pack=JSON.parse(await read('data/routepacks/bonifacio-demo.json'));
  const registry=JSON.parse(await read('data/routes.json'));
  const report=validateRoutePack(pack);
  assert.equal(pack.id,'bonifacio-demo');
  assert.equal(report.valid,true);
  assert.ok(pack.places.length>=4);
  assert.ok(registry.routes.some(r=>r.id==='bonifacio-demo'&&r.format==='routepack'));
});

test('Engine V1.2+: un RoutePack peut toujours être encodé dans une URL puis relu sans registre',async()=>{
  const pack=JSON.parse(await read('data/routepacks/bonifacio-demo.json'));
  const token=encodeSharedPack(pack);
  assert.deepEqual(decodeSharedPack(token),pack);
  const url=packShareUrl(pack,{href:'https://example.test/studio.html'});
  assert.match(url,/engine\.html\?pack=/);
  const runtime=await loadPocketGuideRoute({fetchImpl:async()=>{throw new Error('Le registre ne doit pas être appelé')},locationLike:{href:url}});
  assert.equal(runtime.shared,true);
  assert.equal(runtime.pack.id,'bonifacio-demo');
  assert.equal(runtime.report.valid,true);
});

test('Engine V1.3: le Studio conserve import validation partage export et ajoute le prompt',async()=>{
  const html=await read('studio.html'),js=await read('js/studio-v1-3.js');
  assert.match(html,/PocketGuide Studio V1\.3/);
  for(const id of ['prompt','generate','importFile','preview','share','download'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/validateRoutePack/);
  assert.match(js,/packShareUrl/);
  assert.match(js,/routeShareUrl/);
  assert.match(js,/application\/json/);
  assert.match(js,/compilePrompt/);
});

test('Engine V1.3: le cache offline contient Studio, compilateur et Bonifacio',async()=>{
  const sw=await read('service-worker.js');
  assert.match(sw,/pocketguide-engine-v1-3/);
  assert.match(sw,/studio\.html/);
  assert.match(sw,/studio-v1-3\.js/);
  assert.match(sw,/bonifacio-demo\.json/);
});

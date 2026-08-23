import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeSharedPack,decodeSharedPack,packShareUrl,loadPocketGuideRoute} from '../js/route-runtime.js';
import {validateRoutePack} from '../engine/routepack.js';
const root=new URL('../',import.meta.url);const read=p=>readFile(new URL(p,root),'utf8');

test('V1.2+: Bonifacio reste un second RoutePack valide et référencé',async()=>{const pack=JSON.parse(await read('data/routepacks/bonifacio-demo.json')),reg=JSON.parse(await read('data/routes.json'));const report=validateRoutePack(pack);assert.equal(report.valid,true);assert.ok(pack.places.length>=4);assert.ok(reg.routes.some(r=>r.id==='bonifacio-demo'&&r.format==='routepack'))});

test('V1.2+: un RoutePack peut être encodé et décodé sans perte',async()=>{const pack=JSON.parse(await read('data/routepacks/bonifacio-demo.json'));const encoded=encodeSharedPack(pack),decoded=decodeSharedPack(encoded);assert.equal(decoded.id,pack.id);assert.equal(decoded.places.length,pack.places.length);assert.ok(encoded.length>100)});

test('V1.2+: le moteur accepte un RoutePack partagé sans consulter le registre',async()=>{const pack=JSON.parse(await read('data/routepacks/bonifacio-demo.json'));const href=packShareUrl(pack,{href:'https://example.test/studio.html'});const fetchImpl=async()=>{throw new Error('le registre ne doit pas être appelé')};const runtime=await loadPocketGuideRoute({fetchImpl,locationLike:{href}});assert.equal(runtime.shared,true);assert.equal(runtime.pack.id,'bonifacio-demo');assert.equal(runtime.data.trip.routeId,'bonifacio-demo')});

test('V1.4.6: Studio expose prompt vocal, validation, ouverture PocketGuide, partage et export',async()=>{const html=await read('studio.html'),js=await read('js/studio-v1-4.js');for(const token of ['Dis-moi simplement ton voyage','Importer RoutePack','Validation et publication','Ouvrir dans PocketGuide','Copier le lien','Télécharger JSON','Parcours publiés'])assert.match(html,new RegExp(token));assert.match(js,/validateRoutePack/);assert.match(js,/packShareUrl/);assert.match(js,/routeShareUrl/);assert.match(js,/routepack\.json/);assert.match(js,/MediaRecorder/)});

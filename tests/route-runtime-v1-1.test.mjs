import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadPocketGuideRoute,requestedRouteId,routePackToAppData,routeShareUrl} from '../js/route-runtime.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Engine V1.1: le route id est lu depuis l URL et filtré',()=>{
  assert.equal(requestedRouteId({href:'https://example.test/engine.html?route=santa-teresa'}),'santa-teresa');
  assert.equal(requestedRouteId({href:'https://example.test/engine.html?route=../../x'}),null);
  assert.match(routeShareUrl('ajaccio-2-jours',{href:'https://example.test/engine.html?app=6.0.8#live'}),/route=ajaccio-2-jours/);
});

test('Engine V1.1: un RoutePack devient compatible avec le runtime historique',()=>{
  const data=routePackToAppData({schemaVersion:'1.0',id:'demo-route',title:'Démo',timezone:'Europe/Paris',travelers:2,start:'2026-01-01',end:'2026-01-01',days:[{date:'2026-01-01',events:[{id:'e1',time:'09:00',end:'10:00',title:'Étape',type:'balade',placeId:'p1'}]}],places:[{id:'p1',name:'Lieu',lat:42,lng:9}]});
  assert.equal(data.trip.routeId,'demo-route');
  assert.equal(data.trip.travelers,2);
  assert.equal(data.places[0].icon,'📍');
  assert.match(data.places[0].walkingUrl,/travelmode=walking/);
  assert.equal(data.discover[0].placeId,'p1');
});

test('Engine V1.1: le registre sélectionne Santa Teresa par défaut et valide le parcours',async()=>{
  const files={
    './data/routes.json':JSON.parse(await read('data/routes.json')),
    './data/trip.json':JSON.parse(await read('data/trip.json'))
  };
  const fetchImpl=async url=>({ok:Boolean(files[url]),status:files[url]?200:404,json:async()=>structuredClone(files[url])});
  const runtime=await loadPocketGuideRoute({fetchImpl,locationLike:{href:'https://example.test/engine.html'}});
  assert.equal(runtime.route.id,'santa-teresa');
  assert.equal(runtime.pack.schemaVersion,'1.0');
  assert.equal(runtime.report.valid,true);
  assert.ok(runtime.data.days.length>=2);
  assert.ok(runtime.data.places.length>=5);
});

test('Engine V1.1: une route inconnue est refusée avant exécution',async()=>{
  const registry=JSON.parse(await read('data/routes.json'));
  const fetchImpl=async url=>({ok:url==='./data/routes.json',status:url==='./data/routes.json'?200:404,json:async()=>structuredClone(registry)});
  await assert.rejects(()=>loadPocketGuideRoute({fetchImpl,locationLike:{href:'https://example.test/engine.html?route=route-inconnue'}}),/Parcours inconnu/);
});

test('Engine V1.1: l entrée générique et le service worker incluent le bootstrap',async()=>{
  const html=await read('engine.html');
  const sw=await read('service-worker.js');
  const bootstrap=await read('js/route-bootstrap.js');
  assert.match(html,/route-bootstrap\.js/);
  assert.match(html,/index\.html/);
  assert.match(sw,/pocketguide-engine-v1-1/);
  assert.match(sw,/engine\.html/);
  assert.match(sw,/route-runtime\.js/);
  assert.match(bootstrap,/__POCKETGUIDE_ROUTE_READY__/);
  assert.match(bootstrap,/pg:\$\{routeId\}/);
});

test('Engine V1.1: les contenus Santa Teresa sont neutralisés pour une autre route',async()=>{
  const bootstrap=await read('js/route-bootstrap.js');
  assert.match(bootstrap,/route\.id!==['"]santa-teresa['"]/);
  assert.match(bootstrap,/Playlist du parcours/);
  assert.match(bootstrap,/RoutePack V1/);
  assert.match(bootstrap,/Parcours chargé/);
  assert.match(bootstrap,/offlineTab\.hidden=true/);
  assert.match(bootstrap,/contact\.hidden=true/);
});

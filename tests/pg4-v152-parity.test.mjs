import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RouteStateAdapter} from '../js/pg4/adapters/route-state-adapter.js';
import {TerrainAdapter} from '../js/pg4/adapters/terrain-adapter.js';
import {OrientationLayoutAdapter} from '../js/pg4/adapters/orientation-layout-adapter.js';
import {PlannerVoiceAdapter} from '../js/pg4/adapters/planner-voice-adapter.js';
import {DiagnosticAdapter} from '../js/pg4/adapters/diagnostic-adapter.js';
import {ProactiveGuideAdapter} from '../js/pg4/adapters/proactive-guide-adapter.js';
import {OfflineAdapter,makeSvg} from '../js/pg4/adapters/offline-adapter.js';
import {V152_PARITY,parityReport} from '../js/pg4/v152-parity.js';

const pack=JSON.parse(fs.readFileSync('data/routepacks/santa-teresa-v4-preview.json','utf8'));
const html=fs.readFileSync('pocketguide-v4.html','utf8');
const css=fs.readFileSync('pocketguide-v4.css','utf8');
const api=fs.readFileSync('api/plan.js','utf8');
const statusApi=fs.readFileSync('api/plan-status.js','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest-v4.webmanifest','utf8'));

function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
function stateMock(){const value={sensors:{position:{lat:41.2401,lng:9.1886,accuracy:8},heading:30},routeProgress:{}};return{select(path){return path.split('.').reduce((result,key)=>result?.[key],value);},patch(patch){for(const [key,item] of Object.entries(patch))value[key]=item&&typeof item==='object'?{...(value[key]||{}),...item}:item;},value};}

test('le RoutePack V4 conserve les incontournables pendant un raccourcissement',()=>{
  const target=storage(),state=stateMock(),adapter=new RouteStateAdapter({state,storage:target});adapter.setPack(pack);const result=adapter.shorten(3);
  assert.equal(result.preservedMustSee,true);assert.ok(result.removed.length>0);assert.equal(result.removed.some(item=>item.event.mustSee||item.place.mustSee),false);assert.equal(adapter.snapshot().routeRevision,1);assert.match(target.getItem(`pg4-route-state-v152:${pack.id}`),/routeRevision/);
  assert.equal(adapter.nearby(2).length,2);assert.equal(adapter.contextSnapshot().base,'1.5.2');
});

test('la couche terrain demande l’orientation iOS depuis le geste puis garde le secours manuel',async()=>{
  const calls=[],fakeWindow={DeviceOrientationEvent:{requestPermission:async()=>{calls.push('permission');return'granted';}},addEventListener(){},removeEventListener(){},screen:{orientation:{angle:0}}},state=stateMock();
  const terrain=new TerrainAdapter({state,windowImpl:fakeWindow,navigatorImpl:{},documentImpl:{createElement(){return{}}}});assert.equal(await terrain.requestOrientationFromGesture(),true);assert.deepEqual(calls,['permission']);assert.equal(terrain.orientationPermission,'granted');assert.equal(terrain.diagnostic().orientation,true);
});

test('l’affichage bascule automatiquement entre 9:16 et 16:9 sans toucher à la session',()=>{
  const root={dataset:{}},style={setProperty(){}},media={matches:false,addEventListener(){},removeEventListener(){}},fakeWindow={innerWidth:390,innerHeight:844,matchMedia:()=>media,addEventListener(){},removeEventListener(){},screen:{orientation:{type:'portrait-primary',addEventListener(){},removeEventListener(){}}}},layout=new OrientationLayoutAdapter({windowImpl:fakeWindow,documentImpl:{documentElement:{style}}});layout.install(root);assert.equal(root.dataset.aspect,'9:16');fakeWindow.screen.orientation.type='landscape-primary';layout.update();assert.equal(root.dataset.aspect,'16:9');assert.equal(layout.diagnostic().sessionPreserved,true);
  assert.match(css,/@media\(orientation:landscape\)/);assert.match(css,/aspect-ratio:16 \/ 9/);assert.equal(manifest.orientation,'any');
});

test('dictée, diagnostic, hors-ligne et guide proactif exposent les garanties 1.5.2',()=>{
  const target=storage(),fakeWindow={MediaRecorder:function(){},RTCPeerConnection:function(){},SpeechRecognition:function(){},caches:{},document:{createElement(){return{append(){},className:'',textContent:''}}}},fakeNavigator={geolocation:{},mediaDevices:{getUserMedia(){}}},plannerVoice=new PlannerVoiceAdapter({windowImpl:fakeWindow,navigatorImpl:fakeNavigator}),offline=new OfflineAdapter({storage:target,cacheStorage:null});
  assert.equal(plannerVoice.diagnostic().fallbackEndpoint,'/api/transcribe');offline.importPack(pack);assert.equal(offline.list().length,1);assert.match(makeSvg(pack),/base terrain 1\.5\.2/);
  const diagnostic=new DiagnosticAdapter({windowImpl:fakeWindow,navigatorImpl:{...fakeNavigator,serviceWorker:{}},terrain:{},companion:{diagnostic:()=>({sdkVersion:'0.2.0',provider:'liveavatar-v3'})},offline});assert.ok(diagnostic.checks().length>=8);
  const proactive=new ProactiveGuideAdapter({state:stateMock(),storage:target});proactive.setPack(pack);assert.ok(proactive.diagnostic().exitRadiusMeters>proactive.diagnostic().radiusMeters);
});

test('le Planner V4 applique le schéma strict de la base 1.5.2',()=>{
  for(const rule of ["minimum:-90,maximum:90","minimum:-180,maximum:180","pattern:'^https://.+'","maxItems:7","maxItems:16","mustSee","fixed","locked","type:'web_search'","strict:true"])assert.ok(api.includes(rule),rule);
  assert.match(statusApi,/validateRoutePack/);assert.match(statusApi,/source HTTPS vérifiée/);
});

test('le gate de parité annonce 14 sur 14 uniquement avec toutes les preuves',()=>{
  const ids=['trip.getState','places.nearby','route.skipNext','route.goTo','route.shorten','terrain.startGPS','terrain.openAR','planner.createRoute','route.downloadOffline','route.openSaved','route.importPack','route.exportPack','sensors.reset'];
  const report=parityReport({registry:{list:()=>ids.map(id=>({id}))},terrain:{requestOrientationFromGesture(){}},layout:{diagnostic:()=>({automatic:true})},plannerVoice:{diagnostic:()=>({fallbackEndpoint:'/api/transcribe'})},diagnostic:{checks:()=>Array(10).fill({ok:true})},proactive:{diagnostic:()=>({exitRadiusMeters:160})},offline:{},companion:{diagnostic:()=>({baseline:'v3-proven',nativeAudio:true})}});
  assert.equal(V152_PARITY.length,14);assert.equal(report.implemented,14);assert.equal(report.total,14);assert.equal(report.complete,true);
  for(const id of ['geoArStage','gpsAction','arAction','plannerVoiceAction','diagnosticAction','downloadOfflineAction','routeLibraryList'])assert.match(html,new RegExp(`id="${id}"`));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {pocketGuideState} from '../js/pg16/core/pocketguide-state.js';
import {registerRouteActions} from '../js/pg16/route/route-actions.js';
import {WalkingGuidanceEngine,GUIDANCE_PHASES,directionInstruction,formatDistance} from '../js/pg17/guidance/walking-guidance-engine.js';

const pack={id:'walk-test',title:'Walk test',places:[
  {id:'p1',name:'Place Alpha',lat:41,lng:9,historyShort:'Une histoire fiable.',heroImage:'alpha.jpg'},
  {id:'p2',name:'Place Bêta',lat:41.001,lng:9.001,heroImage:'beta.jpg'},
  {id:'p3',name:'Même lieu',lat:41.001,lng:9.001,heroImage:'same.jpg'}
],days:[{events:[{id:'e1',placeId:'p1'},{id:'e2',placeId:'p2'},{id:'e3',placeId:'p3'}]}]};

function load(){
  pocketGuideState.reset({source:'pg17-test'});registerRouteActions();
  pocketGuideState.patch({route:{activeId:pack.id,title:pack.title,pack,currentEventId:'e1',nextEventId:'e2',completedEventIds:[],skippedEventIds:[]},perception:{gps:'ready'}},{source:'pg17-test'});
}
function sample(lat,lng,{accuracy=6,heading=0}={}){return {lat,lng,accuracy,heading,updatedAt:'2026-01-01T09:00:00.000Z'};}
function offsetNorth(place,meters){return sample(place.lat+meters/111_320,place.lng);}

test('V1.7 requires two reliable samples to confirm arrival',async()=>{
  load();const engine=new WalkingGuidanceEngine({arrivalMeters:35,arrivalSamples:2});
  assert.equal((await engine.processPosition(sample(41,9))).phase,GUIDANCE_PHASES.APPROACHING);
  assert.equal((await engine.processPosition(sample(41,9))).phase,GUIDANCE_PHASES.ARRIVED);
  assert.equal(engine.arrivedEventId,'e1');
});

test('V1.7 refuses precise arrival when GPS is degraded and recovers',async()=>{
  load();const engine=new WalkingGuidanceEngine({maxAccuracyMeters:80});
  const degraded=await engine.processPosition(sample(41,9,{accuracy:120}));assert.equal(degraded.phase,GUIDANCE_PHASES.GPS_DEGRADED);assert.doesNotMatch(degraded.instruction,/droite|gauche|demi-tour|tout droit/);
  assert.equal((await engine.processPosition(sample(41,9,{accuracy:5}))).phase,GUIDANCE_PHASES.APPROACHING);
});

test('V1.7 completes only after arrival then departure through route.next',async()=>{
  load();const engine=new WalkingGuidanceEngine({arrivalSamples:2,exitMeters:70});
  await engine.processPosition(sample(41,9));await engine.processPosition(sample(41,9));
  const departed=await engine.processPosition(offsetNorth(pack.places[0],90));
  assert.equal(departed.phase,GUIDANCE_PHASES.DEPARTED);
  assert.equal(pocketGuideState.select('route.currentEventId'),'e2');
  assert.deepEqual(pocketGuideState.select('route.completedEventIds'),['e1']);
});

test('V1.7 never silently consumes two events at identical coordinates',async()=>{
  load();pocketGuideState.patch({route:{currentEventId:'e2',nextEventId:'e3',completedEventIds:['e1']}},{source:'pg17-test'});
  const engine=new WalkingGuidanceEngine({arrivalSamples:2,exitMeters:70});engine.resetForRoute();
  await engine.processPosition(sample(41.001,9.001));await engine.processPosition(sample(41.001,9.001));
  await engine.processPosition(sample(41.001,9.001));
  assert.equal(pocketGuideState.select('route.currentEventId'),'e2');
  const result=await engine.continueAfterArrival({source:'test'});assert.equal(result.ok,true);
  assert.equal(pocketGuideState.select('route.currentEventId'),'e3');
});

test('V1.7 deduplicates automatic cues but can repeat on demand',async()=>{
  load();const engine=new WalkingGuidanceEngine({arrivalSamples:2});let cues=0;engine.onCue=()=>cues+=1;
  await engine.processPosition(offsetNorth(pack.places[0],250));await engine.processPosition(offsetNorth(pack.places[0],240));
  assert.equal(cues,1);assert.equal(engine.repeatLastCue(),true);assert.equal(cues,2);
});

test('V1.7 directions are deterministic and do not invent a turn without heading',()=>{
  assert.match(directionInstruction({bearing:0,heading:0,distanceMeters:50,placeName:'Alpha'}),/tout droit/);
  assert.match(directionInstruction({bearing:90,heading:0,distanceMeters:50,placeName:'Alpha'}),/droite/);
  assert.match(directionInstruction({bearing:270,heading:0,distanceMeters:50,placeName:'Alpha'}),/gauche/);
  assert.match(directionInstruction({bearing:180,heading:0,distanceMeters:50,placeName:'Alpha'}),/demi-tour/);
  assert.doesNotMatch(directionInstruction({bearing:90,heading:null,distanceMeters:50,placeName:'Alpha'}),/droite|gauche|demi-tour/);
  assert.equal(formatDistance(1250),'1.3 km');
});

test('V1.7 keeps missing sensor values unknown instead of coercing null to zero',async()=>{
  load();const engine=new WalkingGuidanceEngine();const snapshot=await engine.processPosition({lat:null,lng:null,accuracy:null,heading:null});
  assert.equal(snapshot.phase,GUIDANCE_PHASES.WAITING_GPS);assert.equal(snapshot.heading,null);assert.equal(snapshot.distanceMeters,null);
});

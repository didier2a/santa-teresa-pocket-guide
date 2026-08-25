import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRoutePack} from '../engine/routepack.js';
import {pocketGuideState} from '../js/pg16/core/pocketguide-state.js';
import {registerRouteActions} from '../js/pg16/route/route-actions.js';
import {WalkingGuidanceEngine,GUIDANCE_PHASES} from '../js/pg17/guidance/walking-guidance-engine.js';
import {WalkingSimulator,buildWalkingScenario} from '../js/pg17/simulation/walking-simulator.js';

const pack={id:'sim-walk',title:'Simulation walk',places:[
  {id:'a',name:'A',lat:41,lng:9,heroImage:'a.jpg'},
  {id:'b',name:'B',lat:41.002,lng:9.002,heroImage:'b.jpg'},
  {id:'c',name:'C',lat:41.002,lng:9.002,heroImage:'c.jpg'}
],days:[{events:[{id:'ea',placeId:'a'},{id:'eb',placeId:'b'},{id:'ec',placeId:'c'}]}]};

function load(){pocketGuideState.reset({source:'pg17-sim-test'});registerRouteActions();pocketGuideState.patch({route:{activeId:pack.id,title:pack.title,pack,currentEventId:'ea',nextEventId:'eb',completedEventIds:[],skippedEventIds:[]},session:{simulation:true}},{source:'pg17-sim-test'});}

test('walking scenario contains real positions and explicit continuation at a shared place',()=>{
  load();const scenario=buildWalkingScenario();assert.ok(scenario.filter(item=>item.type==='position').length>15);assert.ok(scenario.some(item=>item.type==='continue'));
});

test('the deterministic simulator drives the production engine to route completion',async()=>{
  load();const engine=new WalkingGuidanceEngine({arrivalSamples:2,exitMeters:70}),simulator=new WalkingSimulator({engine,stepMs:1});engine.resetForRoute();simulator.prepare();
  const phases=new Set();engine.onSnapshot=snapshot=>phases.add(snapshot.phase);
  while(simulator.index<simulator.items.length)await simulator.step();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(pocketGuideState.select('route.currentEventId'),null);
  assert.deepEqual(pocketGuideState.select('route.completedEventIds'),['ea','eb','ec']);
  assert.ok(phases.has(GUIDANCE_PHASES.PREVIEW));assert.ok(phases.has(GUIDANCE_PHASES.APPROACHING));assert.ok(phases.has(GUIDANCE_PHASES.ARRIVED));assert.ok(phases.has(GUIDANCE_PHASES.COMPLETED));
});

test('walking simulation supports pause, one step and reset',async()=>{
  load();const engine=new WalkingGuidanceEngine(),simulator=new WalkingSimulator({engine,stepMs:50});engine.resetForRoute();simulator.prepare();
  await simulator.step();assert.equal(simulator.index,1);simulator.run();simulator.pause();assert.equal(simulator.running,false);simulator.reset();assert.equal(simulator.index,0);assert.ok(simulator.items.length>0);
});

test('the published Santa Teresa RoutePack completes on the exact V1.7 simulator',async()=>{
  const raw=JSON.parse(await readFile(new URL('../data/trip.json',import.meta.url),'utf8')),loaded=await loadRoutePack(raw,{allowLegacy:true}),routeEvents=loaded.pack.days.flatMap(day=>day.events);
  pocketGuideState.reset({source:'pg17-real-pack'});registerRouteActions();pocketGuideState.patch({route:{activeId:loaded.pack.id,title:loaded.pack.title,pack:loaded.pack,currentEventId:routeEvents[0].id,nextEventId:routeEvents[1].id,completedEventIds:[],skippedEventIds:[]}},{source:'pg17-real-pack'});
  const engine=new WalkingGuidanceEngine(),simulator=new WalkingSimulator({engine});engine.resetForRoute();simulator.prepare();
  while(simulator.index<simulator.items.length)await simulator.step();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(routeEvents.length,12);assert.equal(simulator.items.length,109);assert.equal(pocketGuideState.select('route.completedEventIds').length,12);assert.equal(engine.phase,GUIDANCE_PHASES.COMPLETED);
});

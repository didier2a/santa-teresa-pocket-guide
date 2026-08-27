import test from 'node:test';
import assert from 'node:assert/strict';
import {PerceptionEngine} from '../js/pg16/perception/perception-engine.js';
import {pocketGuideState} from '../js/pg16/core/pocketguide-state.js';
import {eventBus} from '../js/pg16/core/event-bus.js';

async function withNavigator(value,run){const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value,configurable:true});try{return await run();}finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}}

test('le démarrage GPS attend la première position mesurée',async()=>withNavigator({geolocation:{watchPosition(success){queueMicrotask(()=>success({coords:{latitude:41.24,longitude:9.18,accuracy:7,heading:null},timestamp:Date.now()}));return 17;},clearWatch(){}}},async()=>{
  pocketGuideState.reset({source:'gps-test'});const engine=new PerceptionEngine(),started=await engine.startLocation({waitForResult:true});assert.equal(started,true);assert.equal(pocketGuideState.select('perception.gps'),'ready');assert.equal(pocketGuideState.select('location.lat'),41.24);assert.equal(pocketGuideState.select('location.lng'),9.18);assert.equal(pocketGuideState.select('location.accuracy'),7);
}));

test('un refus GPS est rendu comme un résultat négatif explicite',async()=>withNavigator({geolocation:{watchPosition(success,failure){queueMicrotask(()=>failure({code:1,message:'denied'}));return 18;},clearWatch(){}}},async()=>{
  pocketGuideState.reset({source:'gps-test'});let denied=false;const off=eventBus.once('gps.denied',()=>{denied=true;});try{const engine=new PerceptionEngine(),started=await engine.startLocation({waitForResult:true});assert.equal(started,false);assert.equal(denied,true);assert.equal(pocketGuideState.select('perception.gps'),'denied');assert.equal(pocketGuideState.select('diagnostics.lastError.scope'),'gps');}finally{off();}
}));

test('un délai ou une panne GPS ne reste plus bloqué sur starting',async()=>withNavigator({geolocation:{watchPosition(success,failure){queueMicrotask(()=>failure({code:3,message:'timeout'}));return 19;},clearWatch(){}}},async()=>{
  pocketGuideState.reset({source:'gps-test'});const engine=new PerceptionEngine(),started=await engine.startLocation({waitForResult:true});assert.equal(started,false);assert.equal(pocketGuideState.select('perception.gps'),'error');assert.equal(pocketGuideState.select('diagnostics.lastError.code'),'3');
}));

test('une absence de géolocalisation est annoncée immédiatement',async()=>withNavigator({},async()=>{
  pocketGuideState.reset({source:'gps-test'});const engine=new PerceptionEngine();assert.equal(await engine.startLocation({waitForResult:true}),false);assert.equal(pocketGuideState.select('perception.gps'),'unavailable');
}));

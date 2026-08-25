import test from 'node:test';
import assert from 'node:assert/strict';
import {EventBus} from '../js/pg16/core/event-bus.js';
import {PocketGuideState,pocketGuideState} from '../js/pg16/core/pocketguide-state.js';
import {ActionRegistry,actionRegistry} from '../js/pg16/core/action-registry.js';
import {HumanContextEngine} from '../js/pg16/core/context-engine.js';
import {registerRouteActions} from '../js/pg16/route/route-actions.js';
import {registerUiActions} from '../js/pg16/ui/ui-actions.js';
import {humanGuide} from '../js/pg16/guide/human-guide.js';

test('EventBus emits typed events',()=>{
  const bus=new EventBus();let received=null;
  bus.on('gps.updated',payload=>{received=payload});
  const event=bus.emit('gps.updated',{lat:41.3});
  assert.equal(event.type,'gps.updated');assert.deepEqual(received,{lat:41.3});
});

test('PocketGuideState deep patches without losing sibling state',()=>{
  const state=new PocketGuideState();
  state.patch({route:{activeId:'demo',title:'Demo'}});
  state.patch({route:{currentEventId:'e1'}});
  assert.equal(state.select('route.activeId'),'demo');
  assert.equal(state.select('route.currentEventId'),'e1');
  assert.deepEqual(state.select('route.completedEventIds'),[]);
});

test('ActionRegistry shares one execution path with metadata',async()=>{
  const registry=new ActionRegistry();let value=0;
  registry.register('map.open',{description:'Open map',handler:()=>++value});
  const result=await registry.execute('map.open',{}, {source:'voice'});
  assert.equal(result.ok,true);assert.equal(value,1);assert.equal(registry.describe('map.open').confirmation,'none');
});

test('HumanContextEngine produces a compact contextual snapshot',()=>{
  const state=new PocketGuideState({route:{activeId:'bonifacio',title:'Bonifacio',currentEventId:'e1',nextEventId:'e2',remainingMinutes:55},location:{lat:41.38,lng:9.15,accuracy:8},perception:{gps:'ready'}});
  const context=new HumanContextEngine(state).build();
  assert.equal(context.route.nextEventId,'e2');assert.equal(context.capabilities.canLocate,true);assert.equal(context.location.accuracy,8);
});

test('Human Guide routes UI requests through ActionRegistry',async()=>{
  pocketGuideState.reset({source:'test'});registerUiActions();registerRouteActions();
  const reply=await humanGuide.handleText('Montre-moi la carte',{source:'test'});
  assert.equal(reply.type,'SAY');assert.equal(pocketGuideState.select('ui.panel'),'map');assert.equal(pocketGuideState.select('conversation.lastAction'),'ui.open_map');
});

test('Human Guide requires confirmation before skipping a route step',async()=>{
  pocketGuideState.reset({source:'test'});
  pocketGuideState.patch({route:{activeId:'demo',title:'Demo',pack:{days:[{events:[{id:'e1',durationMinutes:10},{id:'e2',durationMinutes:10}]}]},currentEventId:'e1',nextEventId:'e2'}},{source:'test'});
  registerUiActions();registerRouteActions();
  const before=pocketGuideState.select('route.currentEventId');
  const proposal=await humanGuide.handleText('Saute cette étape',{source:'test'});
  assert.equal(proposal.type,'ASK');assert.equal(before,'e1');assert.equal(pocketGuideState.select('route.currentEventId'),'e1');assert.equal(pocketGuideState.select('proposals.pending.action'),'route.skip');
  await humanGuide.confirmPending(true);
  assert.equal(pocketGuideState.select('route.currentEventId'),'e2');assert.deepEqual(pocketGuideState.select('route.skippedEventIds'),['e1']);
});

test('No confirmation leaves structural state untouched',async()=>{
  pocketGuideState.reset({source:'test'});
  pocketGuideState.patch({route:{activeId:'demo',title:'Demo',pack:{days:[{events:[{id:'e1'},{id:'e2'}]}]},currentEventId:'e1',nextEventId:'e2'}},{source:'test'});
  registerRouteActions();
  await humanGuide.handleText('Ignore cette étape',{source:'test'});
  const reply=await humanGuide.confirmPending(false);
  assert.equal(reply.text,'D’accord, je ne change rien.');assert.equal(pocketGuideState.select('route.currentEventId'),'e1');
});

assert.ok(actionRegistry);

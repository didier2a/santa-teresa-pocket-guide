import test from 'node:test';
import assert from 'node:assert/strict';
import {pocketGuideState} from '../js/pg16/core/pocketguide-state.js';
import {actionRegistry} from '../js/pg16/core/action-registry.js';
import {transactionManager} from '../js/pg16/core/transaction-manager.js';
import {proposalManager} from '../js/pg16/core/proposal-manager.js';
import {memoryStore} from '../js/pg16/memory/memory-store.js';
import {registerRouteActions} from '../js/pg16/route/route-actions.js';

function pack(id='demo-rc1'){
  return {schemaVersion:'1.0',id,title:'RC1 Demo',subtitle:'',timezone:'Europe/Paris',travelers:1,start:'2026-08-25',end:'2026-08-25',days:[{date:'2026-08-25',label:'Test',events:[
    {id:'e1',time:'10:00',end:'10:20',title:'Citadelle',placeId:'p1',place:'Citadelle',type:'visit',priority:95,mustSee:true},
    {id:'e2',time:'10:20',end:'10:40',title:'Ruelle',placeId:'p2',place:'Ruelle',type:'visit',priority:15,mustSee:false},
    {id:'e3',time:'10:40',end:'11:00',title:'Belvédère',placeId:'p3',place:'Belvédère',type:'visit',priority:90,mustSee:true}
  ]}],places:[
    {id:'p1',name:'Citadelle',lat:41.1,lng:9.1,priority:95,mustSee:true},
    {id:'p2',name:'Ruelle',lat:41.11,lng:9.11,priority:15,mustSee:false},
    {id:'p3',name:'Belvédère',lat:41.12,lng:9.12,priority:90,mustSee:true}
  ],meta:{source:'test'}};
}

function load(p=pack()){
  pocketGuideState.reset({source:'test'});transactionManager.clear();
  pocketGuideState.patch({route:{activeId:p.id,title:p.title,pack:p,currentEventId:'e1',nextEventId:'e2',completedEventIds:[],skippedEventIds:[],remainingMinutes:60}},{source:'test'});
  registerRouteActions();
}

test('RC1 route actions register structural contracts',()=>{
  registerRouteActions();
  assert.equal(actionRegistry.describe('route.replace')?.confirmation,'required');
  assert.equal(actionRegistry.describe('route.replace')?.riskLevel,'structural');
  assert.equal(actionRegistry.describe('route.shorten')?.confirmation,'required');
});

test('persistent and session memories remain separated and forgettable',()=>{
  pocketGuideState.reset({source:'test'});
  memoryStore.setPreference('interest','histoire',{scope:'persistent',source:'explicit_user'});
  memoryStore.setPreference('pace','lent',{scope:'session',source:'explicit_user'});
  assert.equal(memoryStore.recall('preference.interest')?.value,'histoire');
  assert.equal(memoryStore.recall('preference.pace')?.scope,'session');
  assert.equal(memoryStore.forgetPreference('interest'),true);
  assert.equal(memoryStore.recall('preference.interest'),null);
});

test('structural proposal does not mutate before confirmation and then commits',async()=>{
  load();
  const before=pocketGuideState.select('route.pack.id');
  const replacement=pack('replacement-rc1');
  proposalManager.create({action:'route.replace',args:{pack:replacement},reason:'Changer de balade',summary:'Nouvelle balade'});
  assert.equal(pocketGuideState.select('route.pack.id'),before);
  await proposalManager.confirm();
  assert.equal(pocketGuideState.select('route.pack.id'),'replacement-rc1');
  assert.equal(transactionManager.canUndo(),true);
});

test('reject leaves route unchanged',()=>{
  load();const before=pocketGuideState.select('route.pack.id');
  proposalManager.create({action:'route.replace',args:{pack:pack('rejected-rc1')},reason:'test'});
  proposalManager.reject();
  assert.equal(pocketGuideState.select('route.pack.id'),before);
});

test('transaction rollback restores state on validation failure',async()=>{
  load();const before=pocketGuideState.get();
  await assert.rejects(()=>transactionManager.run({name:'bad',execute:()=>pocketGuideState.patch({route:{title:'MUTATED'}},{source:'test'}),validate:()=>false}));
  assert.deepEqual(pocketGuideState.get(),before);
});

test('undo restores previous route after confirmed structural change',async()=>{
  load();
  proposalManager.create({action:'route.replace',args:{pack:pack('undo-target')},reason:'test'});
  await proposalManager.confirm();assert.equal(pocketGuideState.select('route.activeId'),'undo-target');
  transactionManager.undo();assert.equal(pocketGuideState.select('route.activeId'),'demo-rc1');
});

test('shorten removes low-priority optional step but preserves must-see places',async()=>{
  load();
  proposalManager.create({action:'route.shorten',args:{removeCount:1},reason:'moins de temps'});
  await proposalManager.confirm();
  const remaining=(pocketGuideState.select('route.pack.days')||[]).flatMap(d=>d.events||[]).map(e=>e.id);
  assert.deepEqual(remaining,['e1','e3']);
  assert.equal(remaining.includes('e1'),true);assert.equal(remaining.includes('e3'),true);
});

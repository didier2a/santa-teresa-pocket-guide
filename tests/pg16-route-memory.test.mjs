import test from 'node:test';
import assert from 'node:assert/strict';
import {pocketGuideState} from '../js/pg16/core/pocketguide-state.js';
import {registerRouteActions} from '../js/pg16/route/route-actions.js';
import {registerUiActions} from '../js/pg16/ui/ui-actions.js';
import {installRouteMemory} from '../js/pg16/memory/route-memory.js';
import {memoryStore} from '../js/pg16/memory/memory-store.js';
import {humanGuide} from '../js/pg16/guide/human-guide.js';

function pack(){
  return {schemaVersion:'1.0',id:'memory-test',title:'Memory Test',timezone:'Europe/Paris',days:[{date:'2026-08-25',events:[
    {id:'e1',time:'10:00',end:'10:20',title:'Citadelle',placeId:'p1',type:'visit'},
    {id:'e2',time:'10:20',end:'10:40',title:'Ruelle',placeId:'p2',type:'visit'},
    {id:'e3',time:'10:40',end:'11:00',title:'Belvédère',placeId:'p3',type:'visit'}
  ]}],places:[
    {id:'p1',name:'Citadelle',lat:41.387,lng:9.159,historyLong:'Histoire de la citadelle.'},
    {id:'p2',name:'Ruelle',lat:41.388,lng:9.160,historyShort:'Histoire de la ruelle.'},
    {id:'p3',name:'Belvédère',lat:41.389,lng:9.161,historyShort:'Histoire du belvédère.'}
  ]};
}

function load(){
  const p=pack();
  pocketGuideState.reset({source:'route-memory-test'});
  registerUiActions();
  registerRouteActions();
  pocketGuideState.patch({route:{activeId:p.id,title:p.title,pack:p,currentEventId:'e1',nextEventId:'e2',completedEventIds:[],skippedEventIds:[],remainingMinutes:60}},{source:'route-memory-test'});
}

test('RC1 route memory records visited, skipped and already-told places',async()=>{
  load();
  const uninstall=installRouteMemory();
  try{
    const told=await humanGuide.handleText('Raconte ce lieu');
    assert.match(told.text,/Citadelle/);
    await humanGuide.handleText('Continue');
    await humanGuide.handleText('Saute cette étape');
    await humanGuide.confirmPending(true);

    const stories=memoryStore.recall('place.storiesTold',{scope:'session'})?.value||[];
    const visited=memoryStore.recall('route.visited',{scope:'session'})?.value||[];
    const skipped=memoryStore.recall('route.skipped',{scope:'session'})?.value||[];

    assert.equal(stories.at(-1)?.placeId,'p1');
    assert.equal(visited.at(-1)?.eventId,'e1');
    assert.equal(skipped.at(-1)?.eventId,'e2');
  }finally{
    uninstall();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {pocketGuideState} from '../js/pg16/core/pocketguide-state.js';
import {plannerEngine,extractDurationMinutes,resolveDestination,currentPlannerContext} from '../js/pg16/planner/planner-engine.js';

function bonifacioPack(){return {schemaVersion:'1.0',id:'bonifacio-demo',title:'Bonifacio Demo',subtitle:'',timezone:'Europe/Paris',travelers:1,start:'2026-08-25',end:'2026-08-25',days:[{date:'2026-08-25',label:'Bonifacio',events:[{id:'e1',time:'10:00',end:'10:20',title:'Porte de Gênes',placeId:'p1',place:'Porte de Gênes',type:'visit',priority:90,mustSee:true}]}],places:[{id:'p1',name:'Porte de Gênes',lat:41.387,lng:9.159,description:'',historyShort:'',historyLong:'',arCue:'',note:'',priority:90,mustSee:true,sourceLabel:'test',sourceUrl:'https://example.com'}],meta:{source:'test',verifiedAt:'2026-08-25'}};}

test('Porto-Vecchio request does not inherit Bonifacio route destination',()=>{
  pocketGuideState.reset({source:'test'});
  pocketGuideState.patch({route:{activeId:'bonifacio-demo',title:'Bonifacio Demo',pack:bonifacioPack(),currentEventId:'e1',nextEventId:null,completedEventIds:[],skippedEventIds:[],remainingMinutes:120},location:{lat:41.591, lng:9.279, accuracy:8, updatedAt:new Date().toISOString()}},{source:'test'});
  const prompt='Crée-moi une balade touristique à Porto-Vecchio dans l’heure qui suit';
  assert.equal(extractDurationMinutes(prompt),60);
  assert.equal(resolveDestination(prompt,'Porte de Gênes'),'');
  assert.equal(resolveDestination(prompt,'Bonifacio Demo'),'');
  assert.equal(resolveDestination(prompt,'Porto-Vecchio'),'Porto-Vecchio');
  const context=currentPlannerContext(prompt);
  assert.equal(context.durationMinutes,60);
  assert.equal(context.origin.lat,41.591);
  assert.equal(context.origin.lng,9.279);
  assert.equal(context.previousRoute.id,'bonifacio-demo');
});

test('Planner request sent to Worker keeps Porto-Vecchio and GPS context while Bonifacio stays previous route only',async()=>{
  pocketGuideState.reset({source:'test'});
  pocketGuideState.patch({route:{activeId:'bonifacio-demo',title:'Bonifacio Demo',pack:bonifacioPack(),currentEventId:'e1',nextEventId:null,completedEventIds:[],skippedEventIds:[],remainingMinutes:120},location:{lat:41.591,lng:9.279,accuracy:8,updatedAt:new Date().toISOString()},preferences:{session:{},persistent:{}}},{source:'test'});
  const originalFetch=globalThis.fetch;const calls=[];
  globalThis.fetch=async (url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith('/data/v2-config.json'))return new Response(JSON.stringify({apiBase:'https://worker.test',plannerModel:'test'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(String(url).endsWith('/v1/plan')){
      const body=JSON.parse(options.body);
      assert.equal(body.destination,'Porto-Vecchio');
      assert.match(body.prompt,/"origin":\{"lat":41\.591,"lng":9\.279/);
      assert.match(body.prompt,/"durationMinutes":60/);
      assert.match(body.prompt,/parcours actif précédent est uniquement un contexte à remplacer/i);
      return new Response(JSON.stringify({ok:true,pack:{schemaVersion:'1.0',id:'porto-vecchio-1h',title:'Porto-Vecchio en une heure',subtitle:'',timezone:'Europe/Paris',travelers:1,start:'2026-08-25',end:'2026-08-25',days:[{date:'2026-08-25',label:'Porto-Vecchio',events:[{id:'pv1',time:'17:10',end:'17:25',title:'Vieille ville',placeId:'pv-p1',place:'Vieille ville',type:'visit',priority:90,mustSee:true},{id:'pv2',time:'17:25',end:'17:40',title:'Bastion',placeId:'pv-p2',place:'Bastion',type:'visit',priority:80,mustSee:false},{id:'pv3',time:'17:40',end:'18:00',title:'Port',placeId:'pv-p3',place:'Port',type:'visit',priority:85,mustSee:true}]}],places:[{id:'pv-p1',name:'Vieille ville',lat:41.591,lng:9.279,description:'',historyShort:'',historyLong:'',arCue:'',note:'',priority:90,mustSee:true,sourceLabel:'test',sourceUrl:'https://example.com/1'},{id:'pv-p2',name:'Bastion',lat:41.5905,lng:9.2785,description:'',historyShort:'',historyLong:'',arCue:'',note:'',priority:80,mustSee:false,sourceLabel:'test',sourceUrl:'https://example.com/2'},{id:'pv-p3',name:'Port',lat:41.5898,lng:9.281,description:'',historyShort:'',historyLong:'',arCue:'',note:'',priority:85,mustSee:true,sourceLabel:'test',sourceUrl:'https://example.com/3'}],meta:{source:'test',verifiedAt:'2026-08-25'}},plannerModel:'test',verificationSources:[]}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try{
    const result=await plannerEngine.proposeReplacement({prompt:'Crée-moi une balade touristique à Porto-Vecchio dans l’heure qui suit',destination:'Porto-Vecchio',maxPlaces:3});
    assert.equal(result.plan.pack.id,'porto-vecchio-1h');
    assert.equal(pocketGuideState.select('route.activeId'),'bonifacio-demo');
    assert.equal(pocketGuideState.select('proposals.pending.action'),'route.replace');
  }finally{globalThis.fetch=originalFetch;}
});

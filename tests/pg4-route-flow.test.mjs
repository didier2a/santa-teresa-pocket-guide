import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EventBus} from '../js/pg16/core/event-bus.js';
import {StateStore,initialV4State} from '../js/pg4/core/state-store.js';
import {AuditLog} from '../js/pg4/core/audit-log.js';
import {EvidenceBus} from '../js/pg4/core/evidence-bus.js';
import {PolicyGuard} from '../js/pg4/core/policy-guard.js';
import {CapabilityRegistry} from '../js/pg4/core/capability-registry.js';
import {PlannerAdapter} from '../js/pg4/adapters/planner-adapter.js';
import {registerV4Capabilities} from '../js/pg4/orchestrator/register-capabilities.js';

function storage(){const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
const pack=JSON.parse(await readFile(new URL('../data/routepacks/santa-teresa-v4-preview.json',import.meta.url),'utf8'));

test('le Planner assemble RoutePack, médias et carte avant de proposer',async()=>{
  const progress=[];
  const fetchImpl=async input=>{assert.match(String(input),/\/api\/plan$/);return new Response(JSON.stringify({pack}),{status:200,headers:{'Content-Type':'application/json'}})};
  const mediaEnricher=async(value,{onProgress})=>{const places=value.places.map((place,index)=>{const next={...place,heroImage:`https://images.example/${place.id}.jpg`,imageAttribution:{source:'Wikimedia Commons',license:'CC BY-SA',descriptionUrl:'https://commons.wikimedia.org/'}};onProgress({index:index+1,total:value.places.length,place:next});return next});return{...value,places}};
  const planner=new PlannerAdapter({fetchImpl,mediaEnricher});const result=await planner.generate({request:'Crée une promenade',destination:'Santa Teresa di Gallura',durationMinutes:120,maxPlaces:5,transport:'walking'},{progress:value=>progress.push(value)});
  assert.equal(result.report.valid,true);assert.equal(result.summary.places,5);assert.equal(result.summary.mediaReady,5);assert.equal(result.map.markers.length,5);assert.ok(result.map.distanceKm>0);assert.deepEqual(progress.map(item=>item.phase).filter((value,index,list)=>list.indexOf(value)===index),['understanding','verification','media','map','narration']);
});

test('la route active ne change qu’après confirmation puis est sauvegardée hors ligne',async()=>{
  const bus=new EventBus(),target=storage(),state=new StateStore(initialV4State,bus),evidenceBus=new EvidenceBus({bus,auditLog:new AuditLog({storage:target})}),registry=new CapabilityRegistry({policyGuard:new PolicyGuard(),evidenceBus,bus});
  const proposal={pack,map:{provider:'OpenStreetMap',markers:pack.places.map(place=>({id:place.id,label:place.name,lat:place.lat,lng:place.lng})),polyline:pack.places.map(place=>[place.lat,place.lng]),distanceKm:4.5},summary:{title:pack.title,durationMinutes:120,places:5,distanceKm:4.5,mediaReady:0,mediaMissing:5},report:{valid:true,errors:[]}};
  const planner={generate:async(_input,{progress})=>{progress({phase:'construction'});return proposal}},offline={prepare:async value=>({routeId:value.id,stored:true,assetsRequested:0,assetsCached:0,degraded:false})};registerV4Capabilities({registry,state,planner,offline,storage:target});
  const planned=await registry.execute('planner.createRoute',{request:'Crée-moi une promenade',destination:'Santa Teresa di Gallura',durationMinutes:120,maxPlaces:5,transport:'walking'},{source:'voice',online:true});assert.equal(planned.status,'succeeded');assert.equal(state.select('activeRoute'),null);assert.equal(state.select('proposal.pack.id'),pack.id);
  const blocked=await registry.execute('route.confirmProposal',{},{});assert.equal(blocked.status,'blocked');assert.equal(state.select('activeRoute'),null);
  const confirmed=await registry.execute('route.confirmProposal',{}, {source:'voice',confirmed:true});assert.equal(confirmed.status,'succeeded');assert.equal(state.select('activeRoute.id'),pack.id);assert.equal(JSON.parse(target.getItem('pg-route-library-v1'))[0].id,pack.id);assert.equal(confirmed.data.offline.stored,true);
});


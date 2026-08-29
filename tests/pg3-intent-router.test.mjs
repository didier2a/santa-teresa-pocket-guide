import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EventBus} from '../js/pg16/core/event-bus.js';
import {CyberneticStateMachine} from '../js/pg3/core/cybernetic-state-machine.js';
import {IntentRouter,evaluateIntentProof} from '../js/pg3/orchestrator/intent-router.js';

const source=await readFile(new URL('../js/pg3/orchestrator/intent-router.js',import.meta.url),'utf8');
const logger={info(){},error(){}};
const createRouter=({intent='show_map',result={ok:true,intent:'show_map',speech:'Carte ouverte.',execution:{ok:true}},delegate}={})=>{
  const bus=new EventBus(),machine=new CyberneticStateMachine({bus,logger});
  const calls=[];
  const target=delegate||{handle(text,meta){calls.push({text,meta});return{handled:true,id:'legacy-1',intent,completion:Promise.resolve(result)};}};
  const router=new IntentRouter({delegate:target,machine,bus,classifier:()=>({type:intent}),context:()=>({}),autoDelay:60000,verificationDelay:0,logger});
  return{router,machine,bus,calls};
};

test('une intention reste modifiable puis suit le moteur 2.3.3 et termine avec preuve',async()=>{
  const {router,machine,bus,calls}=createRouter(),events=[];bus.on('pg3.intent.ready',()=>events.push('ready'));bus.on('pg3.intent.launched',()=>events.push('launched'));bus.on('pg3.intent.completed',payload=>events.push(payload.state));
  const staged=router.handle('Montre-moi la carte',{source:'test'});assert.equal(staged.handled,true);assert.equal(machine.snapshot.value,'checking');assert.equal(calls.length,0);
  const result=await staged.launch();assert.equal(result.ok,true);assert.equal(result.pg3.state,'succeeded');assert.equal(result.pg3.proof.execution,true);
  assert.equal(machine.snapshot.value,'succeeded');assert.deepEqual(events,['ready','launched','succeeded']);assert.equal(calls.length,1);
});

test('un guidage sans première position mesurée reste bloqué et ne produit pas de faux succès',async()=>{
  const {router,machine}=createRouter({intent:'start_guidance',result:{ok:true,intent:'start_guidance',speech:'Autorisez votre position.'}});
  const staged=router.handle('Guide-moi par GPS');const result=await staged.launch();
  assert.equal(result.pg3.state,'blocked');assert.equal(machine.snapshot.reason,'permission-required');
});

test('Modifier annule seulement une intention en attente et conserve le moteur intact',async()=>{
  const {router,machine,calls}=createRouter();const staged=router.handle('Montre-moi la carte');
  assert.equal(staged.cancel('modify'),true);const result=await staged.completion;
  assert.equal(result.cancelled,true);assert.equal(machine.snapshot.value,'idle');assert.equal(calls.length,0);
});

test('une exception devient failed avec un résultat narrable et borné',async()=>{
  const delegate={handle(){return{handled:true,id:'legacy-fail',intent:'show_map',completion:Promise.reject(new Error('carte indisponible'))};}};
  const {router,machine}=createRouter({delegate});const staged=router.handle('Montre la carte');const result=await staged.launch();
  assert.equal(result.ok,false);assert.equal(result.pg3.state,'failed');assert.equal(machine.snapshot.value,'failed');assert.match(result.speech,/voyage actuel reste intact/);
});

test('la preuve typée distingue attente, permission et succès',()=>{
  assert.equal(evaluateIntentProof('create_itinerary',{ok:true,awaiting:'destination'}).state,'blocked');
  assert.equal(evaluateIntentProof('start_guidance',{ok:true}).reason,'permission-required');
  assert.equal(evaluateIntentProof('route_status',{ok:true,speech:'Étape 2'}).state,'succeeded');
});

test('les minuteurs navigateur conservent le receveur global requis par Chrome',()=>{
  assert.match(source,/schedule=\(callback,delay\)=>globalThis\.setTimeout\(callback,delay\)/);
  assert.match(source,/cancelSchedule=timer=>globalThis\.clearTimeout\(timer\)/);
});

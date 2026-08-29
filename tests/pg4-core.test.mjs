import test from 'node:test';
import assert from 'node:assert/strict';
import {EventBus} from '../js/pg16/core/event-bus.js';
import {IntentRouter} from '../js/pg4/orchestrator/intent-router.js';
import {AuditLog} from '../js/pg4/core/audit-log.js';
import {EvidenceBus} from '../js/pg4/core/evidence-bus.js';
import {PolicyGuard} from '../js/pg4/core/policy-guard.js';
import {CapabilityRegistry} from '../js/pg4/core/capability-registry.js';

function storage(){const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
function runtime(){const bus=new EventBus(),auditLog=new AuditLog({storage:storage()}),evidenceBus=new EvidenceBus({bus,auditLog}),registry=new CapabilityRegistry({policyGuard:new PolicyGuard(),evidenceBus,bus});return{bus,auditLog,evidenceBus,registry};}

test('la demande composée produit une intention Planner structurée',()=>{
  const intent=new IntentRouter().parse('Crée-moi une promenade de deux heures à Santa Teresa, avec cartographie, photos et texte.',{source:'voice'});
  assert.equal(intent.capabilityId,'planner.createRoute');assert.equal(intent.input.destination,'Santa Teresa di Gallura');assert.equal(intent.input.durationMinutes,120);assert.equal(intent.input.transport,'walking');assert.deepEqual(intent.input.wants,{map:true,photos:true,text:true});assert.equal(intent.source,'voice');
});

test('navigation et confirmation sont des capacités explicites',()=>{
  const router=new IntentRouter();assert.equal(router.parse('Ouvre la carte').capabilityId,'nav.open');assert.equal(router.parse('Je confirme ce parcours').capabilityId,'route.confirmProposal');assert.equal(router.parse('Arrête tout').capabilityId,'operation.cancel');
});

test('une conversation naturelle LiveAvatar reste dans la boucle V3',()=>{
  const router=new IntentRouter();
  assert.equal(router.parse('Bonjour, raconte-moi quelque chose de surprenant.',{source:'liveavatar-voice'}),null);
  assert.equal(router.parse('Comment allez-vous aujourd’hui ?',{source:'liveavatar-voice'}),null);
  assert.equal(router.parse('Ouvre la carte',{source:'liveavatar-voice'}).capabilityId,'nav.open');
  assert.equal(router.parse('Une demande texte libre',{source:'touch'}).capabilityId,'guide.localFallback');
});

test('aucun succès ne peut être publié sans preuve typée',async()=>{
  const {registry}=runtime();registry.register({id:'broken',execute:async()=>({ok:true}),toEvidence:()=>undefined,toSpeech:()=>''});const evidence=await registry.execute('broken');assert.equal(evidence.status,'failed');assert.match(evidence.error,/preuve typée/);
});

test('la politique bloque une mutation structurelle sans confirmation',async()=>{
  const {registry}=runtime();let mutated=false;registry.register({id:'route.replace',confirmation:'before-commit',execute:async()=>{mutated=true;return{ok:true}},toEvidence:value=>value,toSpeech:()=>''});const evidence=await registry.execute('route.replace',{},{});assert.equal(evidence.status,'blocked');assert.equal(evidence.data.confirmationRequired,true);assert.equal(mutated,false);
});

test('une action longue est réellement annulable',async()=>{
  const {registry}=runtime();registry.register({id:'long',timeoutMs:5000,execute:(_input,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});}),toEvidence:value=>value,toSpeech:()=>''});const completion=registry.execute('long');await new Promise(resolve=>setTimeout(resolve,5));assert.equal(registry.cancel(null),1);const evidence=await completion;assert.equal(evidence.status,'cancelled');
});

test('le journal local masque les secrets',()=>{
  const target=storage(),log=new AuditLog({storage:target}),sample=`s${'k-proj-abcdefgh'}`;log.append({token:'secret-value',message:`Authorization ${sample}`});const [entry]=log.list();assert.equal(entry.token,'[redacted]');assert.doesNotMatch(entry.message,/sk-proj/);
});

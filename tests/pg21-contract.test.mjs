import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {MOMENTS,deriveMoment} from '../js/pg21/core/adaptive-moment-engine.js';
import {JourneyConcierge} from '../js/pg21/companion/journey-concierge.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [spec,html,css,manifest,app,realtime,concierge,worker]=await Promise.all([
  read('docs/PG21_ERGONOMIC_TECHNICAL_SPEC.md'),read('pocketguide-v21.html'),read('pocketguide-v21.css'),read('manifest-v21.webmanifest'),read('js/pg21/bootstrap/app.js'),read('js/pg21/companion/human-realtime-companion.js'),read('js/pg21/companion/journey-concierge.js'),read('service-worker.js')
]);

test('V2.1 formalizes every acceptance gate G81 through G100',()=>{
  for(let gate=81;gate<=100;gate+=1)assert.match(spec,new RegExp(`G${gate}\\b`));
  for(const moment of ['Accueil humain','Intention libre','Compréhension','Affichage contextuel','Confirmation','Mode marche','Accueil au POI','Souvenir situé','Carnet local','Clôture'])assert.match(spec,new RegExp(moment,'i'));
});

test('V2.1 exposes exactly three primary spaces and one adaptive main action',()=>{
  assert.equal((html.match(/data-view-target=/g)||[]).length,3);
  for(const view of ['companion','journey','memories'])assert.match(html,new RegExp(`data-view-panel="${view}"`));
  assert.equal((html.match(/id="momentPrimary"/g)||[]).length,1);
  assert.match(html,/Mes voyages/);assert.doesNotMatch(html,/IA locale|IA Realtime/);
});

test('the local human guide asset is optimized, transparent-capable and reused consistently',async()=>{
  const asset=new URL('../assets/companion/human-guide-v21.webp',import.meta.url),info=await stat(asset),bytes=await readFile(asset);
  assert.ok(info.size>40_000&&info.size<500_000);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  assert.ok((html.match(/human-guide-v21\.webp/g)||[]).length>=3);assert.match(css,/prefers-reduced-motion:reduce/);
});

test('the deterministic moment engine covers the eight interface moments',()=>{
  assert.deepEqual(Object.keys(MOMENTS),['welcome','prepare','ready','walking','arrived','preview','completed','memories']);
  const pack={id:'route',days:[{events:[{id:'e1'}]}]},base={route:{pack,currentEventId:'e1',completedEventIds:[]},ui:{panel:'companion'},perception:{gps:'unknown'}};
  assert.equal(deriveMoment({state:{route:{pack:null},ui:{panel:'companion'}}}).id,'welcome');
  assert.equal(deriveMoment({state:base,planning:true}).id,'prepare');assert.equal(deriveMoment({state:base}).id,'ready');
  assert.equal(deriveMoment({state:{...base,perception:{gps:'ready'}},snapshot:{phase:'en_route'}}).id,'walking');
  assert.equal(deriveMoment({state:base,snapshot:{phase:'arrived'}}).id,'arrived');assert.equal(deriveMoment({state:base,previewOpen:true}).id,'preview');
  assert.equal(deriveMoment({state:{...base,route:{...base.route,currentEventId:null,completedEventIds:['e1']}}}).id,'completed');
  assert.equal(deriveMoment({state:{...base,ui:{panel:'memories'}}}).id,'memories');
});

test('the local concierge asks one question at a time and never invents an around-me origin',()=>{
  const conciergeEngine=new JourneyConcierge();let result=conciergeEngine.consume('Crée une excursion autour de moi',{location:{simulated:false}});
  assert.equal(result.handled,true);assert.equal(result.needsLocation,true);assert.equal(result.ready,false);assert.match(result.reply,/activez.*GPS/i);
  result=conciergeEngine.consume('Ma position est active',{location:{lat:41.39,lng:9.15,simulated:false}});assert.equal(result.ready,false);assert.match(result.reply,/Combien de temps/i);
  const complete=new JourneyConcierge().consume('Crée une excursion à Bonifacio de deux heures, tranquille, avec histoire et panoramas',{location:{simulated:false}});
  assert.equal(complete.ready,true);assert.equal(complete.data.destination,'Bonifacio');assert.equal(complete.data.durationMinutes,120);assert.equal(complete.data.pace,'tranquille');assert.match(complete.data.interests,/histoire/);
});

test('permissions are progressive and proposal/preview transitions are wired',()=>{
  const welcomeHandler=app.match(/#startTogether[\s\S]{0,700}/)?.[0]||'';assert.doesNotMatch(welcomeHandler,/startLocation/);assert.match(welcomeHandler,/startVoice/);
  assert.match(app,/ui\.location\.requested/);assert.match(app,/allowPosition/);assert.match(app,/renderProposalSummary/);assert.match(app,/showDialog\(\$\('#readyDialog'\)\)/);assert.match(app,/adaptiveMomentEngine\.setPreview\(true\)/);
  assert.match(html,/transmettra ponctuellement cette image à OpenAI|Rien n’est envoyé automatiquement/);
});

test('Realtime and local modes share the same human identity and planning contract',()=>{
  for(const field of ['destination','durée','rythme','centres d’intérêt'])assert.match(realtime,new RegExp(field,'i'));
  assert.match(realtime,/Tu ne te fais jamais passer pour une personne physique/);assert.match(realtime,/Une image personnelle n’est analysée qu’après/);
  for(const field of ['destination','durationMinutes','pace','interests'])assert.match(concierge,new RegExp(field));
});

test('V2.1 is an independent offline-installable PWA',()=>{
  const parsed=JSON.parse(manifest);assert.match(parsed.start_url,/pocketguide-v21\.html/);assert.match(parsed.id,/pocketguide-v21\.html/);
  assert.match(worker,/PG21_CACHE='pocketguide-v21-human-companion-rc1'/);assert.match(worker,/PG21_REQUIRED/);assert.match(worker,/pocketguide-v21\.html/);assert.match(worker,/human-guide-v21\.webp/);assert.match(worker,/\/js\/pg21\//);
});

test('premium ergonomics preserve touch, safe-area, landscape and accessibility guarantees',()=>{
  assert.match(css,/min-height:46px|min-height:48px/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/orientation:landscape/);assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(html,/aria-live="polite"/);assert.match(html,/aria-label="Navigation principale"/);assert.match(html,/capture="environment"/);
});

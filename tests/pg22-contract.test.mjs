import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {PLANNING_STAGES,PlanningStageEngine} from '../js/pg22/planning/planning-stage-engine.js';
import {MediaPackEngine,mediaRecord} from '../js/pg22/media/media-pack-engine.js';
import {MemoryAudioPackStore,UnifiedVoiceService,narrationEntries,UNIFIED_VOICE} from '../js/pg22/audio/unified-audio-pack.js';
import {MAP_MODES,MapModeController,googleReadiness} from '../js/pg22/maps/map-mode-controller.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [spec,html,css,configText,manifest,worker,sw,planner,audioSource,avatarSource,mapSource,runtime]=await Promise.all([
  read('docs/PG22_AUDIVISUAL_TECHNICAL_SPEC.md'),read('pocketguide-v22.html'),read('pocketguide-v22.css'),read('data/v22-config.json'),read('manifest-v22.webmanifest'),read('cloudflare/pocketguide-v2-worker.js'),read('service-worker.js'),read('js/pg16/planner/planner-engine.js'),read('js/pg22/audio/unified-audio-pack.js'),read('js/pg22/avatar/avatar-runtime.js'),read('js/pg22/maps/map-mode-controller.js'),read('js/pg22/bootstrap/audiovisual-runtime.js')
]);
const config=JSON.parse(configText);

test('V2.2 formalizes every acceptance gate G101 through G120',()=>{for(let gate=101;gate<=120;gate+=1)assert.match(spec,new RegExp(`G${gate}\\b`));});

test('one audiovisual companion exposes thinking, visemes and immediate interruption',async()=>{
  for(const id of ['humanGuide','avatarMouth','thinkingPanel','thinkingLabel','thinkingProgress','cancelPlanning','modifyPlanning','stopCompanion','remoteAudio','guideAudio'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(css,/human-guide-visemes-v22\.png/);assert.match(css,/data-avatar-state="thinking"/);assert.match(css,/data-avatar-state="speaking"/);assert.match(runtime,/unifiedVoiceService\.interrupt\(\)/);assert.match(runtime,/avatarRuntime\.interrupt\(\)/);
  const image=await stat(new URL('../assets/companion/human-guide-visemes-v22.png',import.meta.url));assert.ok(image.size>100_000&&image.size<1_500_000);
  assert.match(audioSource,/createMediaStreamSource/);assert.match(runtime,/response\.output_audio_transcript\.delta/);assert.match(avatarSource,/transcript-fallback/);assert.match(runtime,/lipsync/);
});

test('planning stages are operational, ordered and cancellable',()=>{
  assert.deepEqual(PLANNING_STAGES.map(item=>item.id),['understanding','verification','route','media','audio','finalizing','ready']);
  const events=[],engine=new PlanningStageEngine({bus:{emit:(type,payload)=>events.push({type,payload})}}),signal=engine.begin({prompt:'Bonifacio'});assert.equal(engine.running,true);engine.set('verification');engine.progress('media',2,4);assert.equal(engine.current.progress,74);assert.equal(engine.cancel('user'),true);assert.equal(signal.aborted,true);assert.ok(events.some(item=>item.type==='pg22.planning.cancelled'));
  assert.match(planner,/signal/);assert.match(runtime,/AbortController|planningStageEngine\.begin/);assert.match(runtime,/Votre voyage actuel reste intact/);
});

test('MediaPack retains open-license provenance and never blocks on missing photos',async()=>{
  const place={id:'citadelle',name:'Citadelle de Bonifacio'},page={pageid:42,title:'File:Citadelle.jpg',imageinfo:[{url:'https://upload.wikimedia.org/full.jpg',thumburl:'https://upload.wikimedia.org/thumb.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Citadelle.jpg',extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},Artist:{value:'Auteur Test'}}}]};
  const record=mediaRecord(page,place,{now:()=> '2026-08-26T00:00:00Z'});for(const field of ['source','sourceUrl','author','license','licenseUrl','attribution','alt','confidence','cachePolicy','verifiedAt'])assert.ok(record[field]!==undefined,field);
  const engine=new MediaPackEngine({fetchImpl:async()=>new Response('{}',{status:503})}),pack={id:'route',title:'Route',places:[place,{id:'port',name:'Port'}],days:[]},progress=[];const result=await engine.enrich(pack,{onProgress:value=>progress.push(value)});assert.equal(result.mediaPack.status,'empty');assert.equal(result.mediaPack.failures.length,2);assert.equal(progress.length,2);assert.equal(result.pack.title,'Route');
});

test('AudioPack uses marin, persists blobs and strict mode never invokes Android browser TTS',async()=>{
  let speechCalls=0;globalThis.speechSynthesis={cancel(){speechCalls+=1;},speak(){speechCalls+=1;}};globalThis.SpeechSynthesisUtterance=class{};
  const fetchImpl=async url=>String(url).startsWith('./data/')?new Response(JSON.stringify({apiBase:'https://worker.test',voice:'marin',ttsModel:'gpt-4o-mini-tts',offlineAudioMode:'strict'}),{headers:{'Content-Type':'application/json'}}):new Response(new Blob(['audio'],{type:'audio/mpeg'}),{status:200,headers:{'Content-Type':'audio/mpeg'}}),store=new MemoryAudioPackStore(),service=new UnifiedVoiceService({store,fetchImpl});
  const pack={id:'route',title:'Balade',subtitle:'Deux heures',places:[{id:'p1',name:'Place',description:'Une belle place.'}]};assert.equal(narrationEntries(pack).length,2);const audioPack=await service.prepare(pack);assert.equal(audioPack.voice,UNIFIED_VOICE);assert.equal(audioPack.status,'complete');assert.equal((await store.list('route')).length,2);
  const failed=new UnifiedVoiceService({store:new MemoryAudioPackStore(),fetchImpl:async url=>String(url).startsWith('./data/')?new Response(JSON.stringify({apiBase:'https://worker.test',voice:'marin',offlineAudioMode:'strict'})):new Response('{}',{status:503})});const result=await failed.speak('Texte non préparé');assert.equal(result.mode,'strict-text');assert.equal(speechCalls,0);delete globalThis.speechSynthesis;delete globalThis.SpeechSynthesisUtterance;
  assert.match(worker,/\/v2\/speech/);assert.match(worker,/voice!==['"]marin['"]/);assert.match(audioSource,/attachToItinerary/);
});

test('map switcher provides four modes but Google remains lazy and opt-in',async()=>{
  assert.deepEqual(MAP_MODES,['osm','satellite','street','3d']);for(const mode of MAP_MODES)assert.match(html,new RegExp(`data-map-mode="${mode}"`));assert.doesNotMatch(html,/src="https:\/\/maps\.googleapis\.com/);assert.match(html,/contacte Google Maps/);assert.match(mapSource,/dataset\.pg22Google=['"]explicit['"]/);assert.match(mapSource,/radius:100/);assert.match(mapSource,/fallbackFrom:'3d'/);
  let loads=0;const controller=new MapModeController({loader:{load:async()=>{loads+=1;}},fetchImpl:async()=>new Response('{}')});controller.config={googleMaps:{enabled:true,browserKey:'restricted',restrictionsVerified:true,apiRestrictionsVerified:true,quotasConfigured:true,billingAlertsConfigured:true,cachePolicy:'online-only-no-durable-google-media-cache'}};await assert.rejects(()=>controller.ensureGoogle({explicit:false}),/action explicite/);assert.equal(loads,0);assert.equal(googleReadiness(controller.config).ready,true);
  assert.equal(googleReadiness(config).ready,false);assert.equal(config.googleMaps.enabled,false);assert.equal(config.googleMaps.browserKey,'');
});

test('V2.2 remains an independent offline-installable PWA',()=>{const parsed=JSON.parse(manifest);assert.match(parsed.start_url,/pocketguide-v22\.html/);assert.match(sw,/PG22_CACHE='pocketguide-v22-unified-audiovisual-2-2-1'/);for(const asset of ['pocketguide-v22.html','pocketguide-v22.css','manifest-v22.webmanifest','data/v22-config.json','human-guide-visemes-v22.png','js/pg22/audio/unified-audio-pack.js'])assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));});

test('premium mobile ergonomics preserve accessibility and privacy',()=>{assert.match(css,/min-height:44px/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(html,/aria-live="polite"/);assert.match(html,/Rien n’est envoyé automatiquement/);assert.match(spec,/ne les archive pas|ne sont ni exportées/i);});

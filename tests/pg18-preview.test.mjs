import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRoutePack} from '../engine/routepack.js';
import {buildPhotoPreviewScenes,PhotoPreviewEngine,MODES} from '../js/pg18/simulation/photo-preview-engine.js';

const pack={id:'preview',title:'Aperçu',places:[{id:'p1',name:'Un',lat:41,lng:9,heroImage:'one.jpg',historyShort:'Histoire un.'},{id:'p2',name:'Deux',lat:41.001,lng:9.001,heroImage:'two.jpg'}],days:[{events:[{id:'e1',placeId:'p1'},{id:'e2',placeId:'p2'}]}]};
const itinerary={id:'preview',title:'Aperçu',label:'Aperçu',routePack:pack,progress:{currentEventId:'e1',completedEventIds:[]}};
const media=[{id:'m1',itineraryId:'preview',eventId:'e1',poiId:'p1',caption:'Souvenir un',capturedAt:'2026-01-01T10:00:00.000Z',blob:new Blob(['x'])}];

test('preview modes produce exact preparatory, souvenir and enriched scene sets',()=>{const preparatory=buildPhotoPreviewScenes({itinerary,media,mode:MODES.PREPARATORY}),souvenir=buildPhotoPreviewScenes({itinerary,media,mode:MODES.SOUVENIR}),enriched=buildPhotoPreviewScenes({itinerary,media,mode:MODES.ENRICHED});assert.equal(preparatory.length,2);assert.equal(souvenir.length,1);assert.equal(enriched.length,3);assert.deepEqual(preparatory.map(scene=>scene.eventId),['e1','e2']);assert.deepEqual(enriched.map(scene=>scene.provenance),['RoutePack','Photo personnelle','RoutePack']);});
test('preview derives distance, time, narration and progress from the saved RoutePack',()=>{const scenes=buildPhotoPreviewScenes({itinerary,media:[]});assert.equal(scenes[0].distanceMeters,0);assert.ok(scenes[1].distanceMeters>100);assert.ok(scenes[1].walkingMinutes>=1);assert.match(scenes[0].narration,/Histoire un/);assert.equal(scenes[1].progress,1);});
test('preview playback supports navigation, repeat, pause and completion without route mutation',()=>{const before=structuredClone(itinerary),engine=new PhotoPreviewEngine({sceneMs:1000}),seen=[];engine.onScene=scene=>seen.push(scene.id);engine.load({itinerary,media:[]});engine.next();engine.previous();engine.repeat();engine.play();engine.pause();engine.show(1);assert.equal(engine.next().status,'completed');assert.deepEqual(itinerary,before);assert.ok(seen.length>=5);});
test('published Santa Teresa RoutePack builds twelve exact preparatory scenes',async()=>{const raw=JSON.parse(await readFile(new URL('../data/trip.json',import.meta.url),'utf8')),loaded=await loadRoutePack(raw,{allowLegacy:true}),item={id:loaded.pack.id,title:loaded.pack.title,routePack:loaded.pack};const scenes=buildPhotoPreviewScenes({itinerary:item,media:[],mode:MODES.PREPARATORY});assert.equal(scenes.length,12);assert.equal(scenes[0].sceneIndex,0);assert.equal(scenes.at(-1).progress,1);});


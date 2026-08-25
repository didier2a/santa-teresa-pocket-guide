import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [contract,html,css,sw,persistence,entry,enhancer,store,manager,backup,capture,journal,preview]=await Promise.all([
  read('docs/PG18_RC1_ACCEPTANCE_CONTRACT.md'),read('pocketguide-18.html'),read('pg18-bridge.css'),read('service-worker.js'),read('js/pg16/core/state-persistence.js'),read('js/pg18/bootstrap/app-entry.js'),read('js/pg18/bootstrap/app-enhancer.js'),read('js/pg18/storage/itinerary-store.js'),read('js/pg18/itineraries/itinerary-manager.js'),read('js/pg18/backup/portable-backup.js'),read('js/pg18/media/photo-capture.js'),read('js/pg18/journal/audiovisual-journal.js'),read('js/pg18/simulation/photo-preview-engine.js')
]);

test('V1.8 contract preserves earlier gates and defines G25 through G52',()=>{assert.match(contract,/G0–G15/);assert.match(contract,/G16–G24/);for(let gate=25;gate<=52;gate+=1)assert.match(contract,new RegExp(`G${gate}`));});
test('V1.8 is a separate entry point extending the production V1.7 engine',()=>{assert.match(entry,/pg16\/bootstrap\/app-rc-entry\.js/);assert.match(entry,/pg17\/bootstrap\/app-enhancer\.js/);assert.match(entry,/app-enhancer\.js\?v=1\.8\.0rc3/);assert.match(enhancer,/__POCKETGUIDE_18__/);});
test('traveller UI exposes library, simulation, capture, journal and portable backup controls',()=>{for(const id of ['pg18SimulateCurrent','pg18Capture','pg18LibraryList','pg18Import','pg18OpenJournal','pg18PreviewDialog','pg18PhotoDialog','pg18PhotoInput','pg18ImportInput'])assert.match(html,new RegExp(`id="${id}"`));assert.match(html,/Vos photos restent sur ce téléphone/);});
test('V1.8 has isolated state, IndexedDB and service-worker cache',()=>{assert.match(persistence,/pocketguide-18-state-rc1/);assert.match(store,/pocketguide-v18-local/);assert.match(sw,/PG18_CACHE='pocketguide-v18-rc1-local-journal3'/);assert.match(sw,/pocketguide-18\.html/);assert.match(sw,/js\/pg18\/storage\/itinerary-store\.js/);});
test('Santa Teresa preview prefers the curated place catalogue over homonymous search results',()=>{assert.match(enhancer,/V51_PHOTO_MAP/);assert.match(enhancer,/canonicalPlace/);assert.match(enhancer,/photoExact:photo\.exact/);});
test('personal photo capture is local, user initiated and GPS-truthful',()=>{assert.match(html,/capture="environment"/);assert.match(capture,/source:'personal-camera'/);assert.match(capture,/lat:finite\(location\?\.lat\)/);assert.doesNotMatch(capture,/fetch\(/);assert.match(enhancer,/pg18Capture.*requestPhoto/);});
test('binary media uses IndexedDB and complete versioned export import',()=>{assert.match(store,/indexedDB\.open/);assert.match(store,/MEDIA_STORE='media'/);assert.match(backup,/pocketguide\.backup\/v1/);assert.match(backup,/application\/vnd\.pocketguide\+json/);assert.match(backup,/blobToDataUrl/);assert.match(backup,/dataUrlToBlob/);});
test('preview modes and journal provenance are explicit',()=>{for(const mode of ['preparatory','souvenir','enriched'])assert.match(preview,new RegExp(mode));assert.match(journal,/provenance:'RoutePack'/);assert.match(journal,/provenance:'Photo personnelle'/);});
test('V1.8 mobile layer keeps touch and reduced-motion contracts',()=>{assert.match(css,/min-height:44px/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(html,/aria-live="polite"/);});
test('local management supports autosave, revision, resume, duplication, archive and delete',()=>{for(const token of ['saveCurrent','revision','duplicate','archive','delete','route.loaded'])assert.match(manager,new RegExp(token));});

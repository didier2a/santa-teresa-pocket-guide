import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);const read=p=>readFile(new URL(p,root),'utf8');

test('V1.4.8: Studio conserve texte, dictée longue et ouverture PocketGuide',async()=>{
  const html=await read('studio-148.html');
  assert.match(html,/id="prompt"/);assert.match(html,/id="mic"/);assert.match(html,/🎙️ Parler/);
  assert.match(html,/voice-long-v1-4-7\.js/);assert.match(html,/id="preview"/);assert.match(html,/Mes itinéraires/);
});

test('V1.4.8: enrichissement média Wikimedia est câblé',async()=>{
  const media=await read('js/route-media.js'),studio=await read('js/studio-v1-4-8.js');
  assert.match(media,/commons\.wikimedia\.org\/w\/api\.php/);assert.match(media,/extmetadata/);assert.match(media,/mediaEnrichedAt/);
  assert.match(studio,/enrichRoutePackMedia/);assert.match(studio,/mediaProvider|photo/);
});

test('V1.4.8: bibliothèque locale permet sauvegarde, rechargement et suppression',async()=>{
  const lib=await read('js/route-library.js'),studio=await read('js/studio-v1-4-8.js');
  for(const token of ['saveRoutePack','loadSavedRoute','deleteSavedRoute','renameSavedRoute'])assert.match(lib,new RegExp(token));
  assert.match(studio,/listSavedRoutes/);assert.match(studio,/data-action="open"/);assert.match(studio,/data-action="load"/);
});

test('V1.4.8: moteur générique affiche carte, marqueurs et galeries média',async()=>{
  const boot=await read('js/route-bootstrap.js');
  assert.match(boot,/L\.layerGroup/);assert.match(boot,/circleMarker/);assert.match(boot,/bindPopup/);assert.match(boot,/pg-media-gallery/);assert.match(boot,/Mes itinéraires/);
});

test('V1.4.8: service worker met en cache les nouveaux composants',async()=>{
  const sw=await read('service-worker.js');
  assert.match(sw,/pocketguide-engine-v1-4-8a/);assert.match(sw,/studio-148\.html/);assert.match(sw,/route-library\.js/);assert.match(sw,/route-media\.js/);assert.match(sw,/studio-v1-4-8\.js/);
});

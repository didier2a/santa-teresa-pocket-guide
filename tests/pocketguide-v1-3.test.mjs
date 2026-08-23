import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);const read=p=>readFile(new URL(p,root),'utf8');

test('V1.3+: la carte générique est cadrée depuis les lieux du RoutePack',async()=>{
  const boot=await read('js/route-bootstrap.js');
  assert.match(boot,/__POCKETGUIDE_LEAFLET_MAP__/);
  assert.match(boot,/latLngBounds/);
  assert.match(boot,/fitBounds\(bounds\.pad\(\.18\)/);
  assert.match(boot,/routePointsForDay/);
  assert.match(boot,/__POCKETGUIDE_GENERIC_ROUTE__/);
  assert.match(boot,/dataset\.mapRoutePack='ready'/);
});

test('V1.3+: Studio reste piloté par prompt et conserve validation aperçu partage',async()=>{
  const html=await read('studio.html'),js=await read('js/studio-v1-4.js');
  assert.match(html,/AI PLANNER · V1\.4/);
  for(const id of ['prompt','generate','preview','share','download'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/validateRoutePack/);
  assert.match(js,/packShareUrl/);
  assert.match(js,/routeShareUrl/);
});

test('V1.3 local reste disponible comme référence de compilation déterministe',async()=>{
  const js=await read('js/studio-v1-3.js');
  assert.match(js,/Brouillon automatique/);
  assert.match(js,/horaires d’ouverture/);
  assert.match(js,/réservations/);
  assert.match(js,/transports/);
});

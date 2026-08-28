import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [manifestText,css,sw,vercelText,page,shell,bootstrap,router,controller,endpoint,app21]=await Promise.all([
  read('manifest-v233.webmanifest'),read('pocketguide-v233.css'),read('service-worker.js'),read('vercel.json'),read('pocketguide-v23.html'),read('js/pg23/bootstrap/app.js'),read('js/pg233/bootstrap/app.js'),read('js/pg233/core/guide-command-router.js'),read('js/pg23/avatar/liveavatar-realtime-controller.js'),read('api/liveavatar-session.js'),read('js/pg21/bootstrap/app.js')
]);

test('PocketGuide 2.3.3 possède une URL et une installation PWA stables',()=>{
  const manifest=JSON.parse(manifestText),vercel=JSON.parse(vercelText);assert.equal(manifest.id,'./pocketguide-2.3.3');assert.match(manifest.start_url,/pocketguide-2\.3\.3/);assert.match(manifest.name,/V2\.3\.3/);
  assert.ok(vercel.rewrites.some(rule=>rule.source==='/pocketguide-2.3.3'&&/pocketguide-v23\.html\?v233=1&liveavatar=1/.test(rule.destination)));
  assert.match(shell,/V233_MODE/);assert.match(shell,/manifest-v233\.webmanifest/);assert.match(shell,/pocketguide-v233\.css/);assert.match(shell,/pg233\/bootstrap\/app\.js/);
});

test('la 2.3.2 reste la valeur par défaut lorsque la route 2.3.3 n’est pas demandée',()=>{
  assert.match(shell,/SHELL_VERSION=V233_MODE\?'2\.3\.3':'2\.3\.2'/);assert.match(shell,/initialParams\.get\('v233'\)==='1'/);assert.match(shell,/url\.searchParams\.set\('liveavatar','1'\)/);
});

test('les quatre capacités prioritaires sont visibles et tactiles dans la coque 2.3.3',()=>{
  for(const text of ['Créer / modifier','Guider par GPS','Carte et fiches','Mes voyages'])assert.match(bootstrap,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(bootstrap,/data-pg233-command/);assert.match(css,/min-height:88px/);assert.match(css,/focus-visible/);assert.match(css,/prefers-reduced-motion:reduce/);
});

test('GPS et carte-fiches exposent leurs résultats au lieu de rester silencieux',()=>{
  for(const id of ['locationStatus','journeyRouteContent','journeyRouteCards','journeyRouteContentCount'])assert.match(page,new RegExp(`id="${id}"`));
  assert.match(bootstrap,/pg23\.presentation\.frame/);assert.match(bootstrap,/pg23\.presentation\.failed/);assert.match(css,/journey-route-card/);
});

test('LiveAvatar délègue les actions à PocketGuide puis prononce seulement leur résultat',()=>{
  assert.match(controller,/this\.onCommand/);assert.match(controller,/cancelResponse\('pg233-voice-command'\)/);assert.match(controller,/\[POCKETGUIDE_APP_RESULT\]/);assert.match(controller,/this\.narrate/);assert.match(bootstrap,/guideCommandRouter\.handle/);
  assert.match(endpoint,/POCKETGUIDE_CONTEXT_233_NAME/);assert.match(endpoint,/L'application PocketGuide est la seule source de vérité/);assert.match(endpoint,/appVersion==='2\.3\.3'/);assert.match(endpoint,/voice:'marin'/);
});

test('itinéraire, GPS, contenus et stockage sont reliés aux moteurs existants',()=>{
  for(const dependency of ['plannerEngine','walkingGuidanceEngine','itineraryManager','livingSceneEngine','actionRegistry'])assert.match(router,new RegExp(dependency));
  for(const action of ['ui.open_map','pg23.present_route','ui.open_memories','ui.open_companion'])assert.match(router,new RegExp(action.replace('.','\\.')));
  assert.match(router,/proposalManager/);assert.match(router,/saveCurrent\('pg233-command'\)/);
});

test('le formulaire distingue une création d’une révision qui conserve le parcours actif',()=>{
  assert.match(page,/data-planner-mode="create"/);assert.match(bootstrap,/dialog\.dataset\.plannerMode=mode/);assert.match(app21,/editMode\?buildRouteRevisionPrompt\(prompt,pack\):prompt/);assert.match(app21,/\(pack\.places\|\|\[\]\)\.length/);
});

test('le mode 2.3.3 et ses modules sont disponibles hors ligne sans altérer le cache 2.3.2',()=>{
  assert.match(sw,/APP_VERSION='8\.3\.20'/);assert.match(sw,/PG23_CACHE='pocketguide-v23-atomic-runtime-2-3-3-d'/);assert.match(sw,/PG233_CACHE='pocketguide-v233-application-guide-2-3-3-b'/);assert.match(sw,/isAtomicRuntimeAsset/);
  for(const asset of ['manifest-v233.webmanifest','pocketguide-v233.css','guide-command-router.js','pg233/ui/main-navigation.js','pg233/bootstrap/app.js'])assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(sw,/pocketguide-2\.3\.3/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);const read=path=>readFile(new URL(path,root),'utf8');
test('P1: un seul moteur applicatif est chargé',async()=>{const html=await read('index.html');assert.match(html,/type="module" src="js\/app\.js"/);assert.doesNotMatch(html,/js\/v5\.js/);assert.doesNotMatch(html,/v4b-bootstrap\.js/)});
test('P2: navigation pédestre et moteur de contraintes sont présents',async()=>{const app=await read('js/app.js');assert.match(app,/travelmode=walking/);assert.match(app,/shiftFlexibleBlock/);assert.match(app,/navigator\.geolocation\.watchPosition/);assert.equal((app.match(/watchPosition/g)||[]).length,1)});
test('P2: PWA V5.1 contient une icône maskable et un cache dédié',async()=>{const manifest=JSON.parse(await read('manifest.webmanifest'));assert.ok(manifest.icons.some(x=>String(x.purpose).includes('maskable')));const sw=await read('service-worker.js');assert.match(sw,/santa-teresa-v5-1-refresh/);assert.match(sw,/schedule-engine\.js/)});
test('P2: les navigations HTML sont réseau d’abord pour éviter un ancien écran V5',async()=>{const sw=await read('service-worker.js');assert.match(sw,/event\.request\.mode==='navigate'/);assert.match(sw,/cache:'no-store'/);assert.match(sw,/refreshOpenClients/)});
test('P5: diagnostic terrain est exposé dans l’interface',async()=>{const html=await read('index.html');assert.match(html,/id="runDiagnostics"/);assert.match(html,/id="diagnosticResults"/)});

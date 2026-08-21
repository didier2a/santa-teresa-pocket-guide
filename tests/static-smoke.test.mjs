import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);const read=path=>readFile(new URL(path,root),'utf8');
test('P1: un seul moteur applicatif principal est chargé',async()=>{const html=await read('index.html');assert.match(html,/type="module" src="js\/app\.js"/);assert.doesNotMatch(html,/js\/v5\.js/);assert.doesNotMatch(html,/v4b-bootstrap\.js/)});
test('P2: navigation pédestre et moteur de contraintes sont présents',async()=>{const app=await read('js/app.js');assert.match(app,/travelmode=walking/);assert.match(app,/shiftFlexibleBlock/);assert.match(app,/navigator\.geolocation\.watchPosition/);assert.equal((app.match(/watchPosition/g)||[]).length,1)});
test('V6: AR Explorer est chargé et utilise caméra, GPS ponctuel et orientation',async()=>{const html=await read('index.html'),ar=await read('js/ar-v6.js');assert.match(html,/id="arStage"/);assert.match(html,/js\/ar-v6\.js/);assert.match(ar,/getUserMedia/);assert.match(ar,/getCurrentPosition/);assert.match(ar,/DeviceOrientationEvent/);assert.doesNotMatch(ar,/watchPosition/);assert.match(ar,/travelmode=walking/)});
test('V6: PWA possède un cache AR dédié et force le rafraîchissement',async()=>{const manifest=JSON.parse(await read('manifest.webmanifest')),sw=await read('service-worker.js');assert.match(manifest.name,/V6 AR/);assert.match(sw,/santa-teresa-v6-ar/);assert.match(sw,/ar-v6\.css/);assert.match(sw,/ar-v6\.js/);assert.match(sw,/event\.request\.mode==='navigate'/);assert.match(sw,/cache:'no-store'/)});
test('P5: diagnostic terrain reste exposé',async()=>{const html=await read('index.html');assert.match(html,/id="runDiagnostics"/);assert.match(html,/id="diagnosticResults"/)});

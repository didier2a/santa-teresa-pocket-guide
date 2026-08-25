import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [contract,html,css,sw,entry,enhancer,guidance,simulator,persistence]=await Promise.all([
  read('docs/PG17_RC1_ACCEPTANCE_CONTRACT.md'),read('pocketguide-17.html'),read('pg17-bridge.css'),read('service-worker.js'),read('js/pg17/bootstrap/app-entry.js'),read('js/pg17/bootstrap/app-enhancer.js'),read('js/pg17/guidance/walking-guidance-engine.js'),read('js/pg17/simulation/walking-simulator.js'),read('js/pg16/core/state-persistence.js')
]);

test('V1.7 contract preserves V1.6 and defines G16 through G24',()=>{assert.match(contract,/G0–G15/);for(let gate=16;gate<=24;gate+=1)assert.match(contract,new RegExp(`G${gate}`));});
test('V1.7 shell exposes synchronized visual, speech and simulation controls',()=>{for(const id of ['pg17Guidance','pg17Instruction','pg17Distance','pg17ProgressBar','pg17VoiceToggle','pg17Repeat','pg17Continue','pg17SimStart','pg17SimPause','pg17SimStep'])assert.match(html,new RegExp(`id="${id}"`));assert.match(html,/Gardez les yeux/);assert.match(html,/ne remplacent pas un itinéraire routier détaillé/);});
test('V1.7 entry extends the V1.6 base without changing its public page',()=>{assert.match(entry,/app-rc-entry\.js/);assert.match(entry,/__POCKETGUIDE_DISABLE_SNAP_SIM__/);assert.match(enhancer,/__POCKETGUIDE_17__/);assert.match(html,/app-entry\.js/);});
test('V1.7 has explicit isolated persistence and PWA cache',()=>{assert.match(persistence,/pocketguide-17-state-rc1/);assert.match(persistence,/pocketguide-16-state-rc1/);assert.match(sw,/PG17_CACHE='pocketguide-v17-rc1-audiovisual6'/);assert.match(sw,/pocketguide-17\.html/);assert.match(sw,/walking-guidance-engine\.js/);assert.match(sw,/walking-simulator\.js/);});
test('V1.7 defines accessibility and reduced-motion behavior',()=>{assert.match(css,/min-height:44px/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(html,/aria-live="polite"/);});
test('real and simulated movement share one production guidance method',()=>{assert.match(guidance,/processPosition\(/);assert.match(simulator,/engine\.processPosition\(item\.position/);assert.match(guidance,/actionRegistry\.execute\('route\.next'/);});
test('missing planned media degrades safely and can be enriched from attributed Commons results',()=>{assert.match(enhancer,/findCommonsImages/);assert.match(enhancer,/Santa Teresa Gallura/);assert.match(enhancer,/route\.media\.enriched/);assert.match(enhancer,/imageAttribution/);assert.match(sw,/route-media\.js/);});
test('V1.7 keeps audiovisual identity and final guidance visible after base and voice renders',()=>{assert.match(enhancer,/GUIDE AUDIOVISUEL/);assert.match(enhancer,/lastGuidanceText/);assert.match(enhancer,/Parcours terminé/);});
test('V1.7 revisioned imports bypass an already installed stale service worker',()=>{assert.match(html,/app-entry\.js\?v=1\.7\.0rc4/);assert.match(entry,/app-enhancer\.js\?v=1\.7\.0rc4/);});
test('V1.7 reapplies audiovisual identity and guidance after every legacy render event',()=>{assert.match(enhancer,/eventBus\.on\('\*'.*GUIDE AUDIOVISUEL.*lastGuidanceText/);});

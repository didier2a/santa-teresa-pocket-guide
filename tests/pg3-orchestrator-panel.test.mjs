import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [panel,css,bootstrap,shell,sw]=await Promise.all([read('js/pg3/ui/orchestrator-panel.js'),read('pocketguide-v3.css'),read('js/pg3/bootstrap/app.js'),read('js/pg23/bootstrap/app.js'),read('service-worker.js')]);

test('le panneau V3 rend les dix états Figma et une intention réellement actionnable',()=>{
  for(const state of ['idle','listening','interpreting','checking','acting','verifying','succeeded','degraded','blocked','failed'])assert.match(panel,new RegExp(`${state}:`));
  for(const id of ['pg3IntentRequest','pg3IntentSummary','pg3IntentModify','pg3IntentLaunch'])assert.match(panel,new RegExp(id));
  assert.match(panel,/router\?\.launch/);assert.match(panel,/router\?\.cancel/);assert.match(panel,/AUTO · 3 S/);
});

test('le rendu V3 conserve les cibles tactiles et les composants mobiles validés',()=>{
  assert.match(css,/pg3-orchestrator__state/);assert.match(css,/pg3-intent__actions button\{min-width:0;min-height:52px/);assert.match(css,/width:min\(360px,100%\)/);assert.match(css,/focus-visible/);
});

test('le bootstrap branche voix, texte et toucher sur le même routeur sans modifier LiveAvatar',()=>{
  assert.match(bootstrap,/avatar\.onCommand=.*intentRouter\.handle/);assert.match(bootstrap,/companionOrchestrator21\.ask=async function/);assert.match(bootstrap,/installOrchestratorPanel/);assert.match(bootstrap,/compatibilityRuntime:'2\.3\.3'/);
  assert.doesNotMatch(bootstrap,/liveAvatarRealtimeController|session\.start|RTCPeerConnection|AudioContext/);
});

test('le shell historique garde 2.3.2 par défaut et publie les nouveaux modules hors ligne',()=>{
  assert.match(shell,/SHELL_VERSION=V233_MODE\?'2\.3\.3':'2\.3\.2'/);assert.match(shell,/SHELL_DISPLAY_VERSION=V3_MODE\?'3\.0 Preview':SHELL_VERSION/);
  for(const asset of ['cybernetic-state-machine.js','intent-router.js','orchestrator-panel.js'])assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

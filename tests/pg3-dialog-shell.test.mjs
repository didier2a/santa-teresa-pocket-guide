import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [dialog,css,bootstrap]=await Promise.all([read('js/pg3/ui/dialog-shell.js'),read('pocketguide-v3.css'),read('js/pg3/bootstrap/app.js')]);

test('Dialog Shell implémente les huit variantes Figma',()=>{
  for(const kind of ['confirmation','permission','information','error'])assert.match(dialog,new RegExp(`'${kind}'`));
  for(const state of ['default','busy'])assert.match(dialog,new RegExp(`'${state}'`));
  assert.match(dialog,/aria-busy/);assert.match(dialog,/setBusyButtons/);assert.match(bootstrap,/installDialogShell/);
});

test('Dialog Shell conserve les dimensions et actions tactiles Figma',()=>{
  assert.match(css,/width:min\(360px,calc\(100vw - 30px\)\)/);assert.match(css,/border-radius:var\(--pg3-radius-xl\)/);assert.match(css,/0 28px 90px rgba\(0,0,0,\.42\)/);
  assert.match(css,/font-size:24px/);assert.match(css,/line-height:30px/);assert.match(css,/width:200px;min-height:44px;height:44px/);
});

test('les états métier réels pilotent les dialogues sans dupliquer les moteurs',()=>{
  for(const event of ['pg233.planning.started','proposal.created','proposal.confirmed','proposal.rejected','gps.updated','gps.denied'])assert.match(dialog,new RegExp(event.replace('.','\\.')));
  assert.doesNotMatch(dialog,/fetch\(|RTCPeerConnection|AudioContext|geolocation\.watchPosition/);
});

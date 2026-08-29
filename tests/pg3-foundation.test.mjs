import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [vercelText,manifestText,shell,bootstrap,sw,ignore]=await Promise.all([read('vercel.json'),read('manifest-v3.webmanifest'),read('js/pg23/bootstrap/app.js'),read('js/pg3/bootstrap/app.js'),read('service-worker.js'),read('scripts/vercel-ignore-build.sh')]);

test('PocketGuide V3 possède une prévisualisation isolée et installable',()=>{
  const vercel=JSON.parse(vercelText),manifest=JSON.parse(manifestText);
  assert.ok(vercel.rewrites.some(rule=>rule.source==='/pocketguide-3-preview'&&/v3=1&v233=1&liveavatar=1/.test(rule.destination)));
  assert.equal(manifest.id,'./pocketguide-3-preview');assert.match(manifest.start_url,/pocketguide-3-preview/);assert.match(manifest.name,/V3/);
});

test('la V3 se superpose au runtime 2.3.3 sans remplacer avatar ni audio',()=>{
  assert.match(shell,/const V3_MODE=/);assert.match(shell,/V3_MODE\|\|initialParams\.get\('v233'\)/);assert.match(shell,/installPocketGuide233/);assert.match(shell,/installPocketGuide3/);
  assert.match(bootstrap,/compatibilityRuntime:'2\.3\.3'/);assert.match(bootstrap,/designSource:'Figma'/);
  assert.doesNotMatch(bootstrap,/liveAvatarRealtimeController|unifiedVoiceService/);
});

test('les ressources V3 sont publiées et disponibles hors ligne',()=>{
  for(const asset of ['manifest-v3.webmanifest','pocketguide-v3.css','js/pg3/ui/dialog-shell.js','js/pg3/bootstrap/app.js'])assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(sw,/PG3_CACHE/);assert.match(sw,/pocketguide-3-preview/);assert.match(ignore,/js\/pg3\//);assert.match(ignore,/pocketguide-v3\.css/);
});

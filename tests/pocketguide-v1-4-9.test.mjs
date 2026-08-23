import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);const read=p=>readFile(new URL(p,root),'utf8');

test('V1.4.9: PWA autorise portrait et paysage',async()=>{
  const manifest=JSON.parse(await read('manifest.webmanifest'));
  const orientation=await read('js/orientation-v149.js');
  const css=await read('ar-v149.css');
  assert.equal(manifest.orientation,'any');
  assert.match(orientation,/screen\.orientation\?\.lock|screen\.orientation\.lock/);
  assert.match(orientation,/landscape/);assert.match(orientation,/portrait/);assert.match(orientation,/arOrientation/);
  assert.match(css,/@media\(orientation:landscape\)/);assert.match(css,/ar-force-landscape/);
});

test('V1.4.9: compagnon audio utilise OpenAI TTS naturel et GPS',async()=>{
  const client=await read('js/audio-companion-v149.js'),api=await read('api/tts.js');
  assert.match(client,/\/api\/tts/);assert.match(client,/tripstatechange/);assert.match(client,/AUTO_RADIUS_KM/);assert.match(client,/Compagnon audio/);
  assert.match(client,/voice:'coral'/);assert.match(api,/gpt-4o-mini-tts/);assert.match(api,/v1\/audio\/speech/);assert.match(api,/instructions/);
});

test('V1.4.9: ancien audioguide automatique robotique est neutralisé',async()=>{
  const client=await read('js/audio-companion-v149.js');
  assert.match(client,/legacyToggle/);assert.match(client,/Auto ON/);assert.match(client,/stopImmediatePropagation/);assert.match(client,/#arSpeak/);
});

test('V1.4.9: GeoAR charge les modules paysage et compagnon',async()=>{
  const core=await read('js/ar-core.js'),sw=await read('service-worker.js');
  assert.match(core,/orientation-v149\.js/);assert.match(core,/audio-companion-v149\.js/);assert.match(core,/ar-v149\.css/);assert.match(core,/V1\.4\.9/);
  assert.match(sw,/pocketguide-engine-v1-4-9a/);assert.match(sw,/orientation-v149\.js/);assert.match(sw,/audio-companion-v149\.js/);assert.match(sw,/ar-v149\.css/);
});

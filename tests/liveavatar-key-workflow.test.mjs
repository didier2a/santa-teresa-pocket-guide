import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('la clé LiveAvatar reste exclusivement côté serveur',async()=>{
  const [endpoint,health,ignore,example]=await Promise.all([
    read('api/liveavatar-session.js'),read('api/health.js'),read('.gitignore'),read('.env.example')
  ]);
  assert.match(endpoint,/process\.env\.HEYGEN_API_KEY/);
  assert.match(endpoint,/X-API-KEY/);
  assert.match(endpoint,/mode:'LITE'/);
  assert.doesNotMatch(endpoint,/HEYGEN_API_KEY\s*=\s*['"][^'"]+/);
  assert.match(health,/liveAvatarConfigured:Boolean\(process\.env\.LIVEAVATAR_API_KEY\|\|process\.env\.HEYGEN_API_KEY\)/);
  assert.match(ignore,/\.env\.\*/);
  assert.match(example,/HEYGEN_API_KEY=\s*$/m);
});

test('Vercel publie le créateur de jeton LiveAvatar avec une durée bornée',async()=>{
  const config=JSON.parse(await read('vercel.json'));
  assert.ok(config.functions?.['api/liveavatar-session.js']);
  assert.ok(Number(config.functions['api/liveavatar-session.js'].maxDuration)>0);
  assert.ok(config.functions?.['api/liveavatar-status.js']);
  assert.ok(Number(config.functions['api/liveavatar-status.js'].maxDuration)>0);
});

test('le diagnostic LiveAvatar agrège les états sans exposer les identifiants',async()=>{
  const source=await read('api/liveavatar-status.js');
  assert.match(source,/\/v1\/avatars\?page=1&page_size=100/);
  assert.match(source,/authenticated:true/);
  assert.match(source,/customAvatarCount/);
  assert.match(source,/statusCounts/);
  assert.match(source,/pocketGuide/);
  assert.doesNotMatch(source,/preview_url\s*:/);
  assert.doesNotMatch(source,/\bid\s*:/);
});

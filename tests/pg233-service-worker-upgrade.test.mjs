import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
const origin='https://santa-teresa-pocket-guide.vercel.app';

function workerFixture({online=false}={}){
  const listeners={},opened=[],puts=[],deleted=[];
  const context={
    URL,Request,Response,Headers,setTimeout,clearTimeout,console,location:{origin},
    fetch:async request=>{if(!online)throw new Error('offline');return new Response('FRESH-NETWORK',{status:200,headers:{'Content-Type':'text/javascript'}});},
    caches:{
      async open(name){opened.push(name);return{
        async match(request){const url=String(request?.url||request);if(name==='pocketguide-v23-atomic-runtime-2-3-3-d'&&url.includes('/js/pg16/planner/planner-client.js'))return new Response('FRESH-ATOMIC-CACHE');if(name==='pocketguide-v16-rc1-planner-hotfix1')return new Response('STALE-LEGACY-CACHE');return undefined;},
        async put(key,response){puts.push({name,key:String(key?.url||key),body:await response.text()});},async keys(){return[];},async delete(){return true;}
      };},
      async keys(){return['pocketguide-v23-liveavatar-realtime-2-3-2-c','pocketguide-v233-application-guide-2-3-3-a','pocketguide-v16-rc1-planner-hotfix1','pocketguide-v23-atomic-runtime-2-3-3-d'];},
      async delete(name){deleted.push(name);return true;}
    },
    self:{addEventListener(type,handler){listeners[type]=handler;},skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[]}}
  };
  vm.createContext(context);vm.runInContext(source,context,{filename:'service-worker.js'});return{context,listeners,opened,puts,deleted};
}

async function requestAsset(fixture,path){let pending;fixture.listeners.fetch({request:new Request(`${origin}${path}`),respondWith(value){pending=value;}});assert.ok(pending,'le service worker doit prendre la requête en charge');return pending;}

test('les moteurs hérités 2.3.3 utilisent tous le cache atomique courant',()=>{
  const fixture=workerFixture(),policy=vm.runInContext(`({version:APP_VERSION,runtime:PG23_CACHE,planner:cacheNameFor(new URL('${origin}/js/pg16/planner/planner-client.js')),gps:cacheNameFor(new URL('${origin}/js/pg16/perception/perception-engine.js')),journeys:cacheNameFor(new URL('${origin}/js/pg18/itineraries/itinerary-manager.js')),shell:cacheNameFor(new URL('${origin}/js/pg233/bootstrap/app.js'))})`,fixture.context);
  assert.deepEqual({...policy},{version:'8.3.20',runtime:'pocketguide-v23-atomic-runtime-2-3-3-d',planner:'pocketguide-v23-atomic-runtime-2-3-3-d',gps:'pocketguide-v23-atomic-runtime-2-3-3-d',journeys:'pocketguide-v23-atomic-runtime-2-3-3-d',shell:'pocketguide-v233-application-guide-2-3-3-b'});
});

test('hors ligne, un ancien cache PG16 ne peut plus reprendre le Planner',async()=>{
  const fixture=workerFixture({online:false}),response=await requestAsset(fixture,'/js/pg16/planner/planner-client.js?v=old');
  assert.equal(await response.text(),'FRESH-ATOMIC-CACHE');assert.ok(fixture.opened.includes('pocketguide-v23-atomic-runtime-2-3-3-d'));assert.equal(fixture.opened.includes('pocketguide-v16-rc1-planner-hotfix1'),false);
});

test('en ligne, le runtime critique est revalidé puis actualise le cache atomique',async()=>{
  const fixture=workerFixture({online:true}),response=await requestAsset(fixture,'/js/pg16/planner/planner-client.js?v=old');
  assert.equal(await response.text(),'FRESH-NETWORK');assert.equal(fixture.puts.length,1);assert.match(fixture.puts[0].key,/\/js\/pg16\/planner\/planner-client\.js$/);assert.equal(fixture.puts[0].body,'FRESH-NETWORK');
});

test('l’activation supprime les anciennes générations 2.3.2 et 2.3.3',async()=>{
  const fixture=workerFixture();let pending;fixture.listeners.activate({waitUntil(value){pending=value;}});await pending;
  assert.ok(fixture.deleted.includes('pocketguide-v23-liveavatar-realtime-2-3-2-c'));assert.ok(fixture.deleted.includes('pocketguide-v233-application-guide-2-3-3-a'));assert.equal(fixture.deleted.includes('pocketguide-v23-atomic-runtime-2-3-3-d'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildClientDiagnostic,reportClientDiagnostic} from '../js/pg233/core/client-diagnostics.js';
import {normalizeClientDiagnostic} from '../api/client-diagnostic.js';

test('le diagnostic client exclut texte, coordonnées, audio, photo et identifiant',()=>{
  const payload=buildClientDiagnostic('gps.error',{status:'ERROR libre',code:'timeout',intent:'start_guidance',lat:41.24,lng:9.18,transcript:'secret',audio:'bytes',photo:'url'},{onLine:true,serviceWorker:{controller:{}}});
  assert.deepEqual(Object.keys(payload).sort(),['code','event','intent','online','serviceWorker','status','version'].sort());assert.equal(JSON.stringify(payload).includes('41.24'),false);assert.equal(JSON.stringify(payload).includes('secret'),false);assert.equal(payload.serviceWorker,'controlled');
});

test('le serveur refuse les événements libres et normalise seulement la liste autorisée',()=>{
  assert.equal(normalizeClientDiagnostic({event:'texte.utilisateur',lat:41.24}),null);const payload=normalizeClientDiagnostic({event:'command.failed',status:'ERROR',intent:'edit_itinerary',transcript:'ne pas journaliser'});assert.equal(payload.event,'command.failed');assert.equal('transcript'in payload,false);assert.equal('lat'in payload,false);
});

test('la production Vercel envoie un diagnostic borné en text/plain',async()=>{
  let call=null;const ok=await reportClientDiagnostic('presentation.failed',{status:'error',code:'render-error'},{locationLike:{hostname:'preview-test.vercel.app'},navigatorLike:{onLine:true,serviceWorker:{controller:{}}},fetchImpl:async(url,options)=>{call={url,options};return new Response(null,{status:204});}});
  assert.equal(ok,true);assert.equal(call.url,'/api/client-diagnostic');assert.match(call.options.headers['Content-Type'],/^text\/plain/);const body=JSON.parse(call.options.body);assert.equal(body.event,'presentation.failed');assert.equal(JSON.stringify(body).includes('undefined'),false);
});

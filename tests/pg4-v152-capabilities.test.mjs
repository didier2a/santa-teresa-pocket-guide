import test from 'node:test';
import assert from 'node:assert/strict';
import {V152CompanionCapabilities} from '../js/pg4/v152-companion-capabilities.js';

function button(){return{clicks:0,click(){this.clicks++}};}
function fixture(){
  let now=1000;
  const nodes={
    '#gpsBtn':button(),'#routeReset':button(),'#planBtn':button(),'#universalDiagnosticLink':button(),
    '#planPrompt':{value:'',dispatchEvent(){}},'#planStatus':{textContent:''}
  };
  const documentImpl={querySelector:selector=>nodes[selector]||null};
  const calls=[],views=[];
  const app={
    state:{gpsWatch:null,demo:false,followMap:true,ar:false},
    pack:{id:'route-test',title:'Route test',places:[{id:'plage',name:'Plage de Rena Bianca'}]},
    showPanel:view=>views.push(view),openPack:pack=>calls.push(['openPack',pack]),toggleAR:()=>{app.state.ar=!app.state.ar;calls.push(['toggleAR'])},
    toolCall:(name,args)=>{calls.push([name,args]);return name==='shorten_route'?{removed:['Musée secondaire']}:{ok:true}}
  };
  const windowImpl={Event:class{},__POCKETGUIDE_OFFLINE__:{downloadCurrentRoute:async()=>({assets:4}),openOfflinePack:()=>calls.push(['offline'])},__POCKETGUIDE_PLATFORM__:{resetMedia:async()=>true}};
  const storage={value:'[]',getItem(){return this.value},setItem(_key,value){this.value=value},removeItem(){this.value='[]'}};
  return{capabilities:new V152CompanionCapabilities({app,documentImpl,windowImpl,storage,now:()=>now}),app,nodes,calls,views,setNow:value=>{now=value}};
}

test('les commandes ouvrent les quatre vues natives',()=>{
  const f=fixture();
  assert.equal(f.capabilities.route('Ouvre la carte').intent,'navigation.open');
  assert.equal(f.capabilities.route('Affiche le parcours').intent,'navigation.open');
  assert.equal(f.capabilities.route('Va sur créer').intent,'navigation.open');
  assert.equal(f.capabilities.route('Retourne au guide').intent,'navigation.open');
  assert.deepEqual(f.views,['map','route','create','guide']);
});

test('activer le GPS ne le coupe pas lorsqu’il est déjà actif',()=>{
  const f=fixture();
  f.capabilities.route('Active le GPS');assert.equal(f.nodes['#gpsBtn'].clicks,1);
  f.app.state.gpsWatch=7;f.capabilities.route('Active le GPS');assert.equal(f.nodes['#gpsBtn'].clicks,1);
  f.capabilities.route('Arrête le GPS');assert.equal(f.nodes['#gpsBtn'].clicks,2);
});

test('la Geo-AR peut être ouverte puis fermée explicitement',()=>{
  const f=fixture();
  assert.equal(f.capabilities.route('Ouvre la réalité augmentée').intent,'terrain.ar.open');
  f.app.state.ar=true;assert.equal(f.capabilities.route('Ferme la réalité augmentée').intent,'terrain.ar.close');
  assert.equal(f.calls.some(call=>call[0]==='open_ar'),true);assert.equal(f.calls.some(call=>call[0]==='toggleAR'),true);
});

test('le Planner exige une confirmation vocale distincte',async()=>{
  const f=fixture(),prepared=f.capabilities.route('Crée un itinéraire historique à Bonifacio en deux heures');
  assert.equal(prepared.intent,'planner.prepare');assert.equal(f.views.at(-1),'create');assert.match(f.nodes['#planPrompt'].value,/Bonifacio/);assert.equal(f.nodes['#planBtn'].clicks,0);
  const gps=f.capabilities.route('Lance le GPS');assert.equal(gps.intent,'terrain.gps.start');assert.equal(f.nodes['#planBtn'].clicks,0);
  const confirmed=f.capabilities.route('Confirme la création');assert.equal(confirmed.intent,'planner.confirm');assert.equal(f.nodes['#planBtn'].clicks,1);
  const evidence=await confirmed.completion;assert.equal(evidence.result.started,true);
});

test('les identifiants de preuve restent uniques dans la même milliseconde',()=>{
  const f=fixture(),first=f.capabilities.route('Ouvre la carte'),second=f.capabilities.route('Affiche le parcours');
  assert.notEqual(first.id,second.id);
});

test('la bibliothèque native sauvegarde puis rouvre un RoutePack',async()=>{
  const f=fixture(),saved=f.capabilities.route('Sauvegarde cet itinéraire');
  assert.equal(saved.intent,'library.save');assert.equal((await saved.completion).result.id,'route-test');
  const opened=f.capabilities.route('Ouvre mon itinéraire sauvegardé');
  assert.equal(opened.intent,'library.open');assert.equal(f.calls.some(call=>call[0]==='openPack'&&call[1].id==='route-test'),true);
});

test('les commandes terrain produisent une preuve sans narration injectée',async()=>{
  const f=fixture();
  const shortened=f.capabilities.route('Raccourcis le parcours');assert.equal(shortened.intent,'route.shorten');assert.match((await shortened.completion).speech,/Musée secondaire/);
  const offline=f.capabilities.route('Télécharge le parcours hors ligne');assert.equal(offline.intent,'offline.download');assert.equal((await offline.completion).result.assets,4);
  const sensors=f.capabilities.route('Réinitialise la caméra et le micro');assert.equal(sensors.intent,'sensors.reset');assert.equal((await sensors.completion).result,true);
});

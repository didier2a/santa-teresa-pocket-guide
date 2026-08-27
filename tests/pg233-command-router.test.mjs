import test from 'node:test';
import assert from 'node:assert/strict';
import {GuideCommandRouter,buildRouteRevisionPrompt,classifyPocketGuideCommand} from '../js/pg233/core/guide-command-router.js';

const pack={id:'santa-test',title:'Santa Test',timezone:'Europe/Rome',places:[{id:'rena',name:'Rena Bianca',lat:41.24,lng:9.18,description:'La plage du centre.',heroImage:'rena.jpg'}],days:[{date:'2026-09-17',events:[{id:'e1',title:'La plage',placeId:'rena',time:'10:00',end:'11:00'}]}]};

function fixture({gps='unknown',items=[]}={}){
  const events=[],calls=[];
  const values={'route.pack':pack,'route.currentEventId':'e1','route.nextEventId':null,'route.remainingMinutes':60,'perception.gps':gps,'session.simulation':false,'location':{lat:null,lng:null}};
  const state={select:path=>values[path]};
  const bus={emit(type,payload){events.push({type,payload});}};
  const actions={async execute(name,args,context){calls.push({name,args,context});return{ok:true,name,result:{view:name}};}};
  const proposals={pending:()=>null};
  const planner={async proposeReplacement(request){calls.push({name:'planner',request});return{proposal:{id:'proposal-1'},plan:{pack:{...pack,id:'santa-revision',title:'Santa révisé'}}};}};
  const guide={async confirmPending(confirmed){return{text:confirmed?'C’est confirmé.':'D’accord, je ne change rien.'};},async handleText(){return{text:'Je propose ce changement.',proposal:{id:'proposal-2'}};}};
  const guidance={lastSnapshot:null,repeatLastCue:()=>false,async processPosition(){return{instruction:'Continuez tout droit.'};},async continueAfterArrival(){return{ok:true};}};
  const itineraries={async saveCurrent(){return{id:'santa-test',label:'Santa Test'};},async list(){return items;},async load(id){calls.push({name:'load',id});return{id};}};
  const concierge={active:false,awaiting:null,consume(){return{handled:true,ready:false,reply:'Où souhaitez-vous aller ?'};}};
  const scenes={create(scene){calls.push({name:'scene',scene});return scene;}};
  return{router:new GuideCommandRouter({state,bus,actions,proposals,planner,guide,guidance,itineraries,concierge,scenes}),events,calls,values,proposals,concierge};
}

test('la guide reconnaît les quatre priorités fonctionnelles 2.3.3',()=>{
  assert.equal(classifyPocketGuideCommand('Crée-moi un itinéraire de deux heures à Bonifacio').type,'create_itinerary');
  assert.equal(classifyPocketGuideCommand('Je veux modifier mon itinéraire').type,'edit_itinerary');
  assert.equal(classifyPocketGuideCommand('Guide-moi par GPS étape par étape').type,'start_guidance');
  assert.equal(classifyPocketGuideCommand('Montre-moi la carte, les photos et les fiches du parcours').type,'show_route_content');
  assert.equal(classifyPocketGuideCommand('Ouvre mes voyages sauvegardés').type,'open_saved_journeys');
});

test('une confirmation en attente reste prioritaire sur toute interprétation libre',()=>{
  assert.equal(classifyPocketGuideCommand('Oui',{pendingProposal:true}).type,'confirm_proposal');
  assert.equal(classifyPocketGuideCommand('Non, ne change rien',{pendingProposal:true}).type,'reject_proposal');
});

test('le démarrage du guidage ouvre la carte et demande une permission GPS explicite',async()=>{
  const {router,calls,events}=fixture();const routed=router.handle('Guide-moi par GPS étape par étape',{source:'test'}),result=await routed.completion;
  assert.equal(routed.handled,true);assert.equal(result.intent,'start_guidance');assert.equal(calls[0].name,'ui.open_map');assert.ok(events.some(event=>event.type==='ui.location.requested'));assert.match(result.speech,/Autoriser ma position/);
});

test('les voyages sauvegardés sont listés depuis le stockage réel puis affichés',async()=>{
  const {router,calls}=fixture({items:[{id:'a',label:'Bonifacio'},{id:'b',label:'Santa Teresa'}]});const result=await router.handle('Montre mes voyages sauvegardés').completion;
  assert.equal(result.count,2);assert.match(result.speech,/Bonifacio/);assert.ok(calls.some(call=>call.name==='ui.open_memories'));
});

test('une modification détaillée produit une proposition RoutePack sans toucher immédiatement au parcours',async()=>{
  const {router,calls}=fixture();const result=await router.handle('Modifie mon itinéraire et ajoute Rena Bianca après la tour').completion,planning=calls.find(call=>call.name==='planner');
  assert.equal(result.proposalId,'proposal-1');assert.ok(planning);assert.match(planning.request.prompt,/Conserve toutes les étapes/);assert.match(planning.request.prompt,/Rena Bianca/);assert.match(planning.request.prompt,/PARCOURS ACTUEL À RÉVISER/);
  assert.doesNotMatch(buildRouteRevisionPrompt('Ajoute une plage',pack),/historyLong/);
});

test('une demande de fiche crée une scène fiable avec le média du RoutePack',async()=>{
  const {router,calls}=fixture();const result=await router.handle('Affiche la fiche de Rena Bianca').completion,created=calls.find(call=>call.name==='scene');
  assert.equal(result.placeId,'rena');assert.equal(created.scene.title,'Rena Bianca');assert.equal(created.scene.image,'rena.jpg');assert.equal(created.scene.persist,true);
});

test('carte et fiches restent dans le même espace et attendent la présentation',async()=>{
  const {router,calls}=fixture();const result=await router.handle('Montre-moi la carte, les photos et les fiches du parcours').completion,actions=calls.filter(call=>call.name?.startsWith('ui.')||call.name==='pg23.present_route');
  assert.deepEqual(actions.map(call=>call.name),['ui.open_map','pg23.present_route']);assert.equal(actions[0].context.source,'pg233-route-content');assert.equal(actions[1].context.source,'pg233-route-content');assert.match(result.speech,/réunies dans l’espace Voyage/);
});

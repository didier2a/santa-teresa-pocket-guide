import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {legacyTripToRoutePack,validateRoutePack,loadRoutePack,reconcileRoutePackPlaceReferences} from '../engine/routepack.js';

const legacy=JSON.parse(await readFile(new URL('../data/trip.json',import.meta.url),'utf8'));

test('Engine V1: le trip Santa Teresa legacy se convertit en RoutePack valide',()=>{
  const pack=legacyTripToRoutePack(legacy);
  const report=validateRoutePack(pack);
  assert.equal(pack.schemaVersion,'1.0');
  assert.equal(pack.timezone,'Europe/Rome');
  assert.ok(pack.days.length>=2);
  assert.ok(pack.places.length>=5);
  assert.equal(report.valid,true,JSON.stringify(report.errors));
});

test('Engine V1: les identifiants d’étape sont déterministes',()=>{
  const pack=legacyTripToRoutePack(legacy);
  assert.equal(pack.days[0].events[0].id,'d1-e1');
  assert.equal(pack.days[1].events[0].id,'d2-e1');
});

test('Engine V1: une coordonnée invalide est bloquante',()=>{
  const pack=legacyTripToRoutePack(legacy);
  pack.places[0].lat=123;
  const report=validateRoutePack(pack);
  assert.equal(report.valid,false);
  assert.ok(report.errors.some(e=>e.code==='PLACE_LAT'));
});

test('Engine V1: un placeId inconnu est bloquant',()=>{
  const pack=legacyTripToRoutePack(legacy);
  pack.days[0].events[0].placeId='inconnu';
  const report=validateRoutePack(pack);
  assert.equal(report.valid,false);
  assert.ok(report.errors.some(e=>e.code==='PLACE_REF'));
});

test('Engine V1: une référence Planner proche est réconciliée avec un lieu unique',()=>{
  const pack=legacyTripToRoutePack(legacy),event=pack.days[0].events[0],place=pack.places.find(item=>item.id===event.placeId);
  event.placeId=`pause-${place.id}`;event.place=place.name;event.title=`Pause à ${place.name}`;
  const result=reconcileRoutePackPlaceReferences(pack),report=validateRoutePack(pack);
  assert.equal(event.placeId,place.id);assert.equal(result.repairs.length,1);assert.equal(result.unresolved.length,0);assert.equal(report.valid,true,JSON.stringify(report.errors));
});

test('Engine V1: une pause sans lieu explicite reste sur l’étape précédente',()=>{
  const pack=legacyTripToRoutePack(legacy),events=pack.days[0].events,previous=events[0].placeId;
  events.splice(1,0,{id:'pause-test',time:events[0].end,end:'12:20',title:'Pause détente',type:'pause',place:'Sur place',placeId:'pause-inconnue',navigationMode:'walking'});
  events[2].time='12:20';
  const result=reconcileRoutePackPlaceReferences(pack);
  assert.equal(events[1].placeId,previous);assert.equal(result.repairs[0].reason,'stationary-previous');
});

test('Engine V1: une référence réellement ambiguë reste bloquée',()=>{
  const pack=legacyTripToRoutePack(legacy),event=pack.days[0].events[0];
  event.placeId='lieu-inconnu';event.place='';event.title='Étape mystère';
  const result=reconcileRoutePackPlaceReferences(pack),report=validateRoutePack(pack);
  assert.equal(result.unresolved.length,1);assert.ok(report.errors.some(item=>item.code==='PLACE_REF'));
});

test('Engine V1: un chevauchement horaire est bloquant',()=>{
  const pack=legacyTripToRoutePack(legacy);
  pack.days[0].events[1].time='11:45';
  const report=validateRoutePack(pack);
  assert.equal(report.valid,false);
  assert.ok(report.errors.some(e=>e.code==='EVENT_OVERLAP'));
});

test('Engine V1: le chargeur accepte directement un objet RoutePack',async()=>{
  const pack=legacyTripToRoutePack(legacy);
  const loaded=await loadRoutePack(pack);
  assert.equal(loaded.pack.id,pack.id);
  assert.equal(loaded.report.valid,true);
});

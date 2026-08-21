import test from 'node:test';
import assert from 'node:assert/strict';
import {shiftFlexibleBlock,editEventSafely,validateDay,recoverMinutes,isLockedEvent} from '../js/schedule-engine.js';

const day1=()=>({date:'2026-09-17',events:[
  {time:'13:00',end:'14:30',title:'Déjeuner',type:'repas'},
  {time:'14:30',end:'15:05',title:'Marche vers Piazza Bruno Modesto',type:'marche'},
  {time:'15:10',end:'15:40',title:'Navette vers Capo Testa',type:'bus',locked:true,lockedTime:'15:10',lockedEnd:'15:40'},
  {time:'15:40',end:'19:00',title:'Capo Testa',type:'balade'},
  {time:'19:00',end:'19:35',title:'Navette retour',type:'bus',locked:true,lockedTime:'19:00',lockedEnd:'19:35'}
]});
const day2=()=>({date:'2026-09-18',events:[
  {time:'08:30',end:'09:45',title:'Torre',type:'balade'},
  {time:'09:45',end:'10:45',title:'Rena Bianca',type:'plage'},
  {time:'10:45',end:'11:30',title:'Centre',type:'pause'},
  {time:'11:30',end:'12:00',title:'Retour hôtel & bagages',type:'transfert',locked:true,lockedTime:'11:30',lockedEnd:'12:00'}
]});

test('P0: +30 min avant la navette est automatiquement plafonné à +5',()=>{
  const result=shiftFlexibleBlock(day1(),1,30);
  assert.equal(result.ok,true);
  assert.equal(result.appliedDelta,5);
  assert.equal(result.capped,true);
  assert.equal(result.day.events[1].time,'14:35');
  assert.equal(result.day.events[1].end,'15:10');
  assert.equal(result.day.events[2].time,'15:10');
  assert.equal(validateDay(result.day).ok,true);
});

test('P0: une navette verrouillée ne peut pas être éditée',()=>{
  const result=editEventSafely(day1(),2,'15:40','16:10');
  assert.equal(result.ok,false);
  assert.match(result.message,/contrainte fixe|verrou/i);
});

test('P0: le hard stop de 11:30 empêche un dépassement du jour 2',()=>{
  const result=shiftFlexibleBlock(day2(),0,45);
  assert.equal(result.ok,false);
  assert.equal(result.appliedDelta,0);
  assert.equal(day2().events.at(-1).time,'11:30');
});

test('P0: une édition manuelle créant un chevauchement est refusée',()=>{
  const result=editEventSafely(day1(),1,'14:50','15:25',{shiftFollowing:false});
  assert.equal(result.ok,false);
  assert.match(result.message,/chevauche/i);
});

test('P0: recover réduit une étape flexible sans déplacer le transport fixe',()=>{
  const day=day1();
  const result=recoverMinutes(day,3,30,15);
  assert.equal(result.ok,true);
  assert.equal(result.day.events[3].end,'18:30');
  assert.equal(result.day.events[4].time,'19:00');
  assert.equal(validateDay(result.day).ok,true);
});

test('P0: bus est détecté comme verrouillé même sans flag',()=>{
  assert.equal(isLockedEvent({type:'bus',title:'Navette'}),true);
});

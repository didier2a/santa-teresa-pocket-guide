import test from 'node:test';
import assert from 'node:assert/strict';
import {EventBus} from '../js/pg16/core/event-bus.js';
import {CyberneticStateMachine} from '../js/pg3/core/cybernetic-state-machine.js';

const logger={info(){},error(){}};

test('la machine V3 impose la boucle écoute → preuve → succès',()=>{
  const bus=new EventBus(),states=[];bus.on('pg3.state.changed',state=>states.push(state.value));
  const machine=new CyberneticStateMachine({bus,logger,clock:()=>`T${states.length}`});
  machine.transition('listening',{commandId:'c1',intent:'show_map'});
  machine.transition('interpreting');machine.transition('checking');machine.transition('acting');machine.transition('verifying');
  const terminal=machine.transition('succeeded',{evidence:{intent:'show_map',execution:true},reason:'proof-observed'});
  assert.deepEqual(states,['listening','interpreting','checking','acting','verifying','succeeded']);
  assert.equal(terminal.phase,'terminal');assert.equal(terminal.commandId,'c1');assert.equal(terminal.evidence.execution,true);
});

test('un succès ne peut jamais être déclaré directement depuis idle',()=>{
  const machine=new CyberneticStateMachine({bus:new EventBus(),logger});
  assert.throws(()=>machine.transition('succeeded'),/Transition cybernétique interdite/);
});

test('l’historique est borné et le retour idle efface la commande active',()=>{
  const machine=new CyberneticStateMachine({bus:new EventBus(),logger,maxHistory:8});
  for(let index=0;index<6;index++){machine.transition('listening',{commandId:`c${index}`});machine.transition('idle');}
  assert.equal(machine.history().length,8);assert.equal(machine.snapshot.value,'idle');assert.equal(machine.snapshot.commandId,null);
});

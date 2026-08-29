import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveAvatarRealtimeController} from '../js/pg23/avatar/liveavatar-realtime-controller.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sdk={
  SessionEvent:{SESSION_STREAM_READY:'stream-ready',SESSION_DISCONNECTED:'disconnected'},
  AgentEventsEnum:{USER_SPEAK_STARTED:'user-start',USER_SPEAK_ENDED:'user-end',USER_TRANSCRIPTION:'user-text',AVATAR_TRANSCRIPTION:'avatar-text',AVATAR_SPEAK_STARTED:'avatar-start',AVATAR_SPEAK_ENDED:'avatar-end'}
};

function fakeSession(){
  const handlers=new Map(),events=[];
  return{
    handlers,events,
    voiceChat:{state:'ACTIVE',isMuted:false,async start(){events.push('chat-start')},async unmute(){events.push('chat-unmute');this.isMuted=false},async mute(){events.push('chat-mute');this.isMuted=true}},
    on(name,handler){handlers.set(name,handler)},emit(name,payload){handlers.get(name)?.(payload)},
    interrupt(){events.push('interrupt')},message(text){events.push(['message',text])},startListening(){events.push('start-listening')},stopListening(){events.push('stop-listening')},attach(){},async stop(){}
  };
}

test('la narration applicative attend la fin de l’interruption LiveAvatar',async()=>{
  const bus={emit(){}},session=fakeSession(),controller=new LiveAvatarRealtimeController({bus,fetchImpl:async()=>{},documentImpl:{}});
  controller.session=session;controller.connected=true;controller.active=true;controller.microphoneRequested=true;controller.interruptSettleMs=30;controller.narrationTimeoutMs=500;controller.nodes={};controller.onCommand=()=>({handled:true,id:'cmd-1',intent:'nav.open',completion:Promise.resolve({speech:'La carte est ouverte.'})});
  controller.wireSession(session,sdk,null);session.emit('user-text',{text:'Ouvre la carte'});await Promise.resolve();
  assert.equal(session.events.filter(item=>Array.isArray(item)&&item[0]==='message').length,0,'aucun message ne doit être mis dans la file qui va être effacée');
  session.emit('avatar-end');await wait(10);
  const message=session.events.find(item=>Array.isArray(item)&&item[0]==='message');assert.ok(message);assert.match(message[1],/La carte est ouverte/);assert.ok(session.events.indexOf('interrupt')<session.events.indexOf(message));
  controller.clearNarrationWatchdog();
});

test('la sortie LiveAvatar est amplifiée sans dépasser le volume média natif',()=>{
  const previous=globalThis.AudioContext,links=[];
  class FakeAudioContext{
    constructor(){this.state='running';this.destination={id:'destination'}}
    createGain(){return{gain:{value:1},connect:node=>links.push(['gain',node])}}
    createDynamicsCompressor(){return{threshold:{},knee:{},ratio:{},attack:{},release:{},connect:node=>links.push(['compressor',node])}}
    createMediaElementSource(){return{connect:node=>links.push(['source',node])}}
  }
  globalThis.AudioContext=FakeAudioContext;
  try{
    const controller=new LiveAvatarRealtimeController({bus:{emit(){}},fetchImpl:async()=>{},documentImpl:{}});controller.video={volume:1};assert.equal(controller.unlockAudioOutput(),true);assert.equal(controller.audioGainNode.gain.value,1.8);assert.equal(controller.diagnostic().audioBoost,1.8);assert.equal(links.length,3);
  }finally{if(previous===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=previous;}
});

test('Parler à ma guide réactive le micro sans le couper',async()=>{
  const session=fakeSession(),controller=new LiveAvatarRealtimeController({bus:{emit(){}},fetchImpl:async()=>{},documentImpl:{}});controller.session=session;controller.connected=true;
  const listening=await controller.startListening();assert.equal(listening,true);assert.equal(controller.microphoneRequested,true);assert.ok(session.events.includes('start-listening'));assert.ok(!session.events.includes('chat-mute'));
});

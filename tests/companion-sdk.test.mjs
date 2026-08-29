import test from 'node:test';
import assert from 'node:assert/strict';
import {EventBus} from '../js/pg16/core/event-bus.js';
import {LiveAvatarV3Provider} from '../js/companion-sdk/providers/liveavatar-v3-provider.js';
import {createCompanionWebSdk} from '../js/companion-sdk/companion-web-sdk.js';

const sdkEvents={
  SessionEvent:{SESSION_STREAM_READY:'stream-ready',SESSION_DISCONNECTED:'disconnected'},
  AgentEventsEnum:{
    USER_SPEAK_STARTED:'user-start',USER_SPEAK_ENDED:'user-end',USER_TRANSCRIPTION:'user-text',
    AVATAR_TRANSCRIPTION:'avatar-text',AVATAR_SPEAK_STARTED:'avatar-start',AVATAR_SPEAK_ENDED:'avatar-end'
  }
};

function element(tag='div'){
  return{
    tag,hidden:false,dataset:{},className:'',children:[],attributes:new Map(),classList:{add(){}},
    setAttribute(name,value){this.attributes.set(name,value)},removeAttribute(name){this.attributes.delete(name)},
    append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=[...nodes]},
    addEventListener(){},removeEventListener(){},closest(){return null},
    async play(){this.played=true}
  };
}

function documentMock(){return{createElement:tag=>element(tag)};}

class FakeSession{
  static instances=[];
  constructor(token){
    this.token=token;this.handlers=new Map();this.events=[];
    this.voiceChat={state:'ACTIVE',isMuted:false,start:async()=>this.events.push('chat-start'),unmute:async()=>{this.events.push('chat-unmute');this.voiceChat.isMuted=false},mute:async()=>{this.events.push('chat-mute');this.voiceChat.isMuted=true}};
    FakeSession.instances.push(this);
  }
  on(name,handler){this.handlers.set(name,handler)}
  emit(name,payload){this.handlers.get(name)?.(payload)}
  async start(){this.events.push('session-start');this.emit('stream-ready')}
  attach(video){this.events.push('attach');this.video=video}
  startListening(){this.events.push('start-listening')}
  stopListening(){this.events.push('stop-listening')}
  interrupt(){this.events.push('interrupt')}
  message(text){this.events.push(['message',text])}
  async stop(){this.events.push('session-stop')}
}

function installedProvider(options={}){
  const bus=new EventBus(),doc=documentMock(),provider=new LiveAvatarV3Provider({bus,documentImpl:doc,fetchImpl:async()=>{},...options});
  const nodes={root:element(),portrait:element('img'),host:element(),status:element(),retry:element('button')};
  return{bus,doc,provider,nodes,install(callbacks={}){provider.install({...nodes,...callbacks});return provider;}};
}

test('la conversation native V3 ne subit aucune interruption ni réinjection de message',async()=>{
  const {provider,install}=installedProvider();
  install({onCommand:()=>({handled:false})});
  const session=new FakeSession('token'),video=provider.createVideo();provider.session=session;provider.connected=true;provider.microphoneRequested=true;
  provider.wireSession(session,sdkEvents,video);
  session.emit('user-text',{text:'Bonjour, que me conseillez-vous aujourd’hui ?'});
  session.emit('avatar-start');session.emit('avatar-end');
  await Promise.resolve();
  assert.equal(session.events.includes('interrupt'),false);
  assert.equal(session.events.some(event=>Array.isArray(event)&&event[0]==='message'),false);
  assert.equal(session.events.includes('start-listening'),true,'le micro est réarmé après la réponse');
  assert.equal(provider.diagnostic().conversationOwner,'liveavatar-openai-realtime');
});

test('une capacité V4 s’exécute en parallèle sans prendre possession du tour de parole',async()=>{
  const {bus,provider,install}=installedProvider();
  const completed=[];bus.on('companion.capability.completed',payload=>completed.push(payload));
  install({onCommand:()=>({handled:true,id:'cap-1',intent:'nav.open',completion:Promise.resolve({status:'succeeded'})})});
  const session=new FakeSession('token'),video=provider.createVideo();provider.session=session;provider.connected=true;
  provider.wireSession(session,sdkEvents,video);
  session.emit('user-text',{text:'Ouvre la carte'});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(completed.length,1);assert.equal(completed[0].intent,'nav.open');
  assert.equal(session.events.includes('interrupt'),false);
  assert.equal(session.events.some(event=>Array.isArray(event)&&event[0]==='message'),false);
});

test('le SDK ouvre la session via l’API Companion et conserve les secrets côté serveur',async()=>{
  FakeSession.instances.length=0;
  const requests=[],bus=new EventBus(),doc=documentMock();
  const fetchImpl=async(url,options)=>{requests.push({url,options});return{ok:true,status:200,json:async()=>({sessionToken:'ephemeral-token',sessionId:'session-1'})}};
  const sdk=createCompanionWebSdk({
    bus,fetchImpl,documentImpl:doc,locationImpl:{hostname:'preview.vercel.app',origin:'https://preview.vercel.app'},
    sdkLoader:async()=>({...sdkEvents,LiveAvatarSession:FakeSession})
  });
  sdk.install({root:element(),portrait:element('img'),host:element(),status:element(),retry:element('button')});
  assert.equal(await sdk.startListening(),true);
  assert.equal(requests[0].url,'https://preview.vercel.app/api/companion-session');
  const body=JSON.parse(requests[0].options.body);assert.equal(body.appVersion,'2.3.3');assert.equal(body.engine,'liveavatar-v3');
  assert.equal(requests[0].options.body.includes('OPENAI_API_KEY'),false);
  assert.equal(sdk.diagnostic().sdkVersion,'0.2.0');
  assert.equal(sdk.diagnostic().nativeAudio,true);
});

test('le SDK suspend et réarme le micro sans recréer la boucle conversationnelle',async()=>{
  const {provider,install}=installedProvider();install();const session=new FakeSession('token');provider.session=session;provider.connected=true;provider.microphoneRequested=true;
  assert.equal(await provider.suspendMicrophone(),true);assert.equal(session.events.includes('chat-mute'),true);assert.equal(session.events.includes('stop-listening'),true);
  assert.equal(await provider.resumeMicrophone(true),true);assert.equal(session.events.includes('chat-unmute'),true);assert.equal(session.events.includes('start-listening'),true);
});

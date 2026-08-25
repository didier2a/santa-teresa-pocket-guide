import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pocketGuideState} from '../js/pg16/core/pocketguide-state.js';
import {registerUiActions} from '../js/pg16/ui/ui-actions.js';
import {registerRouteActions} from '../js/pg16/route/route-actions.js';
import {humanGuide} from '../js/pg16/guide/human-guide.js';

const html=await readFile(new URL('../pocketguide-16.html',import.meta.url),'utf8');
const bootstrap=await readFile(new URL('../js/pg16/bootstrap/app-rc-bootstrap.js',import.meta.url),'utf8');
const voice=await readFile(new URL('../js/pg16/guide/voice-controller.js',import.meta.url),'utf8');
const realtime=await readFile(new URL('../js/pg16/guide/realtime-session.js',import.meta.url),'utf8');

test('RC1 keeps the proven 1.5.2 Premium visual shell',()=>{
  assert.match(html,/v15\.css\?v=1\.6\.0rc1/);
  assert.match(html,/v152\.css\?v=1\.6\.0rc1/);
  assert.match(html,/class="terrain"/);
  assert.match(html,/class="voice-console"/);
  assert.match(html,/id="voiceMain" class="voice-orb"/);
  assert.match(html,/class="bottom-nav"/);
  assert.doesNotMatch(html,/Alpha 2|Branche expérimentale|Source unique de vérité/);
});

test('Human Guide remains the central navigation surface',()=>{
  for(const tab of ['guide','map','route','create'])assert.match(html,new RegExp(`data-tab="${tab}"`));
  assert.match(html,/Parlez à votre guide/);
  assert.match(html,/Rien n’est remplacé sans votre confirmation/);
});

test('simulation and debug are engineering providers on the exact same RC shell',()=>{
  assert.match(bootstrap,/params\.get\('sim'\)==='1'/);
  assert.match(bootstrap,/params\.get\('debug'\)==='1'/);
  assert.match(bootstrap,/perceptionEngine\.setMode\('simulation'\)/);
  assert.match(html,/id="pg16Debug"/);
  assert.match(html,/id="startDemo" class="ghost" hidden/);
});

test('Premium microphone uses Realtime first with local fallback',()=>{
  assert.match(realtime,/\/v2\/realtime\/call/);
  assert.match(realtime,/Content-Type':'application\/sdp/);
  assert.match(realtime,/beginListening/);
  assert.match(realtime,/response\.cancel/);
  assert.match(voice,/SpeechRecognition\|\|globalThis\.webkitSpeechRecognition/);
  assert.match(bootstrap,/realtimeSession\.beginListening/);
  assert.match(bootstrap,/voiceController\.start\(\)/);
});

test('RoutePack place explanation is exposed through Human Guide',async()=>{
  pocketGuideState.reset({source:'test'});
  pocketGuideState.patch({route:{activeId:'demo',title:'Demo',pack:{places:[{id:'p1',name:'Citadelle',historyLong:'Une histoire fiable.',arCue:'la tour à droite'}],days:[{events:[{id:'e1',placeId:'p1',durationMinutes:10}]}]},currentEventId:'e1',nextEventId:null}},{source:'test'});
  registerUiActions();registerRouteActions();
  const reply=await humanGuide.handleText('Raconte ce lieu',{source:'test'});
  assert.equal(reply.type,'SAY');assert.match(reply.text,/Citadelle/);assert.match(reply.text,/Une histoire fiable/);
});

test('Skipping still requires confirmation in Premium RC architecture',async()=>{
  pocketGuideState.reset({source:'test'});
  pocketGuideState.patch({route:{activeId:'demo',title:'Demo',pack:{places:[{id:'p1',name:'Un'},{id:'p2',name:'Deux'}],days:[{events:[{id:'e1',placeId:'p1'},{id:'e2',placeId:'p2'}]}]},currentEventId:'e1',nextEventId:'e2'}},{source:'test'});
  registerUiActions();registerRouteActions();
  const proposal=await humanGuide.handleText('Saute cette étape',{source:'test'});
  assert.equal(proposal.type,'ASK');assert.equal(pocketGuideState.select('route.currentEventId'),'e1');
  await humanGuide.confirmPending(true);assert.equal(pocketGuideState.select('route.currentEventId'),'e2');
});

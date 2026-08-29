import {createCompanionWebSdk} from '../companion-sdk/companion-web-sdk.js';
import {EventBus} from '../pg16/core/event-bus.js';

const pageUrl=new URL(location.href);
const enabled=pageUrl.searchParams.get('companion')==='1'||/\/pocketguide-4-preview\/?$/.test(pageUrl.pathname);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const normalize=value=>String(value||'').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s'-]/g,' ').replace(/\s+/g,' ').trim();

async function waitForBase(){for(let i=0;i<100&&!window.__POCKETGUIDE_15__;i++)await sleep(50);return window.__POCKETGUIDE_15__||null;}
function addTurn(role,text){if(!text)return;const host=document.querySelector('#conversationLog');if(!host)return;const turn=document.createElement('div');turn.className=`turn turn--${role==='companion'?'assistant':role}`;turn.textContent=String(text);const meta=document.createElement('small');meta.textContent=`${role==='user'?'Vous':'PocketGuide'} · ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`;turn.append(meta);host.append(turn);host.scrollTop=host.scrollHeight;if(role!=='user')document.querySelector('#guideAnswer').textContent=String(text);}
function ensureStyle(){if(document.querySelector('link[data-pg152-companion]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='./v152-companion.css?v=4.0.0-preview.7';link.dataset.pg152Companion='1';document.head.append(link);}
function makeMount(){
  const terrain=document.querySelector('#terrainMedia');if(!terrain)return null;terrain.dataset.companion='liveavatar-v3';
  const root=document.createElement('div');root.id='pg152Companion';root.className='pg152-companion';root.dataset.pgVersion='4.0.0';
  const portrait=document.createElement('span');portrait.id='pg152CompanionPortrait';portrait.hidden=true;
  const host=document.createElement('span');host.id='pg152CompanionHost';host.className='pg152-companion-host';
  const status=document.createElement('small');status.id='pg152CompanionStatus';status.className='pg152-companion-status';
  const retry=document.createElement('button');retry.id='pg152CompanionRetry';retry.className='pg152-companion-retry';retry.type='button';retry.textContent='Réessayer la connexion';retry.hidden=true;
  root.append(portrait,host,status,retry);terrain.prepend(root);return{terrain,root,portrait,host,status,retry};
}
function setVoiceUi(nodes,payload={}){
  const value=payload.value||'ready',connected=payload.connected!==false&&value!=='degraded';nodes.terrain.dataset.companionPresence=value;
  const session=document.querySelector('#sessionState'),button=document.querySelector('#voiceMain'),label=document.querySelector('#voiceLabel');
  const labels={connecting:'Connexion',listening:'Écoute',thinking:'Réflexion',speaking:'Réponse',interrupted:'IA',degraded:'IA indisponible',ready:connected?'IA connectée':'IA'};
  if(session){session.textContent=labels[value]||'IA';session.classList.toggle('is-live',connected&&value!=='degraded');}
  button?.classList.toggle('is-live',connected&&['listening','thinking','speaking'].includes(value));
  if(label)label.textContent=value==='listening'?'Je vous écoute…':value==='thinking'?'Je réfléchis…':value==='speaking'?'Votre guide vous répond…':value==='degraded'?'Companion indisponible':'Parlez à votre guide';
}
function routeCapability(app,text){
  const value=normalize(text),done=(intent,result,speech)=>({handled:true,id:`pg152-${Date.now()}`,intent,completion:Promise.resolve({result,speech})});
  const views=[['map',/\b(ouvre|affiche|montre|va sur|passe a)\b.*\b(carte|cartographie)\b|\b(carte|cartographie)\b.*\b(ouvre|affiche|montre)\b/],['route',/\b(ouvre|affiche|montre|va sur|passe a)\b.*\b(parcours|itineraire)\b/],['create',/\b(ouvre|affiche|va sur|passe a)\b.*\b(creer|creation|planner)\b/],['guide',/\b(reviens|retourne|va sur|passe a)\b.*\b(guide|compagnon)\b/]];
  for(const [view,pattern] of views)if(pattern.test(value)){app.showPanel(view);return done('navigation.open',{view},`J’ai ouvert ${view==='map'?'la carte':view==='route'?'le parcours':view==='create'?'la création':'le guide'}.`);}
  if(/\b(active|demarre|lance|ouvre)\b.*\b(gps|localisation)\b/.test(value)){document.querySelector('#gpsBtn')?.click();return done('terrain.gps',{started:true},'Le GPS est activé.');}
  if(/\b(ouvre|active|demarre|lance)\b.*\b(ar|realite augmentee)\b/.test(value)){const result=app.toolCall('open_ar',{});return done('terrain.ar',result,'J’ouvre la réalité augmentée.');}
  if(/\b(raccourcis|raccourcir|moins de temps)\b/.test(value)){const result=app.toolCall('shorten_route',{removeCount:1});return done('route.shorten',result,result.removed?.length?`J’ai retiré ${result.removed.join(', ')} et conservé les incontournables.`:'Aucune étape secondaire ne peut être retirée.');}
  if(/\b(saute|sauter|ignore)\b.*\b(etape|prochaine|lieu)\b/.test(value)){const result=app.toolCall('skip_next_stop',{});return done('route.skip',result,result.error||`Étape sautée : ${result.skipped}.`);}
  if(/\b(va|aller|conduis|emmene|ouvre)\b/.test(value)){const place=(app.pack.places||[]).find(item=>value.includes(normalize(item.name)));if(place){const result=app.toolCall('go_to_place',{placeId:place.id});return done('route.goTo',result,result.error||`${place.name} devient l’étape active.`);}}
  return{handled:false};
}

async function install(){
  const app=await waitForBase();if(!app)throw new Error('Base PocketGuide 1.5.2 indisponible');ensureStyle();const nodes=makeMount();if(!nodes)throw new Error('Terrain PocketGuide 1.5.2 indisponible');
  const bus=new EventBus(),sdk=createCompanionWebSdk({bus,fetchImpl:fetch,documentImpl:document,locationImpl:location,sessionEndpoint:'/api/companion-session',clientVersion:'4.0.0-preview.7'});
  sdk.install({root:nodes.root,portrait:nodes.portrait,host:nodes.host,status:nodes.status,retry:nodes.retry,onCapability:text=>routeCapability(app,text),onStatus:payload=>setVoiceUi(nodes,payload),onTurn:(role,text)=>addTurn(role,text)});
  const voice=document.querySelector('#voiceMain'),interrupt=document.querySelector('#interruptBtn'),start=document.querySelector('#startGuide');
  if(voice)voice.onclick=async()=>{const diagnostic=sdk.diagnostic();if(['speaking','thinking'].includes(nodes.terrain.dataset.companionPresence))await sdk.interrupt('v152-user');else await sdk.startListening();};
  if(interrupt)interrupt.onclick=()=>void sdk.interrupt('v152-stop');
  if(start)start.onclick=async()=>{document.querySelector('#permissionSheet').hidden=true;if(app.state.gpsWatch===null)document.querySelector('#gpsBtn')?.click();await sdk.startListening();};
  let plannerResume=false;document.querySelector('#planVoiceBtn')?.addEventListener('click',async()=>{const planner=window.__POCKETGUIDE_PLANNER_VOICE__;if(!planner?.active)plannerResume=await sdk.suspendMicrophone();else{for(let i=0;i<30&&planner.active;i++)await sleep(100);await sdk.resumeMicrophone(plannerResume);plannerResume=false;}},{capture:true});
  window.addEventListener('beforeunload',()=>void sdk.destroy(),{once:true});
  window.__POCKETGUIDE_COMPANION__={version:'0.3.0-v152-bridge',baseVersion:'1.5.2',sdk,bus,routeCapability:text=>routeCapability(app,text),diagnostic:()=>({base:'1.5.2-final',mapOwner:'pocketguide-v1-5',conversationOwner:'liveavatar-v3',...sdk.diagnostic()})};
  document.documentElement.dataset.pocketguideRuntime='1.5.2+companion';setVoiceUi(nodes,{value:'ready',connected:false});
}

if(enabled)install().catch(error=>{console.error('[PocketGuide V4 native bridge]',error);const session=document.querySelector('#sessionState');if(session)session.textContent='IA indisponible';});

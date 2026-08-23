import {loadPocketGuideRoute} from './route-runtime.js';
import {haversineKm,bearingDeg,compassLabel,simulatedPositionForPlace} from './ar-core.js';

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const qs=new URL(location.href).searchParams;
const runtime=await loadPocketGuideRoute({locationLike:window.location});
const pack=structuredClone(runtime.pack);
const data=runtime.data;
const config=await fetch('./data/v2-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():({})).catch(()=>({}));
const placeById=Object.fromEntries((pack.places||[]).map(p=>[p.id,p]));
const STORAGE=`pg:v2:${pack.id}:state`;
const state={
  position:null,heading:null,gpsWatch:null,map:null,userMarker:null,routeLayer:null,markers:null,
  skipped:new Set(),currentPlaceId:null,arTargetId:null,simulation:false,session:null,pc:null,dc:null,micStream:null,
  connected:false,listening:false,lastAssistant:'',lastUser:'',routeRevision:0,
  ...readSaved()
};
if(Array.isArray(state.skipped))state.skipped=new Set(state.skipped);

function readSaved(){try{const x=JSON.parse(localStorage.getItem(STORAGE)||'{}');return x&&typeof x==='object'?x:{}}catch{return{}}}
function save(){localStorage.setItem(STORAGE,JSON.stringify({skipped:[...state.skipped],currentPlaceId:state.currentPlaceId,routeRevision:state.routeRevision}))}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function nowIso(){return new Date().toISOString()}
function allEvents(){return (pack.days||[]).flatMap((d,di)=>(d.events||[]).map((e,ei)=>({day:d,di,event:e,ei,place:placeById[e.placeId]}))).filter(x=>!state.skipped.has(x.event.id))}
function scheduledNow(){const now=new Date();const ymd=now.toLocaleDateString('en-CA',{timeZone:pack.timezone||'Europe/Paris'});const hm=now.toLocaleTimeString('fr-FR',{timeZone:pack.timezone||'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false});const today=allEvents().filter(x=>x.day.date===ymd);return today.find(x=>x.event.time<=hm&&hm<x.event.end)||today.find(x=>x.event.time>hm)||allEvents()[0]||null}
function activeEvent(){const events=allEvents();if(state.currentPlaceId){const i=events.findIndex(x=>x.event.placeId===state.currentPlaceId);if(i>=0)return events[i]}return scheduledNow()}
function nextEvent(){const events=allEvents(),cur=activeEvent();if(!cur)return events[0]||null;const i=events.findIndex(x=>x.event.id===cur.event.id);return events[i+1]||null}
function remainingEvents(){const events=allEvents(),cur=activeEvent();if(!cur)return events;const i=events.findIndex(x=>x.event.id===cur.event.id);return i<0?events:events.slice(i)}
function nearestPlace(pos=state.position){if(!pos)return null;return (pack.places||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>({place:p,distanceKm:haversineKm(pos,p),bearing:bearingDeg(pos,p)})).sort((a,b)=>a.distanceKm-b.distanceKm)[0]||null}
function distanceText(km){if(!Number.isFinite(km))return'—';return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`}
function contextSnapshot(){
  const cur=activeEvent(),next=nextEvent(),near=nearestPlace();
  return {
    app:'PocketGuide V2',route:{id:pack.id,title:pack.title,timezone:pack.timezone},
    now:new Date().toISOString(),position:state.position?{lat:+state.position.lat.toFixed(6),lng:+state.position.lng.toFixed(6),accuracy:Math.round(state.position.accuracy||0),simulated:Boolean(state.position.simulated)}:null,
    heading:Number.isFinite(state.heading)?Math.round(state.heading):null,
    nearest:near?{id:near.place.id,name:near.place.name,distanceMeters:Math.round(near.distanceKm*1000),bearing:Math.round(near.bearing)}:null,
    current:cur?{eventId:cur.event.id,title:cur.event.title,placeId:cur.event.placeId,place:cur.place?.name||cur.event.place,time:cur.event.time,end:cur.event.end}:null,
    next:next?{eventId:next.event.id,title:next.event.title,placeId:next.event.placeId,place:next.place?.name||next.event.place,time:next.event.time}:null,
    remaining:remainingEvents().length,skipped:[...state.skipped],arTarget:state.arTargetId?placeById[state.arTargetId]?.name:null,routeRevision:state.routeRevision
  };
}
function systemInstructions(){return `Tu es PocketGuide V2, un guide touristique vocal professionnel, chaleureux, concis et extrêmement pertinent. Tu accompagnes physiquement le voyageur. Tu connais son RoutePack, son GPS, son heure, son cap, ses lieux visités et ses contraintes. Tu ne récites pas une brochure : tu dialogues, tu proposes, tu t'adaptes et tu utilises les outils. Tu peux être interrompu à tout moment. Réponds en français naturel, phrases courtes adaptées à l'oral. Quand l'utilisateur demande où il est, ce qu'il regarde, quoi faire ensuite, raccourcir, sauter ou changer une étape, utilise les outils plutôt que d'inventer. Ne prétends jamais connaître une donnée temps réel absente. Pour une modification de parcours, annonce brièvement ce que tu vas faire puis appelle l'outil. Quand un monument est proche, décris ce qu'on peut observer et son intérêt culturel en utilisant les données du RoutePack. Évite le bavardage. Le but est de donner l'impression d'un excellent guide humain qui marche avec le voyageur.`}

const tools=[
  {type:'function',name:'get_trip_state',description:'Obtenir la position, l’étape actuelle, la prochaine étape, le nombre d’étapes restantes et la cible AR.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'get_nearby_places',description:'Lister les lieux RoutePack les plus proches du voyageur.',parameters:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:6}},additionalProperties:false}},
  {type:'function',name:'focus_place_in_ar',description:'Choisir un lieu du RoutePack comme cible de réalité augmentée.',parameters:{type:'object',properties:{placeId:{type:'string'}},required:['placeId'],additionalProperties:false}},
  {type:'function',name:'skip_next_stop',description:'Sauter la prochaine étape du parcours.',parameters:{type:'object',properties:{reason:{type:'string'}},additionalProperties:false}},
  {type:'function',name:'go_to_place',description:'Faire d’un lieu du RoutePack la nouvelle étape courante.',parameters:{type:'object',properties:{placeId:{type:'string'}},required:['placeId'],additionalProperties:false}},
  {type:'function',name:'shorten_route',description:'Raccourcir le parcours en supprimant des étapes futures non essentielles.',parameters:{type:'object',properties:{removeCount:{type:'integer',minimum:1,maximum:4}},additionalProperties:false}},
  {type:'function',name:'open_ar',description:'Ouvrir l’expérience Geo-AR PocketGuide pour le parcours courant.',parameters:{type:'object',properties:{},additionalProperties:false}}
];

function toolCall(name,args={}){
  if(name==='get_trip_state')return contextSnapshot();
  if(name==='get_nearby_places'){
    const limit=Math.max(1,Math.min(6,args.limit||4));if(!state.position)return{error:'GPS indisponible'};
    return (pack.places||[]).map(p=>({p,d:haversineKm(state.position,p),b:bearingDeg(state.position,p)})).sort((a,b)=>a.d-b.d).slice(0,limit).map(x=>({id:x.p.id,name:x.p.name,distanceMeters:Math.round(x.d*1000),direction:compassLabel(x.b),history:x.p.historyShort||x.p.description||''}));
  }
  if(name==='focus_place_in_ar'){
    if(!placeById[args.placeId])return{error:'Lieu inconnu'};state.arTargetId=args.placeId;renderContext();return{ok:true,target:placeById[args.placeId].name};
  }
  if(name==='skip_next_stop'){
    const n=nextEvent();if(!n)return{error:'Aucune étape suivante'};state.skipped.add(n.event.id);state.routeRevision++;save();renderAll();return{ok:true,skipped:n.event.title,next:nextEvent()?.event.title||null};
  }
  if(name==='go_to_place'){
    const p=placeById[args.placeId];if(!p)return{error:'Lieu inconnu'};state.currentPlaceId=p.id;state.arTargetId=p.id;state.routeRevision++;save();renderAll();return{ok:true,current:p.name};
  }
  if(name==='shorten_route'){
    const count=Math.max(1,Math.min(4,args.removeCount||1)),remain=remainingEvents().slice(1);let removed=[];
    for(const x of [...remain].reverse()){if(removed.length>=count)break;if(x.event.type==='transfert')continue;state.skipped.add(x.event.id);removed.push(x.event.title)}
    state.routeRevision++;save();renderAll();return{ok:true,removed,next:nextEvent()?.event.title||null};
  }
  if(name==='open_ar'){openAR();return{ok:true}};
  return{error:`Outil inconnu: ${name}`};
}

function addTurn(role,text){if(!text)return;const el=document.createElement('div');el.className=`turn turn--${role}`;el.innerHTML=`${esc(text)}<small>${role==='user'?'Vous':'PocketGuide'} · ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</small>`;$('#conversationLog').append(el);$('#conversationLog').scrollTop=$('#conversationLog').scrollHeight;if(role==='assistant'){state.lastAssistant=text;$('#guideAnswer').textContent=text}else state.lastUser=text}
function setSession(text,live=false){$('#sessionState').textContent=text;$('#sessionState').classList.toggle('chip--muted',!live);$('#voiceMain').classList.toggle('is-live',live);$('#voiceLabel').textContent=live?'Je vous écoute…':'Appuyez pour parler'}

function renderContext(){
  const cur=activeEvent(),next=nextEvent(),near=nearestPlace();
  $('#routeTitle').textContent=pack.title;
  $('#nowTitle').textContent=cur?cur.event.title:'Aucune étape';
  $('#nowMeta').textContent=cur?`${cur.place?.name||cur.event.place} · ${cur.event.time}–${cur.event.end}${near?` · lieu le plus proche ${distanceText(near.distanceKm)}`:''}`:'—';
  const target=state.arTargetId?placeById[state.arTargetId]:near?.place;$('#arTarget').textContent=target?.name||'Aucune cible';
  $('#arMeta').textContent=target?(target.arCue||target.repere||target.historyShort||'Repère prêt pour la réalité augmentée.'):'Activez le GPS ou ouvrez l’AR.';
  const rem=remainingEvents();$('#remainingTitle').textContent=`${rem.length} étape${rem.length>1?'s':''} restante${rem.length>1?'s':''}`;$('#remainingMeta').textContent=next?`Prochaine : ${next.event.title} · ${next.event.time}`:'Fin du parcours.';
  if(cur?.place?.heroImage){$('#guideVisual').style.backgroundImage=`linear-gradient(180deg,rgba(7,24,29,.18),rgba(7,24,29,.88)),url("${cur.place.heroImage}")`;$('#guideVisual').style.backgroundSize='cover';$('#guideVisual').style.backgroundPosition='center'}
  $('#guideHeadline').textContent=cur?`${cur.place?.name||cur.event.place}`:'Votre guide touristique IA';
}

function initMap(){if(!window.L)return;state.map=L.map('v2Map',{zoomControl:true});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(state.map);state.markers=L.layerGroup().addTo(state.map);for(const p of pack.places||[]){if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng))continue;L.circleMarker([p.lat,p.lng],{radius:8,weight:2,fillOpacity:.85}).addTo(state.markers).bindPopup(`<strong>${esc(p.name)}</strong><br>${esc(p.historyShort||p.description||'')}`)}drawRoute();const points=(pack.places||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>[p.lat,p.lng]);if(points.length)state.map.fitBounds(points,{padding:[25,25],maxZoom:15})}
function drawRoute(){if(!state.map)return;state.routeLayer?.remove();const pts=allEvents().map(x=>x.place).filter(p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>[p.lat,p.lng]);if(pts.length>1)state.routeLayer=L.polyline(pts,{weight:4,opacity:.72,dashArray:'9,7'}).addTo(state.map)}
function updateMapPosition(){if(!state.map||!state.position)return;const ll=[state.position.lat,state.position.lng];if(!state.userMarker)state.userMarker=L.circleMarker(ll,{radius:9,weight:4,fillOpacity:1}).addTo(state.map).bindPopup('Vous êtes ici');else state.userMarker.setLatLng(ll);state.map.setView(ll,Math.max(state.map.getZoom(),15))}

function onPosition(pos){state.position={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy||99};const near=nearestPlace();if(near&&near.distanceKm<.16){state.currentPlaceId=near.place.id;if(!state.arTargetId)state.arTargetId=near.place.id}updateMapPosition();renderContext();sendContextUpdate('gps')}
function toggleGps(){if(state.gpsWatch!==null){navigator.geolocation.clearWatch(state.gpsWatch);state.gpsWatch=null;$('#gpsBtn').textContent='◎ Activer le GPS';return}if(!navigator.geolocation){addTurn('assistant','La géolocalisation n’est pas disponible sur ce navigateur.');return}$('#gpsBtn').textContent='GPS…';state.gpsWatch=navigator.geolocation.watchPosition(onPosition,e=>{addTurn('assistant',`GPS indisponible : ${e.message||'autorisation refusée'}`);$('#gpsBtn').textContent='◎ Activer le GPS';state.gpsWatch=null},{enableHighAccuracy:true,maximumAge:1500,timeout:12000});$('#gpsBtn').textContent='■ Arrêter le GPS'}

function openAR(){const url=new URL('engine.html',location.href);url.searchParams.set('route',pack.id);if(state.simulation)url.searchParams.set('arsim','1');if(state.arTargetId)url.hash=`place-${state.arTargetId}`;location.href=url.toString()}
async function toggleOrientation(){const landscape=!document.documentElement.classList.contains('v2-landscape');document.documentElement.classList.toggle('v2-landscape',landscape);$('#orientationBtn').textContent=landscape?'▯ 9:16':'▭ 16:9';try{if(landscape&&document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock(landscape?'landscape':'portrait')}catch{}setTimeout(()=>state.map?.invalidateSize(),200)}

function sendEvent(payload){if(state.dc?.readyState==='open')state.dc.send(JSON.stringify(payload))}
function sendContextUpdate(reason='state'){if(!state.connected)return;sendEvent({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:`[CONTEXTE APPLICATION ${reason}] ${JSON.stringify(contextSnapshot())}`} ]}})}
function askRealtime(text){addTurn('user',text);sendEvent({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});sendEvent({type:'response.create',response:{modalities:['audio','text']}})}

async function connectRealtime(){
  if(state.connected)return;
  if(!config.apiBase){activateSimulation('Backend V2 non configuré : simulation locale activée.');return}
  try{
    setSession('Connexion IA…');
    const pc=new RTCPeerConnection();state.pc=pc;
    const audio=$('#remoteAudio');pc.ontrack=e=>{audio.srcObject=e.streams[0]};
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});state.micStream=stream;for(const track of stream.getTracks())pc.addTrack(track,stream);
    const dc=pc.createDataChannel('oai-events');state.dc=dc;
    dc.onopen=()=>{state.connected=true;setSession('Guide IA connecté',true);sendEvent({type:'session.update',session:{instructions:systemInstructions(),tools,tool_choice:'auto'}});sendContextUpdate('initial');sendEvent({type:'response.create',response:{instructions:'Salue brièvement le voyageur et indique que tu es prêt à guider la balade.',modalities:['audio','text']}})};
    dc.onmessage=e=>handleRealtimeEvent(JSON.parse(e.data));
    dc.onclose=()=>{state.connected=false;setSession('IA déconnectée')};
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    const r=await fetch(`${String(config.apiBase).replace(/\/$/,'')}/v2/realtime/call?model=${encodeURIComponent(config.realtimeModel||'gpt-realtime')}&voice=${encodeURIComponent(config.voice||'marin')}`,{method:'POST',headers:{'Content-Type':'application/sdp'},body:offer.sdp});
    if(!r.ok)throw new Error((await r.text())||`Session ${r.status}`);
    const answer={type:'answer',sdp:await r.text()};await pc.setRemoteDescription(answer);
  }catch(error){disconnectRealtime();activateSimulation(`Connexion Realtime indisponible (${error.message||error}). Simulation activée.`)}
}
function disconnectRealtime(){try{state.dc?.close()}catch{}try{state.pc?.close()}catch{}for(const t of state.micStream?.getTracks?.()||[])t.stop();state.dc=null;state.pc=null;state.micStream=null;state.connected=false;setSession('IA inactive')}
function interrupt(){if(state.connected)sendEvent({type:'response.cancel'});try{$('#remoteAudio').pause()}catch{}setSession(state.connected?'Guide IA connecté':'IA inactive',state.connected)}

function extractOutputText(evt){if(typeof evt?.response?.output_text==='string')return evt.response.output_text;const parts=[];for(const item of evt?.response?.output||[])for(const c of item?.content||[])if(c?.text)parts.push(c.text);return parts.join(' ').trim()}
async function handleRealtimeEvent(evt){
  if(evt.type==='input_audio_buffer.speech_started'){state.listening=true;setSession('Je vous écoute…',true);return}
  if(evt.type==='input_audio_buffer.speech_stopped'){state.listening=false;setSession('Je réfléchis…',true);return}
  if(evt.type==='conversation.item.input_audio_transcription.completed'&&evt.transcript)addTurn('user',evt.transcript);
  if(evt.type==='response.done'){const text=extractOutputText(evt);if(text)addTurn('assistant',text);setSession('Guide IA connecté',true)}
  if(evt.type==='response.audio_transcript.done'&&evt.transcript&&!state.lastAssistant.includes(evt.transcript))addTurn('assistant',evt.transcript);
  if(evt.type==='response.function_call_arguments.done')return executeRealtimeTool(evt.name,evt.call_id,evt.arguments);
  if(evt.type==='response.output_item.done'&&evt.item?.type==='function_call')return executeRealtimeTool(evt.item.name,evt.item.call_id,evt.item.arguments);
  if(evt.type==='error')addTurn('assistant',`Erreur Realtime : ${evt.error?.message||'inconnue'}`);
}
function executeRealtimeTool(name,callId,argsText){let args={};try{args=JSON.parse(argsText||'{}')}catch{}const result=toolCall(name,args);sendEvent({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(result)}});sendEvent({type:'response.create'});return result}

function activateSimulation(message='Simulation locale active.'){state.simulation=true;setSession('SIMULATION');$('#simulateBtn').innerHTML='<span class="sim-badge">SIM</span> Simulation';addTurn('assistant',message);if(!state.position){const p=activeEvent()?.place||pack.places?.[0];const sim=simulatedPositionForPlace(p);if(sim){state.position=sim;state.currentPlaceId=p.id;state.arTargetId=p.id;updateMapPosition();renderAll()}}}
function simSpeak(text){if(!('speechSynthesis'in window))return;const u=new SpeechSynthesisUtterance(text);u.lang='fr-FR';u.rate=.96;speechSynthesis.cancel();speechSynthesis.speak(u)}
function simulationReply(text){
  addTurn('user',text);const q=text.toLocaleLowerCase('fr-FR');let reply='Je suis prêt. Demandez-moi où nous en sommes, ce que vous regardez ou de modifier la balade.';
  const cur=activeEvent(),next=nextEvent(),near=nearestPlace();
  if(/où|ou en|position|sommes/.test(q))reply=near?`Nous sommes à environ ${distanceText(near.distanceKm)} de ${near.place.name}. ${cur?`L’étape actuelle est ${cur.event.title}.`:''}`:'Activez le GPS pour que je vous situe précisément.';
  else if(/regarde|devant|voir/.test(q)){const p=state.arTargetId?placeById[state.arTargetId]:near?.place;reply=p?`Vous regardez probablement ${p.name}. ${p.historyShort||p.description||''} ${p.arCue||p.repere||''}`:'Ouvrez l’AR ou activez le GPS pour identifier le repère.'}
  else if(/ensuite|après|prochaine|fait maintenant/.test(q))reply=next?`Ensuite, je vous propose ${next.event.title}, à ${next.event.time}, à ${next.place?.name||next.event.place}.`:'Nous sommes à la fin du parcours prévu.';
  else if(/fatigu|raccour|moins de temps/.test(q)){const r=toolCall('shorten_route',{removeCount:1});reply=r.ok?`D’accord. J’allège la balade : ${r.removed.join(', ')} est retiré. La suite devient ${r.next||'la fin du parcours'}.`:'Je ne peux plus raccourcir davantage.'}
  else if(/saute|supprime la prochaine/.test(q)){const r=toolCall('skip_next_stop',{});reply=r.ok?`C’est fait. Je saute ${r.skipped}. La nouvelle prochaine étape est ${r.next||'la fin du parcours'}.`:'Il n’y a plus d’étape à sauter.'}
  else if(/raconte|explique|histoire/.test(q)){const p=state.currentPlaceId?placeById[state.currentPlaceId]:near?.place;reply=p?`${p.name}. ${p.description||p.note||''} ${p.historyLong||p.historyShort||''}`:'Activez le GPS pour que je sache quel lieu raconter.'}
  else if(/change|meilleur prochain/.test(q)){const candidates=state.position?(pack.places||[]).filter(p=>p.id!==state.currentPlaceId).map(p=>({p,d:haversineKm(state.position,p)})).sort((a,b)=>a.d-b.d):[];const p=candidates[0]?.p;if(p){toolCall('go_to_place',{placeId:p.id});reply=`Je vous propose ${p.name}, le repère pertinent le plus proche parmi le parcours. Je le place aussi comme cible AR.`}}
  addTurn('assistant',reply);$('#guideAnswer').textContent=reply;simSpeak(reply);
}
function submitCommand(text){const value=String(text||'').trim();if(!value)return;if(state.connected)askRealtime(value);else{if(!state.simulation)activateSimulation();simulationReply(value)}}
function renderAll(){renderContext();drawRoute();updateMapPosition()}

$('#voiceMain').onclick=async()=>{if(state.connected){if(state.listening)interrupt();else setSession('Je vous écoute…',true)}else await connectRealtime()};
$('#interruptBtn').onclick=interrupt;$('#simulateBtn').onclick=()=>activateSimulation();$('#orientationBtn').onclick=toggleOrientation;$('#gpsBtn').onclick=toggleGps;$('#openARV2').onclick=openAR;$('#clearLog').onclick=()=>$('#conversationLog').replaceChildren();
$('#textForm').onsubmit=e=>{e.preventDefault();const box=$('#textCommand');submitCommand(box.value);box.value=''};
$$('[data-command]').forEach(b=>b.onclick=()=>submitCommand(b.dataset.command));
$$('[data-ask]').forEach(b=>b.onclick=()=>{const map={where:'Où en sommes-nous exactement ?',next:'Qu’est-ce qu’on fait ensuite ?',look:'Qu’est-ce que je regarde actuellement ?',shorten:'Je veux raccourcir la balade sans perdre les incontournables.',change:'Change intelligemment la prochaine étape.'};submitCommand(map[b.dataset.ask])});
window.addEventListener('online',()=>$('#networkState').textContent='● En ligne');window.addEventListener('offline',()=>$('#networkState').textContent='● Hors ligne');
window.addEventListener('beforeunload',disconnectRealtime);

initMap();renderAll();
addTurn('assistant',`PocketGuide V2 chargé pour « ${pack.title} ». Appuyez sur le micro pour ouvrir le guide vocal, ou utilisez Simulation pour tester sans backend.`);
if(qs.get('sim')==='1')activateSimulation('Simulation V2 démarrée automatiquement.');
window.__POCKETGUIDE_V2__={state,pack,contextSnapshot,toolCall,submitCommand,connectRealtime,disconnectRealtime,activateSimulation};

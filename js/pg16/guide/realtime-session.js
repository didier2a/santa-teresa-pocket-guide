import {pocketGuideState} from '../core/pocketguide-state.js';
import {humanContextEngine} from '../core/context-engine.js';
import {actionRegistry} from '../core/action-registry.js';
import {proposalManager} from '../core/proposal-manager.js';
import {plannerEngine} from '../planner/planner-engine.js';
import {memoryStore} from '../memory/memory-store.js';
import {eventBus} from '../core/event-bus.js';

const TOOLS=[
  {type:'function',name:'get_context',description:'Lire le contexte réel actuel PocketGuide : route, position, capteurs, étape, temps restant et proposition en attente.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'open_map',description:'Ouvrir la carte Premium.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'open_ar',description:'Demander l’ouverture de Geo-AR. La permission caméra reste gérée par le téléphone.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'explain_current_place',description:'Lire les informations fiables du RoutePack sur le lieu courant.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'continue_route',description:'Valider l’étape courante et avancer.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'propose_skip_current',description:'Proposer de sauter l’étape courante. Ne modifie rien avant confirmation utilisateur.',parameters:{type:'object',properties:{reason:{type:'string'}},additionalProperties:false}},
  {type:'function',name:'propose_shorten_route',description:'Proposer de raccourcir le parcours en préservant les incontournables.',parameters:{type:'object',properties:{targetMinutes:{type:'integer',minimum:15,maximum:480},removeCount:{type:'integer',minimum:1,maximum:6},reason:{type:'string'}},additionalProperties:false}},
  {type:'function',name:'propose_new_route',description:'Utiliser le Planner vérifié pour proposer un NOUVEAU parcours. Si l’utilisateur nomme une nouvelle ville ou destination, recopier exactement cette destination dans destination. Ne jamais utiliser le lieu ou la ville de l’ancien RoutePack comme destination par défaut. Le remplacement exige ensuite confirmation.',parameters:{type:'object',properties:{prompt:{type:'string'},destination:{type:'string',description:'Nouvelle destination explicitement demandée par l’utilisateur. Laisser vide si aucune destination n’est nommée; ne jamais recopier l’ancien parcours.'},maxPlaces:{type:'integer',minimum:3,maximum:10}},required:['prompt'],additionalProperties:false}},
  {type:'function',name:'get_preferences',description:'Lire les préférences de voyage explicitement mémorisées.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'undo_last_change',description:'Annuler la dernière modification structurante validée quand elle est encore annulable.',parameters:{type:'object',properties:{},additionalProperties:false}}
];

let configPromise=null;
async function loadConfig(){if(!configPromise)configPromise=fetch('./data/v2-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error(`Config ${r.status}`)));return configPromise;}
function parseArgs(raw){try{return JSON.parse(raw||'{}')}catch{return {}}}
function instructions(){return `Tu es PocketGuide 1.6 Human Guide, compagnon de voyage conversationnel. Tu es cultivé, chaleureux, bref pendant la marche et détaillé sur demande. Tu reçois uniquement des données structurées fiables de PocketGuide Core. N’invente jamais GPS, distance, cap, état de capteur, lieu RoutePack ou résultat d’action. Si une donnée manque, dis-le. Utilise les outils pour agir. Les changements importants doivent toujours passer par une proposition et une confirmation explicite. Si une proposition est en attente, un simple oui/non peut la résoudre. Tu peux être interrompu. Quand l’utilisateur demande ce qu’il regarde, commence par ce qui est observable puis ajoute un élément historique mémorable. Quand l’utilisateur demande une NOUVELLE balade dans une autre ville, cette ville devient la destination du Planner même si un ancien RoutePack d’une autre ville est encore actif. L’ancien parcours est seulement le parcours à remplacer, jamais une destination implicite. Pour “ici” ou “autour de moi”, utilise la position réelle fournie par PocketGuide Core. Le smartphone est ton corps sensoriel mais les permissions appartiennent à l’utilisateur.`;}

export class RealtimeSession {
  constructor(){this.pc=null;this.dc=null;this.stream=null;this.connected=false;this.connecting=false;this.listening=false;this.processedCalls=new Set();this.onText=null;this.onStatus=null;this.remoteAudio=null;}
  status(value,label=value){pocketGuideState.patch({conversation:{status:value}},{source:'realtime',event:`guide.${value}`});this.onStatus?.(value,label);}
  send(payload){if(this.dc?.readyState!=='open')return false;this.dc.send(JSON.stringify(payload));return true;}
  sendContext(reason='context'){if(!this.connected)return false;const context=humanContextEngine.build();return this.send({type:'session.update',session:{type:'realtime',instructions:`${instructions()}\nContexte PocketGuide (${reason}): ${JSON.stringify(context)}`,tools:TOOLS}});}
  ask(text){const value=String(text||'').trim();if(!value||!this.connected)return false;this.sendContext('question');this.send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:value}]}});return this.send({type:'response.create',response:{instructions:'Réponds naturellement et brièvement comme le Human Guide PocketGuide.'}});}
  setMic(enabled){this.listening=Boolean(enabled);try{this.stream?.getAudioTracks().forEach(track=>{track.enabled=this.listening;});}catch{}if(this.listening)this.status('listening','Je vous écoute…');else if(this.connected)this.status('idle','Guide IA prêt');return this.listening;}
  beginListening(){if(!this.connected)return false;if(pocketGuideState.select('conversation.status')==='speaking')this.send({type:'response.cancel'});return this.setMic(true);}
  stopListening(){return this.setMic(false);}
  interrupt(){if(this.connected)this.send({type:'response.cancel'});this.stopListening();this.status('idle',this.connected?'Guide IA prêt':'Guide local');}

  async executeTool(name,args={}){
    if(name==='get_context')return humanContextEngine.build();
    if(name==='open_map')return actionRegistry.execute('ui.open_map',{}, {source:'realtime-tool'});
    if(name==='open_ar')return actionRegistry.execute('ar.open',{}, {source:'realtime-tool'});
    if(name==='explain_current_place')return actionRegistry.execute('place.explain',{}, {source:'realtime-tool'});
    if(name==='continue_route')return actionRegistry.execute('route.next',{}, {source:'realtime-tool'});
    if(name==='propose_skip_current')return proposalManager.create({action:'route.skip',args:{},reason:args.reason||'Demande vocale',summary:'Passer l’étape courante.',requiresConfirmation:true,metadata:{source:'realtime'}});
    if(name==='propose_shorten_route')return plannerEngine.proposeShortening({targetMinutes:Number(args.targetMinutes)||null,removeCount:Number(args.removeCount)||1,reason:args.reason||'Réduire le temps disponible'});
    if(name==='propose_new_route')return plannerEngine.proposeReplacement({prompt:args.prompt,destination:args.destination||'',maxPlaces:Number(args.maxPlaces)||5});
    if(name==='get_preferences')return memoryStore.list();
    if(name==='undo_last_change'){const reply=await import('../core/transaction-manager.js').then(({transactionManager})=>transactionManager.undo());return {ok:Boolean(reply),transaction:reply?.name||null};}
    return {error:`Outil inconnu: ${name}`};
  }

  async handleTool(name,callId,argsText){if(callId&&this.processedCalls.has(callId))return;if(callId)this.processedCalls.add(callId);let result;try{result=await this.executeTool(name,parseArgs(argsText));}catch(error){result={error:String(error?.message||error),tool:name};eventBus.emit('realtime.tool.failed',{tool:name,message:result.error});}this.send({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(result)}});this.sendContext('tool-result');this.send({type:'response.create'});return result;}
  handleEvent(evt){
    if(evt.type==='response.created'){this.status('speaking','Le guide vous répond…');return;}
    if(evt.type==='input_audio_buffer.speech_started'){this.status('listening','Je vous écoute…');return;}
    if(evt.type==='input_audio_buffer.speech_stopped'){this.status('thinking','Je réfléchis…');return;}
    if(evt.type==='conversation.item.input_audio_transcription.completed'&&evt.transcript)this.onText?.('user',evt.transcript);
    if(evt.type==='response.output_audio_transcript.done'&&evt.transcript)this.onText?.('guide',evt.transcript);
    if(evt.type==='response.output_text.done'&&evt.text)this.onText?.('guide',evt.text);
    if(evt.type==='response.done'){this.status(this.listening?'listening':'idle',this.listening?'Je vous écoute…':'Guide IA prêt');return;}
    if(evt.type==='response.function_call_arguments.done')return this.handleTool(evt.name,evt.call_id,evt.arguments);
    if(evt.type==='response.output_item.done'&&evt.item?.type==='function_call')return this.handleTool(evt.item.name,evt.item.call_id,evt.item.arguments);
    if(evt.type==='error'){this.status('error','IA indisponible');eventBus.emit('realtime.error',{message:evt.error?.message||'Erreur Realtime'});}
  }

  async connect({remoteAudio}={}){
    if(this.connected)return true;if(this.connecting)return false;this.connecting=true;this.remoteAudio=remoteAudio||this.remoteAudio;
    try{
      const cfg=await loadConfig();if(!cfg.apiBase)throw new Error('Pont IA non configuré');if(typeof RTCPeerConnection!=='function')throw new Error('WebRTC indisponible');this.status('connecting','Connexion au guide…');
      const pc=new RTCPeerConnection();this.pc=pc;pc.ontrack=event=>{if(this.remoteAudio){this.remoteAudio.srcObject=event.streams[0];this.remoteAudio.play().catch(()=>{});}};pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState)){this.connected=false;this.listening=false;this.status('idle','Guide local');eventBus.emit('realtime.disconnected',{state:pc.connectionState});}};
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});this.stream=stream;stream.getAudioTracks().forEach(track=>{track.enabled=false;pc.addTrack(track,stream);});pocketGuideState.patch({perception:{microphone:'ready'}},{source:'realtime',event:'microphone.ready'});
      const dc=pc.createDataChannel('oai-events');this.dc=dc;dc.onmessage=event=>{try{this.handleEvent(JSON.parse(event.data));}catch{}};dc.onopen=()=>{this.connected=true;this.connecting=false;this.status('idle','Guide IA connecté');this.sendContext('initial');eventBus.emit('realtime.connected',{});};
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);const response=await fetch(`${cfg.apiBase}/v2/realtime/call?voice=${encodeURIComponent(cfg.voice||'marin')}`,{method:'POST',headers:{'Content-Type':'application/sdp'},body:offer.sdp});const answer=await response.text();if(!response.ok)throw new Error(answer||`Realtime ${response.status}`);await pc.setRemoteDescription({type:'answer',sdp:answer});return true;
    }catch(error){this.connecting=false;this.connected=false;this.listening=false;this.status('idle','Guide local');pocketGuideState.patch({diagnostics:{lastError:String(error?.message||error)},perception:{microphone:'error'}},{source:'realtime',event:'realtime.connect.failed'});eventBus.emit('realtime.unavailable',{message:String(error?.message||error)});return false;}
  }

  disconnect(){try{this.dc?.close()}catch{}try{this.pc?.close()}catch{}try{this.stream?.getTracks().forEach(t=>t.stop())}catch{}this.dc=null;this.pc=null;this.stream=null;this.connected=false;this.connecting=false;this.listening=false;this.status('idle','Guide local');}
}

export const realtimeSession=new RealtimeSession();
export {TOOLS};

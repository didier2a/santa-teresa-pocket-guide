import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {humanContextEngine} from '../../pg16/core/context-engine.js';
import {actionRegistry} from '../../pg16/core/action-registry.js';
import {proposalManager} from '../../pg16/core/proposal-manager.js';
import {plannerEngine} from '../../pg16/planner/planner-engine.js';
import {memoryStore} from '../../pg16/memory/memory-store.js';
import {transactionManager} from '../../pg16/core/transaction-manager.js';
import {eventBus} from '../../pg16/core/event-bus.js';

const TOOLS=[
  {type:'function',name:'get_context',description:'Lire le contexte réel PocketGuide : parcours, position mesurée, capteurs, étape, temps restant et proposition.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'show_companion',description:'Afficher la présence principale et la conversation.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'show_journey',description:'Afficher les étapes et la carte du voyage.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'show_memories',description:'Afficher les voyages enregistrés et le carnet audiovisuel.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'explain_current_place',description:'Lire les faits fiables du RoutePack sur le lieu courant.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'continue_route',description:'Valider l’étape courante et poursuivre vers la suivante quand le voyageur le demande.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'propose_skip_current',description:'Proposer de passer l’étape courante sans modifier le parcours avant confirmation.',parameters:{type:'object',properties:{reason:{type:'string'}},additionalProperties:false}},
  {type:'function',name:'propose_shorten_route',description:'Proposer de raccourcir le parcours en préservant les incontournables.',parameters:{type:'object',properties:{targetMinutes:{type:'integer',minimum:15,maximum:480},removeCount:{type:'integer',minimum:1,maximum:6},reason:{type:'string'}},additionalProperties:false}},
  {type:'function',name:'create_excursion',description:'Préparer un nouveau RoutePack vérifié. Toute destination nommée par le voyageur est prioritaire. Pour ici ou autour de moi, utiliser uniquement la position fournie par PocketGuide.',parameters:{type:'object',properties:{prompt:{type:'string'},destination:{type:'string'},maxPlaces:{type:'integer',minimum:3,maximum:10}},required:['prompt'],additionalProperties:false}},
  {type:'function',name:'preview_journey',description:'Ouvrir la simulation photographique du voyage actif sans modifier sa progression.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'open_geo_ar',description:'Demander la vue Geo-AR. La caméra doit rester soumise à un geste et une permission explicites.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'look_with_me',description:'Proposer au voyageur d’ouvrir ponctuellement la caméra pour montrer ce qu’il regarde.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'research_tourist_question',description:'Vérifier une question touristique complexe ou actuelle avec le chercheur de haut niveau. À utiliser pour horaires actuels, histoire incertaine, comparaison détaillée ou information extérieure au RoutePack.',parameters:{type:'object',properties:{question:{type:'string'}},required:['question'],additionalProperties:false}},
  {type:'function',name:'open_journal',description:'Ouvrir le carnet audiovisuel local du voyage actif.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'get_preferences',description:'Lire uniquement les préférences explicitement mémorisées.',parameters:{type:'object',properties:{},additionalProperties:false}},
  {type:'function',name:'undo_last_change',description:'Annuler le dernier changement structurel encore annulable.',parameters:{type:'object',properties:{},additionalProperties:false}}
];

let configPromise=null;
async function loadConfig(){
  if(!configPromise)configPromise=fetch('./data/v2-companion-config.json',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject(new Error(`Configuration V2 indisponible (${response.status})`)));
  return configPromise;
}
function parseArgs(value){try{return JSON.parse(value||'{}')}catch{return {}}}
function companionInstructions(){return `Tu es PocketGuide V2, un compagnon humain de voyage vocal et audiovisuel. Tu es chaleureux, cultivé, élégant, attentif et jamais envahissant. Pendant la marche, réponds en une ou deux phrases utiles; développe seulement sur demande. Parle en français naturel. Tu peux être interrompu et tu reprends sans répéter inutilement.

Tu es l’orchestrateur de l’application mais tu ne dois jamais inventer une position, une distance, une direction, un état de capteur, une étape, un horaire ou un fait RoutePack. Les données structurées PocketGuide sont prioritaires. Si une information manque, dis-le simplement. Utilise les outils pour afficher les vues et agir. Un changement de parcours doit rester une proposition jusqu’à confirmation explicite. Une image personnelle n’est analysée que lorsque l’utilisateur choisit explicitement de te la transmettre. Ne prétends jamais voir lorsque la caméra est fermée.

Quand le voyageur demande une nouvelle excursion, la destination qu’il nomme devient la destination du Planner. L’ancien voyage n’est jamais une destination implicite. Pour « ici » ou « autour de moi », utilise seulement l’origine GPS du contexte, si elle existe. Présente-toi toujours comme la même présence, même lorsque certaines capacités en ligne sont indisponibles.`;}

export class RealtimeCompanion{
  constructor(){
    this.pc=null;this.dc=null;this.stream=null;this.remoteAudio=null;this.connected=false;this.connecting=false;this.listening=false;this.processedCalls=new Set();this.connectionTimer=null;this.connectPromise=null;this.onTurn=null;this.onStatus=null;this.transcript='';this.model=null;this.lastError=null;
  }
  status(value,label,detail={}){
    pocketGuideState.patch({conversation:{status:value},connectivity:{realtime:this.connected}},{source:'pg2-realtime',event:`companion.${value}`});
    const payload={value,label:label||value,connected:this.connected,listening:this.listening,model:this.model,...detail};
    this.onStatus?.(payload);eventBus.emit('companion.status',payload);return payload;
  }
  send(payload){if(this.dc?.readyState!=='open')return false;this.dc.send(JSON.stringify(payload));return true;}
  sessionUpdate(reason='initial'){
    if(!this.connected)return false;
    const context=humanContextEngine.build();
    return this.send({type:'session.update',session:{type:'realtime',instructions:`${companionInstructions()}\n\nContexte PocketGuide (${reason}) : ${JSON.stringify(context)}`,tools:TOOLS,tool_choice:'auto',reasoning:{effort:'low'},audio:{input:{noise_reduction:{type:'near_field'},transcription:{model:'gpt-4o-mini-transcribe',language:'fr'},turn_detection:{type:'semantic_vad',create_response:true,interrupt_response:true}},output:{voice:'marin'}}}});
  }
  sendContext(reason='terrain'){return this.sessionUpdate(reason);}
  ask(text){
    const value=String(text||'').trim();if(!value||!this.connected)return false;
    this.sendContext('question écrite');
    this.send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:value}]}});
    return this.send({type:'response.create',response:{instructions:'Réponds comme le compagnon PocketGuide : naturel, précis et adapté à la marche.'}});
  }
  announce(text){
    const value=String(text||'').trim();if(!value||!this.connected)return false;
    return this.send({type:'response.create',response:{instructions:`Prononce cette indication utile en français, sans préambule et sans ajouter d’information : ${JSON.stringify(value)}`}});
  }
  askWithImage(dataUrl,prompt='Qu’est-ce que je regarde ?'){
    if(!this.connected||!/^data:image\//.test(String(dataUrl||'')))return false;
    this.sendContext('vision ponctuelle explicitement autorisée');
    this.send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:String(prompt)},{type:'input_image',image_url:dataUrl}]}});
    return this.send({type:'response.create',response:{instructions:'Décris prudemment ce qui est observable, croise-le avec le contexte GPS et RoutePack, puis distingue clairement observation et information historique.'}});
  }
  requestGreeting(){return this.send({type:'response.create',response:{instructions:'Salue le voyageur en une seule phrase chaleureuse. Dis que tu es avec lui et prêt à écouter, sans énumérer tes fonctions.'}});}
  setMic(enabled){
    this.listening=Boolean(enabled&&this.connected);
    try{this.stream?.getAudioTracks().forEach(track=>{track.enabled=this.listening;});}catch{}
    this.status(this.listening?'listening':'ready',this.listening?'Je vous écoute':'Je suis avec vous');
    return this.listening;
  }
  beginListening(){if(!this.connected)return false;return this.setMic(true);}
  stopListening(){return this.setMic(false);}
  interrupt(){if(this.connected)this.send({type:'response.cancel'});return this.stopListening();}

  async executeTool(name,args={}){
    if(name==='get_context')return humanContextEngine.build();
    if(name==='show_companion')return actionRegistry.execute('ui.open_companion',{}, {source:'companion-tool'});
    if(name==='show_journey')return actionRegistry.execute('ui.open_journey',{}, {source:'companion-tool'});
    if(name==='show_memories')return actionRegistry.execute('ui.open_memories',{}, {source:'companion-tool'});
    if(name==='explain_current_place')return actionRegistry.execute('place.explain',{}, {source:'companion-tool'});
    if(name==='continue_route')return actionRegistry.execute('route.next',{}, {source:'companion-tool'});
    if(name==='propose_skip_current')return proposalManager.create({action:'route.skip',args:{},reason:args.reason||'Demande du voyageur',summary:'Passer l’étape actuelle et poursuivre.',requiresConfirmation:true,metadata:{source:'companion'}});
    if(name==='propose_shorten_route')return plannerEngine.proposeShortening({targetMinutes:Number(args.targetMinutes)||null,removeCount:Number(args.removeCount)||1,reason:args.reason||'Adapter la durée'});
    if(name==='create_excursion')return plannerEngine.proposeReplacement({prompt:args.prompt,destination:args.destination||'',maxPlaces:Number(args.maxPlaces)||5});
    if(name==='preview_journey')return actionRegistry.execute('ui.open_preview',{}, {source:'companion-tool'});
    if(name==='open_geo_ar')return actionRegistry.execute('ar.open',{}, {source:'companion-tool'});
    if(name==='look_with_me')return actionRegistry.execute('ui.request_vision',{}, {source:'companion-tool'});
    if(name==='research_tourist_question'){
      const config=await loadConfig(),route=pocketGuideState.select('route'),event=(route?.pack?.days||[]).flatMap(day=>day.events||[]).find(item=>item.id===route?.currentEventId),place=(route?.pack?.places||[]).find(item=>item.id===event?.placeId);
      const response=await fetch(`${String(config.apiBase).replace(/\/$/,'')}/v2/guide/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:String(args.question||''),context:{routeTitle:route?.title||'',currentPlace:place?.name||'',destination:route?.pack?.title||''}})}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.error||`Recherche touristique ${response.status}`);return payload;
    }
    if(name==='open_journal')return actionRegistry.execute('ui.open_journal',{}, {source:'companion-tool'});
    if(name==='get_preferences')return memoryStore.list();
    if(name==='undo_last_change')return transactionManager.undo()||{ok:false,reason:'nothing_to_undo'};
    return {error:`Outil inconnu : ${name}`};
  }
  async handleTool(name,callId,argsText){
    if(callId&&this.processedCalls.has(callId))return;if(callId)this.processedCalls.add(callId);
    let result;
    try{result=await this.executeTool(name,parseArgs(argsText));}
    catch(error){result={error:String(error?.message||error),tool:name};eventBus.emit('companion.tool.failed',result);}
    this.send({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(result)}});
    this.sendContext('résultat outil');this.send({type:'response.create'});return result;
  }
  handleEvent(event){
    const type=event?.type||'';
    if(type==='input_audio_buffer.speech_started'){if(pocketGuideState.select('conversation.status')==='speaking')this.send({type:'response.cancel'});this.status('listening','Je vous écoute');return;}
    if(type==='input_audio_buffer.speech_stopped'){this.status('thinking','Je réfléchis');return;}
    if(type==='conversation.item.input_audio_transcription.completed'&&event.transcript)this.onTurn?.('user',event.transcript.trim(),{source:'voice'});
    if(type==='response.created'){this.transcript='';this.status('speaking','Je vous réponds');return;}
    if(type==='response.output_audio_transcript.delta'){this.transcript+=event.delta||'';return;}
    if(type==='response.output_audio_transcript.done'){
      const text=String(event.transcript||this.transcript||'').trim();this.transcript='';if(text)this.onTurn?.('companion',text,{source:'realtime'});return;
    }
    if(type==='response.output_text.done'&&event.text)this.onTurn?.('companion',String(event.text).trim(),{source:'realtime-text'});
    if(type==='response.done'){this.status(this.listening?'listening':'ready',this.listening?'Je vous écoute':'Je suis avec vous');return;}
    if(type==='response.function_call_arguments.done')return this.handleTool(event.name,event.call_id,event.arguments);
    if(type==='response.output_item.done'&&event.item?.type==='function_call')return this.handleTool(event.item.name,event.item.call_id,event.item.arguments);
    if(type==='error'){
      this.lastError=event.error?.message||'Erreur du compagnon';this.status('error','Je n’ai pas bien reçu cela',{message:this.lastError});eventBus.emit('companion.realtime.error',{message:this.lastError});
    }
  }
  async connect({remoteAudio,autoListen=false}={}){
    if(this.connected){if(autoListen)this.beginListening();return true;}
    if(this.connectPromise)return this.connectPromise;
    this.connecting=true;this.remoteAudio=remoteAudio||this.remoteAudio;this.status('connecting','Je vous rejoins…');
    this.connectPromise=(async()=>{
      try{
        const config=await loadConfig();this.model=config.companionModel||'gpt-realtime-2.1-mini';
        if(!config.apiBase)throw new Error('Service vocal non configuré');
        if(typeof RTCPeerConnection!=='function'||!navigator.mediaDevices?.getUserMedia)throw new Error('Conversation vocale non prise en charge par ce navigateur');
        const pc=new RTCPeerConnection();this.pc=pc;
        pc.ontrack=event=>{if(!this.remoteAudio)return;this.remoteAudio.srcObject=event.streams[0];this.remoteAudio.play().catch(error=>{eventBus.emit('companion.audio.blocked',{message:String(error?.message||error)});this.status('degraded','Touchez pour entendre ma voix');});};
        const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});this.stream=stream;
        stream.getAudioTracks().forEach(track=>{track.enabled=false;pc.addTrack(track,stream);});
        pocketGuideState.patch({perception:{microphone:'ready'}},{source:'pg2-realtime',event:'microphone.ready'});
        const channel=pc.createDataChannel('oai-events');this.dc=channel;
        channel.onmessage=message=>{try{this.handleEvent(JSON.parse(message.data));}catch(error){eventBus.emit('companion.event.invalid',{message:String(error?.message||error)});}};
        const opened=new Promise((resolve,reject)=>{
          const timeout=Math.max(5000,Number(config.connectionTimeoutMs)||15000);
          this.connectionTimer=setTimeout(()=>reject(new Error('Le canal vocal met trop de temps à répondre')),timeout);
          channel.onopen=()=>resolve(true);
          channel.onerror=()=>reject(new Error('Le canal vocal a rencontré une erreur'));
          channel.onclose=()=>{if(this.connected)this.markDisconnected('Le canal vocal est fermé');};
          pc.onconnectionstatechange=()=>{
            if(['failed','disconnected','closed'].includes(pc.connectionState)){
              if(!this.connected)reject(new Error(`Connexion vocale ${pc.connectionState}`));else this.markDisconnected(`Connexion vocale ${pc.connectionState}`);
            }
          };
        });
        const offer=await pc.createOffer();await pc.setLocalDescription(offer);
        const endpoint=`${String(config.apiBase).replace(/\/$/,'')}/v2/realtime/call?model=${encodeURIComponent(this.model)}&voice=${encodeURIComponent(config.voice||'marin')}`;
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/sdp'},body:offer.sdp});
        const answer=await response.text();if(!response.ok)throw new Error(answer||`Service vocal ${response.status}`);
        await pc.setRemoteDescription({type:'answer',sdp:answer});await opened;
        clearTimeout(this.connectionTimer);this.connectionTimer=null;this.connected=true;this.connecting=false;this.lastError=null;
        this.sessionUpdate('première rencontre');this.status('ready','Je suis avec vous');eventBus.emit('companion.realtime.connected',{model:this.model});
        this.requestGreeting();if(autoListen)this.beginListening();return true;
      }catch(error){
        this.lastError=String(error?.message||error);this.connecting=false;this.connected=false;this.listening=false;this.cleanupTransport();
        pocketGuideState.patch({perception:{microphone:'error'},connectivity:{realtime:false},diagnostics:{lastError:this.lastError}},{source:'pg2-realtime',event:'companion.realtime.unavailable'});
        this.status('degraded','Je poursuis avec votre voyage',{message:this.lastError});eventBus.emit('companion.realtime.unavailable',{message:this.lastError});return false;
      }finally{this.connectPromise=null;}
    })();
    return this.connectPromise;
  }
  markDisconnected(message='Connexion interrompue'){
    this.connected=false;this.connecting=false;this.listening=false;this.lastError=message;
    pocketGuideState.patch({connectivity:{realtime:false}},{source:'pg2-realtime',event:'companion.realtime.disconnected'});
    this.status('degraded','Je poursuis avec votre voyage',{message});eventBus.emit('companion.realtime.disconnected',{message});
  }
  cleanupTransport(){
    if(this.connectionTimer)clearTimeout(this.connectionTimer);this.connectionTimer=null;
    try{this.dc?.close()}catch{}try{this.pc?.close()}catch{}try{this.stream?.getTracks().forEach(track=>track.stop())}catch{}
    this.dc=null;this.pc=null;this.stream=null;
  }
  disconnect(){this.cleanupTransport();this.connected=false;this.connecting=false;this.listening=false;this.status('degraded','Je poursuis avec votre voyage');}
}

export const realtimeCompanion=new RealtimeCompanion();
export {TOOLS,companionInstructions,loadConfig};

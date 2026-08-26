import {eventBus} from '../../pg16/core/event-bus.js';
import {itineraryStore} from '../../pg18/storage/itinerary-store.js';

const DB_NAME='pocketguide-v22-audio';
const STORE='clips';
export const UNIFIED_VOICE='marin';

function requestResult(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('AudioPack indisponible'));});}
function transactionDone(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error||new Error('Écriture AudioPack impossible'));transaction.onabort=()=>reject(transaction.error||new Error('Écriture AudioPack annulée'));});}
function hashFallback(value){let hash=2166136261;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
export async function textFingerprint(text,voice=UNIFIED_VOICE){const value=`${voice}\n${String(text||'').trim()}`;if(globalThis.crypto?.subtle){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,24);}return hashFallback(value);}

export class MemoryAudioPackStore{
  constructor(){this.items=new Map();}
  async put(value){this.items.set(value.id,value);return value;}
  async get(id){return this.items.get(id)||null;}
  async list(routeId){return [...this.items.values()].filter(item=>!routeId||item.routeId===routeId);}
  async clear(routeId){for(const [id,item] of this.items)if(!routeId||item.routeId===routeId)this.items.delete(id);}
}

export class IndexedDbAudioPackStore{
  constructor({indexedDB=globalThis.indexedDB}={}){this.indexedDB=indexedDB;this.promise=null;}
  open(){if(this.promise)return this.promise;if(!this.indexedDB)throw new Error('IndexedDB audio indisponible');this.promise=new Promise((resolve,reject)=>{const request=this.indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE)){const store=db.createObjectStore(STORE,{keyPath:'id'});store.createIndex('routeId','routeId');}};request.onsuccess=()=>resolve(request.result);request.onerror=()=>{this.promise=null;reject(request.error||new Error('AudioPack impossible à ouvrir'));};});return this.promise;}
  async put(value){const db=await this.open(),tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value);await transactionDone(tx);return value;}
  async get(id){const db=await this.open(),tx=db.transaction(STORE,'readonly');return requestResult(tx.objectStore(STORE).get(id));}
  async list(routeId){const db=await this.open(),tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE);return requestResult(routeId?store.index('routeId').getAll(routeId):store.getAll());}
  async clear(routeId){const db=await this.open(),tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);if(!routeId)store.clear();else{const request=store.index('routeId').openCursor(IDBKeyRange.only(routeId));request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};}await transactionDone(tx);}
}

export class UnifiedAudioBus{
  constructor({onLevel}={}){this.onLevel=onLevel||null;this.context=null;this.sources=new WeakMap();this.streamBindings=new WeakMap();this.analysers=[];this.frame=0;this.forcedSilent=false;this.idleFrames=0;this.lastSampleAt=0;}
  ensureContext(){const AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContextClass)return null;this.context=this.context||new AudioContextClass();return this.context;}
  analyser(){const analyser=this.context.createAnalyser();analyser.fftSize=256;return analyser;}
  resume(){this.context?.resume?.().catch(()=>{});this.start();}
  register(channel){this.sources.set(channel.element,channel);this.analysers.push(channel);this.start();eventBus.emit('pg22.audio.analyser.attached',{mode:channel.mode,contextState:this.context?.state||'unknown'});return true;}
  attach(element){if(!element||this.sources.has(element))return false;try{if(!this.ensureContext())return false;const source=this.context.createMediaElementSource(element),analyser=this.analyser();source.connect(analyser);analyser.connect(this.context.destination);const resume=()=>this.resume();element.addEventListener('play',resume);element.addEventListener('playing',resume);return this.register({element,source,analyser,data:new Uint8Array(analyser.frequencyBinCount),resume,mode:'media-element'});}catch(error){eventBus.emit('pg22.audio.analyser.unavailable',{mode:'media-element',message:String(error?.message||error)});return false;}}
  attachRemote(element){
    if(!element||this.streamBindings.has(element))return false;try{if(!this.ensureContext())return false;const connect=()=>{this.resume();const stream=element.srcObject;if(!stream||this.sources.get(element)?.stream===stream)return Boolean(stream);const previous=this.sources.get(element);if(previous){this.analysers=this.analysers.filter(item=>item!==previous);try{previous.source.disconnect();}catch{}}try{const source=this.context.createMediaStreamSource(stream),analyser=this.analyser();source.connect(analyser);return this.register({element,stream,source,analyser,data:new Uint8Array(analyser.frequencyBinCount),mode:'media-stream'});}catch(error){eventBus.emit('pg22.audio.analyser.unavailable',{mode:'media-stream',message:String(error?.message||error)});return false;}};for(const type of ['loadedmetadata','play','playing'])element.addEventListener(type,connect);this.streamBindings.set(element,{connect});connect();this.start();return true;}catch(error){eventBus.emit('pg22.audio.analyser.unavailable',{mode:'media-stream-binding',message:String(error?.message||error)});return false;}
  }
  start(){if(this.frame||typeof globalThis.requestAnimationFrame!=='function')return;this.idleFrames=0;const tick=timestamp=>{let level=0,active=false;if(!this.forcedSilent&&timestamp-this.lastSampleAt>=33){this.lastSampleAt=timestamp;for(const channel of this.analysers){const playing=channel.mode==='media-stream'?Boolean(channel.stream?.active&&!channel.element.paused):!channel.element.paused&&!channel.element.ended;if(!playing)continue;active=true;channel.analyser.getByteTimeDomainData(channel.data);let sum=0;for(const sample of channel.data){const value=(sample-128)/128;sum+=value*value;}level=Math.max(level,Math.sqrt(sum/channel.data.length));}this.onLevel?.(Math.min(1,level*7));}else active=this.analysers.some(channel=>channel.mode==='media-stream'?Boolean(channel.stream?.active&&!channel.element.paused):!channel.element.paused&&!channel.element.ended);this.idleFrames=active?0:this.idleFrames+1;if(this.idleFrames>=30){this.frame=0;this.onLevel?.(0);return;}this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);}
  silence(){this.forcedSilent=true;this.onLevel?.(0);queueMicrotask(()=>{this.forcedSilent=false;});}
  destroy(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.onLevel?.(0);}
}

export function narrationEntries(pack){
  const routeId=pack?.id||'route',entries=[{key:'route-intro',routeId,eventId:null,text:`Votre excursion « ${pack?.title||'PocketGuide'} » est prête. ${pack?.subtitle||''}`.trim()}];
  for(const place of pack?.places||[]){const text=String(place.historyShort||place.description||place.name||'').trim();if(text)entries.push({key:`place-${place.id}`,routeId,eventId:place.id,text});}
  return entries.slice(0,11);
}

export class UnifiedVoiceService{
  constructor({store,fetchImpl=globalThis.fetch,strict=true,voice=UNIFIED_VOICE}={}){this.store=store||(globalThis.indexedDB?new IndexedDbAudioPackStore():new MemoryAudioPackStore());this.fetchImpl=fetchImpl;this.strict=strict;this.voice=voice;this.apiBase='';this.ttsEndpoint='';this.model='gpt-4o-mini-tts';this.guideAudio=null;this.bus=null;this.currentUrl='';this.continuityFallback=false;this.playing=false;this.playbackStartedAt=null;this.unlockHandler=null;}
  async configure(){if(this.ttsEndpoint||this.apiBase)return this;try{const response=await this.fetchImpl('./data/v22-config.json',{cache:'no-store'}),config=await response.json();this.apiBase=String(config.apiBase||'').replace(/\/$/,'');this.ttsEndpoint=String(config.ttsEndpoint||'').trim();this.model=config.ttsModel||this.model;this.voice=config.voice||UNIFIED_VOICE;this.strict=config.offlineAudioMode!=='continuity';this.continuityFallback=config.offlineAudioMode==='continuity';}catch{}return this;}
  install({voiceController,guideAudio,remoteAudio,onLevel}={}){this.guideAudio=guideAudio||this.guideAudio;this.bus=new UnifiedAudioBus({onLevel});this.bus.attach(this.guideAudio);this.bus.attachRemote(remoteAudio);this.unlockHandler=()=>this.unlock();globalThis.document?.addEventListener?.('pointerdown',this.unlockHandler,{capture:true,passive:true});globalThis.document?.addEventListener?.('keydown',this.unlockHandler,{capture:true});if(voiceController){const stopLocalInput=voiceController.interrupt.bind(voiceController);voiceController.speak=text=>{void this.speak(text);};voiceController.interrupt=()=>{this.interrupt();stopLocalInput();};}return this;}
  unlock(){this.bus?.ensureContext?.();this.bus?.resume?.();return this.bus?.context?.state==='running';}
  async clipId(text){return `marin-${await textFingerprint(text,this.voice)}`;}
  async synthesize(text,{routeId='adhoc',key='narration',signal}={}){
    const value=String(text||'').trim();if(!value)throw new Error('Texte vocal vide');await this.configure();const id=await this.clipId(value),cached=await this.store.get(id);if(cached?.blob)return cached;if((!this.ttsEndpoint&&!this.apiBase)||typeof this.fetchImpl!=='function')throw new Error('Service vocal marin indisponible');
    const endpoint=this.ttsEndpoint||`${this.apiBase}/v2/speech`,vercel=/\/api\/tts(?:\?|$)/.test(endpoint),payload=vercel?{input:value,voice:this.voice,model:this.model,instructions:'Voix française chaleureuse, cultivée et naturelle de la même accompagnatrice PocketGuide. Diction claire, élégante, jamais théâtrale.'}:{text:value,voice:this.voice,model:this.model,format:'mp3'};
    const response=await this.fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});if(!response.ok){let error={};try{error=await response.json();}catch{}throw new Error(error.error||`Voix marin ${response.status}`);}const blob=await response.blob();if(!blob.size)throw new Error('Clip vocal vide');
    const clip={id,routeId,key,text:value,voice:this.voice,model:this.model,mimeType:blob.type||'audio/mpeg',bytes:blob.size,createdAt:new Date().toISOString(),blob};await this.store.put(clip);eventBus.emit('pg22.audio.cached',{id,routeId,key,bytes:blob.size});return clip;
  }
  async prepare(pack,{signal,onProgress}={}){
    const entries=narrationEntries(pack),clips=[],failures=[];
    for(let index=0;index<entries.length;index+=1){if(signal?.aborted)throw new DOMException('Préparation annulée','AbortError');const entry=entries[index];try{const clip=await this.synthesize(entry.text,{...entry,signal});clips.push({...entry,id:clip.id,voice:clip.voice,model:clip.model,mimeType:clip.mimeType,bytes:clip.bytes,available:true});}catch(error){if(error?.name==='AbortError')throw error;failures.push({key:entry.key,message:String(error?.message||error)});clips.push({...entry,voice:this.voice,model:this.model,available:false});}onProgress?.({index:index+1,total:entries.length,entry,clips:[...clips],failures:[...failures]});}
    pack.audioPack={schemaVersion:'1.0',voice:this.voice,model:this.model,mode:'local-cache',status:failures.length?clips.some(item=>item.available)?'partial':'unavailable':'complete',generatedAt:new Date().toISOString(),clips,failures};return pack.audioPack;
  }
  async speak(text,{routeId='adhoc',key='narration'}={}){
    const value=String(text||'').trim();if(!value)return {spoken:false,reason:'empty'};let clip;try{clip=await this.synthesize(value,{routeId,key});}catch(error){eventBus.emit('pg22.audio.text-only',{text:value,message:String(error?.message||error),strict:this.strict});if(!this.strict&&this.continuityFallback&&'speechSynthesis'in globalThis){const utterance=new SpeechSynthesisUtterance(value);utterance.lang='fr-FR';speechSynthesis.cancel();speechSynthesis.speak(utterance);return {spoken:true,mode:'continuity-browser'};}return {spoken:false,mode:'strict-text',error};}
    if(!this.guideAudio)return {spoken:false,mode:'cached-no-player'};this.interrupt();this.unlock();this.currentUrl=URL.createObjectURL(clip.blob);this.guideAudio.src=this.currentUrl;this.guideAudio.preload='auto';this.guideAudio.onended=()=>{this.playing=false;this.releaseUrl();eventBus.emit('pg22.audio.ended',{id:clip.id,source:'tts'});};this.guideAudio.onplaying=()=>{this.playing=true;this.playbackStartedAt=globalThis.performance?.now?.()||Date.now();eventBus.emit('pg22.audio.playing',{id:clip.id,currentTime:this.guideAudio.currentTime,source:'tts'});};this.guideAudio.ontimeupdate=()=>eventBus.emit('pg22.audio.progress',{id:clip.id,currentTime:this.guideAudio.currentTime,duration:Number.isFinite(this.guideAudio.duration)?this.guideAudio.duration:null,source:'tts'});
    try{await this.guideAudio.play();}catch(error){this.playing=false;this.releaseUrl();eventBus.emit('pg22.audio.play.failed',{id:clip.id,message:String(error?.message||error),source:'tts'});return{spoken:false,mode:'playback-blocked',error,clip};}eventBus.emit('pg22.audio.started',{id:clip.id,routeId:clip.routeId,voice:clip.voice,text:value,source:'tts'});return {spoken:true,mode:'marin',clip};
  }
  interrupt(){try{this.guideAudio?.pause();if(this.guideAudio)this.guideAudio.currentTime=0;}catch{}this.playing=false;this.releaseUrl();this.bus?.silence();try{if(!this.strict)speechSynthesis?.cancel();}catch{}eventBus.emit('pg22.audio.interrupted',{});}
  playbackSnapshot(){return{voice:this.voice,model:this.model,playing:this.playing,currentTime:Number(this.guideAudio?.currentTime)||0,duration:Number.isFinite(this.guideAudio?.duration)?this.guideAudio.duration:null,hasSource:Boolean(this.guideAudio?.src),contextState:this.bus?.context?.state||'unavailable',startedAt:this.playbackStartedAt};}
  releaseUrl(){if(this.currentUrl)try{URL.revokeObjectURL(this.currentUrl);}catch{}this.currentUrl='';}
  async attachToItinerary(routeId,itineraryId){if(!routeId||!itineraryId)return 0;const clips=await this.store.list(routeId);for(const clip of clips)await itineraryStore.saveMedia({id:`audio-${clip.id}-${itineraryId}`,itineraryId,eventId:clip.eventId||null,kind:'guide-audio',caption:clip.text,capturedAt:clip.createdAt,voice:clip.voice,model:clip.model,blob:clip.blob,thumbnail:null,voiceNote:null,source:'pocketguide-v22-audiopack'});return clips.length;}
  async hydrateItinerary(itineraryId,routeId){const media=await itineraryStore.listMedia(itineraryId),clips=media.filter(item=>item.kind==='guide-audio'&&item.blob);for(const item of clips){const id=String(item.id).replace(/^audio-/,'').replace(`-${itineraryId}`,'');await this.store.put({id,routeId,key:item.eventId?`place-${item.eventId}`:'route-intro',eventId:item.eventId||null,text:item.caption||'',voice:item.voice||this.voice,model:item.model||this.model,mimeType:item.blob.type,bytes:item.blob.size,createdAt:item.capturedAt,blob:item.blob});}return clips.length;}
}

export const unifiedVoiceService=new UnifiedVoiceService();
export {DB_NAME as AUDIO_DB_NAME,STORE as AUDIO_STORE};

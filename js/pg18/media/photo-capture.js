import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {itineraryStore} from '../storage/itinerary-store.js';

const MAX_EDGE=1600;
const THUMB_EDGE=480;
const JPEG_QUALITY=.82;
const THUMB_QUALITY=.72;

function finite(value){if(value==null||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function now(){return new Date().toISOString();}
function mediaId(){return `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;}
export function fitWithin(width,height,maxEdge){const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1),scale=Math.min(1,Math.max(1,Number(maxEdge)||1)/Math.max(w,h));return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale)),scale};}
export function resolveAssociation(choice,{currentEventId=null,nextEventId=null}={}){if(choice==='next')return {type:'poi',eventId:nextEventId||currentEventId||null};if(choice==='segment')return {type:'segment',eventId:currentEventId||null,nextEventId:nextEventId||null};return {type:'poi',eventId:currentEventId||nextEventId||null};}

function canvasBlob(canvas,type='image/jpeg',quality=JPEG_QUALITY){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Impossible de compresser la photographie.')),type,quality));}
async function bitmapFor(blob){if(globalThis.createImageBitmap)return createImageBitmap(blob);return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(blob);image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Photographie illisible.'));};image.src=url;});}
async function resizeBitmap(bitmap,maxEdge,quality){const size=fitWithin(bitmap.width,bitmap.height,maxEdge),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const context=canvas.getContext('2d',{alpha:false});context.drawImage(bitmap,0,0,size.width,size.height);const blob=await canvasBlob(canvas,'image/jpeg',quality);bitmap.close?.();return {blob,width:size.width,height:size.height};}

export async function normalizePhoto(blob,{maxEdge=MAX_EDGE,thumbEdge=THUMB_EDGE}={}){
  if(!(blob instanceof Blob)||!blob.size)throw new Error('Aucune photographie à enregistrer.');
  if(!globalThis.document)return {blob,thumbnail:blob,width:null,height:null,originalType:blob.type||'',originalBytes:blob.size,bytes:blob.size,thumbnailBytes:blob.size};
  const original=await bitmapFor(blob),main=await resizeBitmap(original,maxEdge,JPEG_QUALITY),thumbSource=await bitmapFor(main.blob),thumb=await resizeBitmap(thumbSource,thumbEdge,THUMB_QUALITY);
  return {blob:main.blob,thumbnail:thumb.blob,width:main.width,height:main.height,originalType:blob.type||'',originalBytes:blob.size,bytes:main.blob.size,thumbnailBytes:thumb.blob.size};
}

export function captureMetadata({itineraryId,association='current',caption='',location=pocketGuideState.select('location'),route=pocketGuideState.select('route'),capturedAt=now()}={}){
  const currentEventId=route?.currentEventId||null,nextEventId=route?.nextEventId||null,resolved=resolveAssociation(association,{currentEventId,nextEventId});
  return {id:mediaId(),itineraryId:itineraryId||route?.activeId||route?.pack?.id||null,kind:'photo',source:'personal-camera',capturedAt,caption:String(caption||'').trim(),association:resolved,eventId:resolved.eventId||null,nextEventId:resolved.nextEventId||null,poiId:(route?.pack?.days||[]).flatMap(day=>day.events||[]).find(event=>event.id===resolved.eventId)?.placeId||null,location:{lat:finite(location?.lat),lng:finite(location?.lng),accuracy:finite(location?.accuracy),heading:finite(location?.heading),measuredAt:location?.updatedAt||capturedAt}};
}

export async function savePersonalPhoto(input,{store=itineraryStore,itineraryId,association='current',caption='',location,route,voiceNote=null}={}){
  const normalized=await normalizePhoto(input),metadata=captureMetadata({itineraryId,association,caption,location,route});if(!metadata.itineraryId)throw new Error('Aucun itinéraire actif pour cette photographie.');
  const estimate=await store.storageEstimate();if(estimate.quota&&estimate.usage+normalized.bytes+normalized.thumbnailBytes>estimate.quota*.94)throw new Error('Stockage local presque plein. Exportez un voyage avant d’ajouter cette photo.');
  const record={...metadata,...normalized,voiceNote:voiceNote instanceof Blob?voiceNote:null};await store.saveMedia(record);eventBus.emit('media.personal.saved',{itineraryId:record.itineraryId,mediaId:record.id,eventId:record.eventId});return record;
}

export async function captureVideoFrame(video){
  if(!video||video.readyState<2||!video.videoWidth)throw new Error('La caméra AR n’est pas prête.');
  const size=fitWithin(video.videoWidth,video.videoHeight,MAX_EDGE),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,size.width,size.height);return canvasBlob(canvas,'image/jpeg',JPEG_QUALITY);
}

export class LocalVoiceNoteRecorder{
  constructor(){this.stream=null;this.recorder=null;this.chunks=[];}
  async start(){if(!globalThis.MediaRecorder||!navigator.mediaDevices?.getUserMedia)throw new Error('Note vocale indisponible sur cet appareil.');this.stream=await navigator.mediaDevices.getUserMedia({audio:true});this.chunks=[];this.recorder=new MediaRecorder(this.stream);this.recorder.ondataavailable=event=>{if(event.data?.size)this.chunks.push(event.data);};this.recorder.start();return true;}
  async stop(){if(!this.recorder)return null;const recorder=this.recorder;return new Promise(resolve=>{recorder.onstop=()=>{const blob=new Blob(this.chunks,{type:recorder.mimeType||'audio/webm'});this.stream?.getTracks?.().forEach(track=>track.stop());this.stream=null;this.recorder=null;this.chunks=[];resolve(blob);};recorder.stop();});}
  cancel(){if(this.recorder?.state==='recording')this.recorder.stop();this.stream?.getTracks?.().forEach(track=>track.stop());this.stream=null;this.recorder=null;this.chunks=[];}
}

export const PHOTO_LIMITS=Object.freeze({MAX_EDGE,THUMB_EDGE,JPEG_QUALITY,THUMB_QUALITY});

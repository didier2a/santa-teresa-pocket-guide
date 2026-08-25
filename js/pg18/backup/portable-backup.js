import {itineraryStore} from '../storage/itinerary-store.js';
import {safeId} from '../itineraries/itinerary-manager.js';

const BUNDLE_SCHEMA='pocketguide.backup/v1';
const MAX_IMPORT_BYTES=160*1024*1024;

function clone(value){return typeof globalThis.structuredClone==='function'?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));}
function bytesToBase64(bytes){let binary='';const chunk=0x8000;for(let index=0;index<bytes.length;index+=chunk)binary+=String.fromCharCode(...bytes.subarray(index,index+chunk));return btoa(binary);}
function base64ToBytes(value){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);return bytes;}

export async function blobToDataUrl(blob){if(!(blob instanceof Blob))return null;const bytes=new Uint8Array(await blob.arrayBuffer());return `data:${blob.type||'application/octet-stream'};base64,${bytesToBase64(bytes)}`;}
export function dataUrlToBlob(value){const match=String(value||'').match(/^data:([^;,]*)(?:;base64)?,(.*)$/s);if(!match)throw new Error('Média encodé invalide.');return new Blob([base64ToBytes(match[2])],{type:match[1]||'application/octet-stream'});}
function validRoutePack(pack){return Boolean(pack?.id&&pack?.title&&Array.isArray(pack?.places)&&Array.isArray(pack?.days)&&pack.days.every(day=>Array.isArray(day?.events)));}

export async function createPortableBundle(id,{store=itineraryStore}={}){
  const itinerary=await store.getItinerary(id);if(!itinerary?.routePack)throw new Error('Itinéraire local introuvable.');
  const media=await store.listMedia(id),portableMedia=[];
  for(const item of media){portableMedia.push({...clone(item),blob:await blobToDataUrl(item.blob),thumbnail:await blobToDataUrl(item.thumbnail),voiceNote:await blobToDataUrl(item.voiceNote)});}
  return {schema:BUNDLE_SCHEMA,exportedAt:new Date().toISOString(),generator:'PocketGuide 1.8',itinerary:clone(itinerary),media:portableMedia};
}

export async function createPortableBackupBlob(id,options={}){const bundle=await createPortableBundle(id,options);return new Blob([JSON.stringify(bundle)],{type:'application/vnd.pocketguide+json'});}

export function backupFilename(itinerary){const date=new Date().toISOString().slice(0,10);return `${safeId(itinerary?.label||itinerary?.title||'itineraire')}-${date}.pocketguide`;}

export async function importPortableBundle(input,{store=itineraryStore,now=()=>Date.now()}={}){
  const text=input instanceof Blob?await input.text():String(input||'');if(!text||text.length>MAX_IMPORT_BYTES)throw new Error('Sauvegarde vide ou trop volumineuse.');
  let bundle;try{bundle=JSON.parse(text);}catch{throw new Error('Sauvegarde PocketGuide illisible.');}
  if(bundle?.schema!==BUNDLE_SCHEMA||!bundle.itinerary?.id||!validRoutePack(bundle.itinerary.routePack)||!Array.isArray(bundle.media))throw new Error('Sauvegarde PocketGuide invalide.');
  const existing=await store.getItinerary(bundle.itinerary.id),suffix=`-importe-${Number(now()).toString(36)}`,newId=existing?`${safeId(bundle.itinerary.id)}${suffix}`:bundle.itinerary.id;
  const itinerary=clone(bundle.itinerary);itinerary.id=newId;itinerary.label=existing?`${itinerary.label||itinerary.title} — importé`:itinerary.label;itinerary.routePack={...clone(itinerary.routePack),id:newId};itinerary.routeFingerprint=JSON.stringify(itinerary.routePack);itinerary.source='pocketguide-v18-import';itinerary.updatedAt=new Date(Number(now())).toISOString();itinerary.stats={...(itinerary.stats||{}),mediaCount:bundle.media.length};
  const decoded=[];
  for(const raw of bundle.media){if(!raw?.id)throw new Error('Média de sauvegarde invalide.');decoded.push({...clone(raw),id:existing?`${raw.id}${suffix}`:raw.id,itineraryId:newId,blob:raw.blob?dataUrlToBlob(raw.blob):null,thumbnail:raw.thumbnail?dataUrlToBlob(raw.thumbnail):null,voiceNote:raw.voiceNote?dataUrlToBlob(raw.voiceNote):null});}
  await store.saveItinerary(itinerary);try{for(const media of decoded)await store.saveMedia(media);}catch(error){await store.deleteItinerary(newId);throw error;}
  return {itinerary,media:decoded,collision:Boolean(existing)};
}

export function downloadPortableBackup(blob,filename){if(!globalThis.document||!globalThis.URL)throw new Error('Téléchargement indisponible.');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.rel='noopener';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export {BUNDLE_SCHEMA,MAX_IMPORT_BYTES,validRoutePack};

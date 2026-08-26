import {itineraryStore} from '../storage/itinerary-store.js';

function events(pack){return (pack?.days||[]).flatMap(day=>day.events||[]);}
function placeMap(pack){return new Map((pack?.places||[]).map(place=>[place.id,place]));}

export function buildAudiovisualJournal(itinerary,media=[]){
  if(!itinerary?.routePack)return[];const pack=itinerary.routePack,places=placeMap(pack),routeEvents=events(pack),order=new Map(routeEvents.map((event,index)=>[event.id,index])),entries=[];
  routeEvents.forEach((event,index)=>{const place=places.get(event.placeId)||{};entries.push({id:`official:${event.id}`,kind:'official',provenance:'RoutePack',sequence:index*1000,eventId:event.id,poiId:event.placeId,title:place.name||event.title||event.id,story:place.historyLong||place.historyShort||place.description||event.note||'',imageUrl:place.heroImage||place.media?.[0]?.url||null,attribution:place.imageAttribution||null,lat:Number.isFinite(Number(place.lat))?Number(place.lat):null,lng:Number.isFinite(Number(place.lng))?Number(place.lng):null});});
  for(const item of media.filter(item=>item.kind!=='guide-audio')){const index=order.has(item.eventId)?order.get(item.eventId):routeEvents.length;entries.push({id:`personal:${item.id}`,kind:'personal',provenance:'Photo personnelle',sequence:index*1000+500+(Date.parse(item.capturedAt)||0)%400,eventId:item.eventId||null,poiId:item.poiId||null,title:item.caption||places.get(item.poiId)?.name||'Souvenir du parcours',story:item.caption||'',capturedAt:item.capturedAt,location:item.location||null,association:item.association||null,mediaId:item.id,blob:item.blob||null,thumbnail:item.thumbnail||item.blob||null,voiceNote:item.voiceNote||null});}
  return entries.sort((a,b)=>a.sequence-b.sequence||String(a.capturedAt||'').localeCompare(String(b.capturedAt||'')));
}

export function narrationForJournalEntry(entry){if(entry?.kind==='personal'){const when=entry.capturedAt?new Date(entry.capturedAt).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}):'';return `${entry.title}.${when?` Photographié le ${when}.`:''}${entry.story&&entry.story!==entry.title?` ${entry.story}`:''}`.trim();}return `${entry?.title||'Étape'}.${entry?.story?` ${entry.story}`:''}`.trim();}

export class AudiovisualJournal{
  constructor({store=itineraryStore}={}){this.store=store;}
  async load(itineraryId){const itinerary=await this.store.getItinerary(itineraryId);if(!itinerary)throw new Error('Itinéraire introuvable.');const media=await this.store.listMedia(itineraryId);return {itinerary,media,entries:buildAudiovisualJournal(itinerary,media)};}
}

export const audiovisualJournal=new AudiovisualJournal();

import {haversineKm} from '../../ar-core.js';
import {buildAudiovisualJournal,narrationForJournalEntry} from '../journal/audiovisual-journal.js';

const MODES=Object.freeze({PREPARATORY:'preparatory',SOUVENIR:'souvenir',ENRICHED:'enriched'});
const DEFAULT_SCENE_MS=8500;

function legDetails(entries,index){if(index<=0)return {distanceMeters:0,walkingMinutes:0};const a=entries[index-1],b=entries[index],latA=Number(a.lat??a.location?.lat),lngA=Number(a.lng??a.location?.lng),latB=Number(b.lat??b.location?.lat),lngB=Number(b.lng??b.location?.lng);if([latA,lngA,latB,lngB].some(value=>!Number.isFinite(value)))return {distanceMeters:null,walkingMinutes:null};const distanceMeters=Math.round(haversineKm({lat:latA,lng:lngA},{lat:latB,lng:lngB})*1000);return {distanceMeters,walkingMinutes:Math.max(1,Math.round(distanceMeters/75))};}

export function buildPhotoPreviewScenes({itinerary,media=[],mode=MODES.PREPARATORY}={}){
  const journal=buildAudiovisualJournal(itinerary,media),selected=mode===MODES.SOUVENIR?journal.filter(entry=>entry.kind==='personal'):mode===MODES.ENRICHED?journal:journal.filter(entry=>entry.kind==='official');
  return selected.map((entry,index)=>({...entry,...legDetails(selected,index),narration:narrationForJournalEntry(entry),progress:(index+1)/Math.max(1,selected.length),sceneIndex:index,totalScenes:selected.length}));
}

export class PhotoPreviewEngine{
  constructor({sceneMs=DEFAULT_SCENE_MS}={}){this.sceneMs=sceneMs;this.scenes=[];this.index=0;this.running=false;this.timer=null;this.onScene=null;this.onStatus=null;}
  current(){return this.scenes[this.index]||null;}
  report(status){const payload={status,index:this.index,total:this.scenes.length,progress:this.scenes.length?Math.min(1,(this.index+1)/this.scenes.length):0,scene:this.current()};this.onStatus?.(payload);return payload;}
  load(input){this.pause();this.scenes=buildPhotoPreviewScenes(input);this.index=0;this.report(this.scenes.length?'ready':'empty');if(this.scenes[0])this.onScene?.(this.scenes[0]);return this.scenes;}
  show(index){if(!this.scenes.length)return this.report('empty');this.index=Math.max(0,Math.min(this.scenes.length-1,index));const scene=this.current();this.onScene?.(scene);return this.report(this.running?'running':'paused');}
  next(){if(this.index>=this.scenes.length-1){this.pause();return this.report('completed');}return this.show(this.index+1);}
  previous(){return this.show(this.index-1);}
  repeat(){const scene=this.current();if(scene)this.onScene?.(scene,{repeat:true});return this.report(this.running?'running':'paused');}
  play(){if(!this.scenes.length)return this.report('empty');if(this.running)return this.report('running');this.running=true;this.onScene?.(this.current());const tick=()=>{if(!this.running)return;if(this.index>=this.scenes.length-1){this.running=false;this.timer=null;this.report('completed');return;}this.show(this.index+1);this.timer=setTimeout(tick,this.sceneMs);};this.timer=setTimeout(tick,this.sceneMs);return this.report('running');}
  pause(){this.running=false;if(this.timer)clearTimeout(this.timer);this.timer=null;return this.report(this.scenes.length?'paused':'idle');}
  reset(){this.pause();this.index=0;if(this.current())this.onScene?.(this.current());return this.report(this.scenes.length?'ready':'empty');}
}

export const photoPreviewEngine=new PhotoPreviewEngine();
export {MODES,DEFAULT_SCENE_MS};

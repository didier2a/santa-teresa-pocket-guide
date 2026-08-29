import {haversineKm} from '../../ar-core.js';

export class ProactiveGuideAdapter{
  constructor({state,bus=null,storage=globalThis.localStorage,radiusMeters=110,exitRadiusMeters=null,placeCooldownMinutes=12,globalCooldownSeconds=75}={}){
    this.state=state;this.bus=bus;this.storage=storage;this.radiusMeters=radiusMeters;this.exitRadiusMeters=exitRadiusMeters||Math.max(radiusMeters+45,Math.round(radiusMeters*1.45));this.placeCooldownMs=placeCooldownMinutes*60000;this.globalCooldownMs=Math.max(45000,globalCooldownSeconds*1000);this.pack=null;this.seen={};this.lastGlobalAt=0;this.insidePlaceId='';
  }
  setPack(pack){this.pack=pack||null;try{this.seen=JSON.parse(this.storage?.getItem?.(this.key())||'{}')||{}}catch{this.seen={};}}
  key(){return`pg4-proactive-v152:${this.pack?.id||'none'}`;}
  save(){try{this.storage?.setItem?.(this.key(),JSON.stringify(this.seen))}catch{}}
  check(position){
    if(!this.pack||!position||this.state?.select?.('routeProgress.proactiveEnabled')===false)return null;
    if(!position.simulated&&Number(position.accuracy)>Math.max(80,this.radiusMeters))return null;
    const nearest=(this.pack.places||[]).filter(place=>Number.isFinite(place.lat)&&Number.isFinite(place.lng)).map(place=>({place,distanceMeters:haversineKm(position,place)*1000})).sort((a,b)=>a.distanceMeters-b.distanceMeters)[0];if(!nearest)return null;
    if(this.insidePlaceId===nearest.place.id&&nearest.distanceMeters<=this.exitRadiusMeters)return null;
    if(nearest.distanceMeters>this.radiusMeters){if(nearest.distanceMeters>this.exitRadiusMeters)this.insidePlaceId='';return null;}
    const now=Date.now();if(now-this.lastGlobalAt<this.globalCooldownMs||now-Number(this.seen[nearest.place.id]||0)<this.placeCooldownMs)return null;
    this.insidePlaceId=nearest.place.id;this.seen[nearest.place.id]=now;this.lastGlobalAt=now;this.save();try{globalThis.navigator?.vibrate?.(20)}catch{}
    const arrival={place:nearest.place,distanceMeters:Math.round(nearest.distanceMeters),at:new Date(now).toISOString()};this.bus?.emit?.('pg4.proactive.arrival',arrival);return arrival;
  }
  diagnostic(){return{enabled:this.state?.select?.('routeProgress.proactiveEnabled')!==false,radiusMeters:this.radiusMeters,exitRadiusMeters:this.exitRadiusMeters,globalCooldownMs:this.globalCooldownMs};}
}

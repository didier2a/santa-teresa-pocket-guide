import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';
import {platformAdapter} from '../platform/platform.js';

function normalizeHeading(value){const n=Number(value);return Number.isFinite(n)?((n%360)+360)%360:null;}
function simulatedPlace(){const route=pocketGuideState.select('route');const events=(route?.pack?.days||[]).flatMap(day=>day.events||[]);const event=events.find(e=>e.id===route?.currentEventId);return (route?.pack?.places||[]).find(p=>p.id===event?.placeId)||null;}

export class PerceptionEngine {
  constructor(){this.gpsWatch=null;this.orientationHandler=null;this.cameraStream=null;this.mode='real';}
  setMode(mode='real'){this.mode=mode==='simulation'?'simulation':'real';pocketGuideState.patch({session:{simulation:this.mode==='simulation'}},{source:'perception',event:'perception.mode.changed'});return this.mode;}
  async startLocation(){
    if(this.mode==='simulation')return this.simulateAtCurrent();
    if(!globalThis.navigator?.geolocation){pocketGuideState.patch({perception:{gps:'unavailable'}},{source:'perception',event:'gps.unavailable'});return false;}
    if(this.gpsWatch!=null)return true;pocketGuideState.patch({perception:{gps:'starting'}},{source:'perception',event:'gps.starting'});
    this.gpsWatch=globalThis.navigator.geolocation.watchPosition(position=>{const c=position.coords;pocketGuideState.patch({location:{lat:c.latitude,lng:c.longitude,accuracy:Number.isFinite(c.accuracy)?c.accuracy:null,heading:normalizeHeading(c.heading),updatedAt:new Date(position.timestamp).toISOString()},perception:{gps:'ready'}},{source:'perception',event:'gps.updated'});},error=>{pocketGuideState.patch({perception:{gps:error.code===1?'denied':'error'}},{source:'perception',event:error.code===1?'gps.denied':'gps.error'});},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});return true;
  }
  stopLocation(){if(this.gpsWatch!=null&&globalThis.navigator?.geolocation){globalThis.navigator.geolocation.clearWatch(this.gpsWatch);this.gpsWatch=null;}pocketGuideState.patch({perception:{gps:'idle'}},{source:'perception',event:'gps.stopped'});}
  simulateAtCurrent({heading=0,accuracy=4}={}){const place=simulatedPlace();if(!place||!Number.isFinite(Number(place.lat))||!Number.isFinite(Number(place.lng)))return false;this.setMode('simulation');pocketGuideState.patch({location:{lat:Number(place.lat),lng:Number(place.lng),accuracy,heading:normalizeHeading(heading),updatedAt:new Date().toISOString()},perception:{gps:'ready',orientation:'ready'}},{source:'simulation',event:'gps.updated'});return true;}
  async startOrientation({requestPermission=true}={}){
    if(this.mode==='simulation'){pocketGuideState.patch({perception:{orientation:'ready'}},{source:'simulation',event:'heading.updated'});return true;}
    if(requestPermission&&!await platformAdapter.requestOrientationPermission())return false;
    if(this.orientationHandler)return true;
    this.orientationHandler=event=>{let heading=null;if(Number.isFinite(event.webkitCompassHeading))heading=event.webkitCompassHeading;else if(Number.isFinite(event.alpha))heading=360-event.alpha;heading=normalizeHeading(heading);if(heading==null)return;pocketGuideState.patch({location:{heading,updatedAt:new Date().toISOString()},perception:{orientation:'ready'}},{source:'perception',event:'heading.updated'});};
    globalThis.addEventListener?.('deviceorientationabsolute',this.orientationHandler,true);globalThis.addEventListener?.('deviceorientation',this.orientationHandler,true);return true;
  }
  stopOrientation(){if(!this.orientationHandler)return;globalThis.removeEventListener?.('deviceorientationabsolute',this.orientationHandler,true);globalThis.removeEventListener?.('deviceorientation',this.orientationHandler,true);this.orientationHandler=null;}
  async openCamera(videoEl){
    if(this.cameraStream)return this.cameraStream;if(!globalThis.navigator?.mediaDevices?.getUserMedia){pocketGuideState.patch({perception:{camera:'unavailable'}},{source:'perception',event:'camera.unavailable'});return null;}
    try{this.cameraStream=await globalThis.navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(videoEl){videoEl.srcObject=this.cameraStream;videoEl.hidden=false;await videoEl.play();}pocketGuideState.patch({perception:{camera:'ready'},ui:{ar:true,panel:'guide'}},{source:'perception',event:'camera.ready'});return this.cameraStream;}catch(error){pocketGuideState.patch({perception:{camera:error?.name==='NotAllowedError'?'denied':'error'}},{source:'perception',event:'camera.error'});return null;}
  }
  closeCamera(videoEl){try{this.cameraStream?.getTracks().forEach(t=>t.stop())}catch{}this.cameraStream=null;if(videoEl){try{videoEl.pause()}catch{}videoEl.srcObject=null;videoEl.hidden=true;}pocketGuideState.patch({perception:{camera:'idle'},ui:{ar:false}},{source:'perception',event:'camera.closed'});}
  reset(){this.stopLocation();this.stopOrientation();this.closeCamera();pocketGuideState.patch({perception:{gps:'unknown',orientation:'unknown',camera:'unknown',microphone:'unknown'}},{source:'perception',event:'perception.reset'});eventBus.emit('perception.reset.completed',{});}
}

export const perceptionEngine=new PerceptionEngine();
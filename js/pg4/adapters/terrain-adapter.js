import {bearingDeg,compassLabel,normalizeHeading,projectPlaces} from '../../ar-core.js';

function finite(value){return Number.isFinite(Number(value));}

export class TerrainAdapter{
  constructor({state,bus=null,navigatorImpl=globalThis.navigator,windowImpl=globalThis.window,documentImpl=globalThis.document,companion=null,onPosition=null}={}){
    this.state=state;this.bus=bus;this.navigator=navigatorImpl;this.window=windowImpl;this.document=documentImpl;this.companion=companion;this.onPosition=onPosition;
    this.pack=null;this.nodes={};this.gpsWatch=null;this.cameraStream=null;this.orientationHandler=null;this.orientationPermission='unknown';this.orientationPromise=null;this.ar=false;this.heading=null;this.position=null;
  }
  install(nodes={}){this.nodes=nodes;this.renderStatus();return this;}
  setPack(pack){this.pack=pack||null;if(this.ar)this.renderAR();}
  target(){const focused=this.state?.select?.('routeProgress.focusedPlaceId');return(this.pack?.places||[]).find(place=>place.id===focused)||this.pack?.places?.[0]||null;}
  requestOrientationFromGesture(){
    const Orientation=this.window?.DeviceOrientationEvent;
    if(typeof Orientation==='undefined'){this.orientationPermission='unsupported';this.patch();return Promise.resolve(false);}
    if(typeof Orientation.requestPermission!=='function'){this.orientationPermission='granted';this.installOrientationListener();this.patch();return Promise.resolve(true);}
    if(this.orientationPermission==='granted'){this.installOrientationListener();return Promise.resolve(true);}
    if(this.orientationPromise)return this.orientationPromise;
    try{
      this.orientationPromise=Promise.resolve(Orientation.requestPermission()).then(value=>{this.orientationPermission=value==='granted'?'granted':'denied';if(this.orientationPermission==='granted')this.installOrientationListener();this.patch();return this.orientationPermission==='granted';}).catch(()=>{this.orientationPermission='denied';this.patch();return false;}).finally(()=>{this.orientationPromise=null;});
      return this.orientationPromise;
    }catch{this.orientationPermission='denied';this.patch();return Promise.resolve(false);}
  }
  installOrientationListener(){
    if(this.orientationHandler)return true;
    this.orientationHandler=event=>{let heading=null;if(finite(event.webkitCompassHeading))heading=Number(event.webkitCompassHeading);else if(finite(event.alpha))heading=360-Number(event.alpha)+(Number(this.window?.screen?.orientation?.angle??this.window?.orientation??0)||0);if(!finite(heading))return;this.heading=normalizeHeading(heading);this.patch();this.renderAR();};
    this.window?.addEventListener?.('deviceorientationabsolute',this.orientationHandler,true);this.window?.addEventListener?.('deviceorientation',this.orientationHandler,true);return true;
  }
  stopOrientation(){if(!this.orientationHandler)return;this.window?.removeEventListener?.('deviceorientationabsolute',this.orientationHandler,true);this.window?.removeEventListener?.('deviceorientation',this.orientationHandler,true);this.orientationHandler=null;}
  startGPS(){
    if(this.gpsWatch!==null)return true;
    if(!this.navigator?.geolocation)throw new Error('GPS Web indisponible');
    this.gpsWatch=this.navigator.geolocation.watchPosition(position=>{this.position={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy};this.patch();this.renderStatus();this.renderAR();this.onPosition?.(this.position);this.bus?.emit?.('pg4.terrain.position',this.position);},error=>{this.state?.patch?.({sensors:{gps:'error',gpsError:error?.message||'GPS indisponible'}},{source:'terrain'});this.renderStatus();},{enableHighAccuracy:true,maximumAge:3000,timeout:12000});
    this.state?.patch?.({sensors:{gps:'requesting'}},{source:'terrain'});this.renderStatus();return true;
  }
  stopGPS(){if(this.gpsWatch!==null){try{this.navigator?.geolocation?.clearWatch?.(this.gpsWatch)}catch{}this.gpsWatch=null;}this.state?.patch?.({sensors:{gps:'idle'}},{source:'terrain'});this.renderStatus();}
  async startCamera(){
    if(this.cameraStream)return true;
    if(!this.navigator?.mediaDevices?.getUserMedia)throw new Error('Caméra Web indisponible');
    this.cameraStream=await this.navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(this.nodes.video){this.nodes.video.srcObject=this.cameraStream;this.nodes.video.hidden=false;await this.nodes.video.play?.().catch(()=>{});}
    this.state?.patch?.({sensors:{camera:'granted'}},{source:'terrain'});return true;
  }
  stopCamera(){try{this.cameraStream?.getTracks?.().forEach(track=>track.stop())}catch{}this.cameraStream=null;if(this.nodes.video){try{this.nodes.video.pause?.()}catch{}this.nodes.video.srcObject=null;this.nodes.video.hidden=true;}this.state?.patch?.({sensors:{camera:'idle'}},{source:'terrain'});}
  async toggleAR(force){
    const next=typeof force==='boolean'?force:!this.ar;
    if(!next){this.ar=false;this.stopCamera();this.stopOrientation();if(this.nodes.stage)this.nodes.stage.hidden=true;this.patch();return{active:false};}
    this.ar=true;if(this.nodes.stage)this.nodes.stage.hidden=false;
    try{this.startGPS();await this.startCamera();const orientation=await this.requestOrientationFromGesture();if(!orientation&&!finite(this.heading)){const target=this.target();if(this.position&&target)this.heading=bearingDeg(this.position,target);this.setManual(true);}else this.setManual(false);this.patch();this.renderAR();return{active:true,manual:this.orientationPermission!=='granted'};}
    catch(error){this.ar=false;this.stopCamera();if(this.nodes.stage)this.nodes.stage.hidden=true;this.patch();throw error;}
  }
  adjustHeading(delta){this.heading=normalizeHeading((finite(this.heading)?this.heading:0)+Number(delta||0));this.patch();this.renderAR();}
  setManual(show){if(this.nodes.manual)this.nodes.manual.hidden=!show;}
  renderAR(){
    if(!this.ar||!this.nodes.labels)return;
    const target=this.target();if(!this.position&&target)this.position={lat:target.lat+.00025,lng:target.lng-.0002,accuracy:4,simulated:true};
    const heading=finite(this.heading)?this.heading:(target&&this.position?bearingDeg(this.position,target):0);
    if(this.nodes.compass)this.nodes.compass.textContent=`${Math.round(heading)}° ${compassLabel(heading)}`;
    this.nodes.labels.replaceChildren();
    for(const item of projectPlaces({position:this.position,places:this.pack?.places||[],heading,includeOutsideFov:false}).slice(0,5)){
      if(!item.visible)continue;const label=this.document.createElement('button');label.type='button';label.className='geo-ar-label';label.style.left=`${Math.max(8,Math.min(92,item.x*100))}%`;label.dataset.action='focus-place';label.dataset.placeId=item.place.id;label.textContent=`${item.place.name} · ${item.distanceKm<1?`${Math.round(item.distanceKm*1000)} m`:`${item.distanceKm.toFixed(1)} km`}`;this.nodes.labels.append(label);
    }
  }
  patch(){this.state?.patch?.({sensors:{gps:this.position?'granted':this.gpsWatch!==null?'requesting':'idle',camera:this.cameraStream?'granted':'idle',orientation:this.orientationPermission,position:this.position,heading:this.heading,ar:this.ar}},{source:'terrain'});this.renderStatus();}
  renderStatus(){if(this.nodes.status)this.nodes.status.textContent=`GPS ${this.position?'actif':'—'} · Caméra ${this.cameraStream?'active':'—'} · Boussole ${this.orientationPermission==='granted'?'active':this.orientationPermission==='denied'?'refusée':'—'}`;if(this.nodes.gps)this.nodes.gps.setAttribute('aria-pressed',String(this.gpsWatch!==null));if(this.nodes.ar)this.nodes.ar.setAttribute('aria-pressed',String(this.ar));}
  async resetMedia(){this.stopCamera();this.stopGPS();this.stopOrientation();this.ar=false;if(this.nodes.stage)this.nodes.stage.hidden=true;this.position=null;this.heading=null;await this.companion?.reset?.();this.patch();return true;}
  diagnostic(){return{gps:Boolean(this.navigator?.geolocation),camera:Boolean(this.navigator?.mediaDevices?.getUserMedia),orientation:typeof this.window?.DeviceOrientationEvent!=='undefined',orientationPermission:this.orientationPermission,arActive:this.ar,gpsActive:this.gpsWatch!==null,cameraActive:Boolean(this.cameraStream)};}
  destroy(){this.stopCamera();this.stopGPS();this.stopOrientation();}
}

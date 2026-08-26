import {eventBus} from '../../pg16/core/event-bus.js';

export const MAP_MODES=Object.freeze(['osm','satellite','street','3d']);

export function googleReadiness(config={}){
  const google=config.googleMaps||config,checks={enabled:Boolean(google.enabled),keyPresent:Boolean(String(google.browserKey||'').trim()),referrers:Boolean(google.restrictionsVerified),apis:Boolean(google.apiRestrictionsVerified),quotas:Boolean(google.quotasConfigured),billingAlerts:Boolean(google.billingAlertsConfigured),cachePolicy:google.cachePolicy==='online-only-no-durable-google-media-cache'};
  return {...checks,ready:Object.values(checks).every(Boolean)};
}

export class GoogleMapsLoader{
  constructor({document=globalThis.document,window=globalThis}={}){this.document=document;this.window=window;this.promise=null;}
  load(key){
    if(this.window.google?.maps)return Promise.resolve(this.window.google.maps);if(this.promise)return this.promise;if(!key)return Promise.reject(new Error('Clé Google Maps dédiée manquante'));
    this.promise=new Promise((resolve,reject)=>{const callback=`__pg22GoogleReady_${Date.now()}`;this.window[callback]=()=>{delete this.window[callback];resolve(this.window.google.maps);};const script=this.document.createElement('script');script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${callback}`;script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';script.dataset.pg22Google='explicit';script.onerror=()=>{delete this.window[callback];this.promise=null;reject(new Error('Google Maps ne peut pas être chargé'));};this.document.head.append(script);});return this.promise;
  }
}

export class MapModeController{
  constructor({loader=new GoogleMapsLoader(),fetchImpl=globalThis.fetch}={}){this.loader=loader;this.fetchImpl=fetchImpl;this.config=null;this.mode='osm';this.host=null;this.osmHost=null;this.statusHost=null;this.googleMap=null;this.panorama=null;this.loadedGoogle=false;this.consent=false;this.onMode=null;}
  async configure(){if(this.config)return this.config;const response=await this.fetchImpl('./data/v22-config.json',{cache:'no-store'});if(!response.ok)throw new Error(`Configuration cartographique ${response.status}`);this.config=await response.json();return this.config;}
  install({host,osmHost,statusHost}={}){this.host=host;this.osmHost=osmHost;this.statusHost=statusHost;this.showStatus('OpenStreetMap est actif. Google reste déconnecté.');return this;}
  showStatus(message,level='info'){if(this.statusHost){this.statusHost.textContent=message;this.statusHost.dataset.level=level;}eventBus.emit('pg22.map.status',{mode:this.mode,message,level});}
  point(place){return Number.isFinite(Number(place?.lat))&&Number.isFinite(Number(place?.lng))?{lat:Number(place.lat),lng:Number(place.lng)}:null;}
  async ensureGoogle({explicit=false}={}){
    if(!explicit&&!this.consent)throw new Error('Google ne peut être chargé qu’après votre action explicite');const config=await this.configure(),readiness=googleReadiness(config);
    if(!readiness.enabled||!readiness.keyPresent)throw new Error('Les vues Google attendent une clé dédiée restreinte');if(!readiness.ready)throw new Error('La clé Google n’est pas encore validée : référents, API, quotas ou alertes manquent');
    this.consent=true;await this.loader.load(config.googleMaps.browserKey);this.loadedGoogle=true;return globalThis.google.maps;
  }
  resetHosts(){if(this.osmHost)this.osmHost.hidden=this.mode!=='osm';if(this.host){this.host.hidden=this.mode==='osm';this.host.replaceChildren();}this.googleMap=null;this.panorama=null;}
  async select(mode,{explicit=false,place}={}){
    const target=MAP_MODES.includes(mode)?mode:'osm';if(target==='osm'){this.mode='osm';this.resetHosts();this.showStatus('OpenStreetMap est actif. Aucune donnée n’est envoyée à Google.');this.onMode?.({mode:'osm',fallback:false});return {mode:'osm'};}
    this.mode=target;this.resetHosts();try{await this.ensureGoogle({explicit});const point=this.point(place);if(!point)throw new Error('Coordonnées du POI indisponibles');if(target==='satellite')return this.showSatellite(point);if(target==='street')return await this.showStreet(point);return await this.show3d(point);}catch(error){this.showStatus(String(error?.message||error),'warning');if(target==='3d'&&this.loadedGoogle&&this.point(place))return this.showSatellite(this.point(place),{fallbackFrom:'3d'});this.mode='osm';this.resetHosts();this.showStatus(`${error.message||error}. Retour à OpenStreetMap.`,'warning');this.onMode?.({mode:'osm',fallback:true,from:target,reason:String(error?.message||error)});return {mode:'osm',fallback:true,error};}
  }
  showSatellite(point,{fallbackFrom=null}={}){this.mode='satellite';this.resetHosts();this.googleMap=new google.maps.Map(this.host,{center:point,zoom:18,mapTypeId:'satellite',streetViewControl:false,fullscreenControl:true,mapTypeControl:false});const message=fallbackFrom?'La 3D n’est pas disponible ici. Vue Satellite affichée.':'Vue Satellite Google active en ligne.';this.showStatus(message,fallbackFrom?'warning':'info');this.onMode?.({mode:'satellite',fallback:Boolean(fallbackFrom),from:fallbackFrom});return {mode:'satellite',fallback:Boolean(fallbackFrom)};}
  async showStreet(point){
    const service=new google.maps.StreetViewService(),result=await new Promise((resolve,reject)=>service.getPanorama({location:point,radius:100,preference:google.maps.StreetViewPreference.NEAREST,source:google.maps.StreetViewSource.OUTDOOR},(data,status)=>status===google.maps.StreetViewStatus.OK?resolve(data):reject(new Error('Aucun panorama Street View vérifié à moins de 100 mètres'))));
    this.mode='street';this.resetHosts();this.panorama=new google.maps.StreetViewPanorama(this.host,{position:result.location.latLng,pov:{heading:0,pitch:0},zoom:1,addressControl:true,linksControl:true,fullscreenControl:true});this.showStatus('Street View disponible près de cette étape. Images Google en ligne, non archivées.');this.onMode?.({mode:'street',coverage:true});return {mode:'street',coverage:true};
  }
  async show3d(point){
    if(typeof google.maps.importLibrary!=='function'||!globalThis.customElements)throw new Error('La 3D photoréaliste n’est pas compatible avec ce navigateur');const library=await google.maps.importLibrary('maps3d'),Map3DElement=library.Map3DElement;if(!Map3DElement)throw new Error('La 3D photoréaliste n’est pas disponible ici');
    this.mode='3d';this.resetHosts();const map3d=new Map3DElement({center:{...point,altitude:500},range:900,tilt:55,heading:0,mode:'hybrid'});map3d.style.width='100%';map3d.style.height='100%';this.host.append(map3d);this.showStatus('Vue 3D photoréaliste Google active en ligne.');this.onMode?.({mode:'3d'});return {mode:'3d'};
  }
}

export const mapModeController=new MapModeController();

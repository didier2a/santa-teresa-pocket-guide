import {validateRoutePack} from '../../../engine/routepack.js';
import {enrichRoutePackMedia} from '../../route-media.js';

function abortError(){const error=new Error('Action annulée');error.name='AbortError';return error;}
function delay(ms,signal){
  return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason||abortError());const timer=setTimeout(resolve,ms);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason||abortError());},{once:true});});
}
function haversineKm(a,b){
  const rad=value=>value*Math.PI/180,R=6371,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x));
}
function mapModel(pack){
  const places=(pack.places||[]).filter(place=>Number.isFinite(place.lat)&&Number.isFinite(place.lng));let distanceKm=0;
  for(let index=1;index<places.length;index++)distanceKm+=haversineKm(places[index-1],places[index]);
  return{provider:'OpenStreetMap',attribution:'© OpenStreetMap',markers:places.map((place,index)=>({id:place.id,label:place.name,lat:place.lat,lng:place.lng,index:index+1})),polyline:places.map(place=>[place.lat,place.lng]),distanceKm:+distanceKm.toFixed(1)};
}
function planPrompt(intent){
  const hours=(intent.durationMinutes/60).toLocaleString('fr-FR',{maximumFractionDigits:1});
  return`${intent.request}\nDestination: ${intent.destination}. Durée maximale: ${hours} h. Transport: ${intent.transport}. Produis des descriptions touristiques courtes et factuelles, des coordonnées vérifiables et des sources publiques. Les photos peuvent rester vides car PocketGuide les enrichit ensuite avec Wikimedia Commons.`;
}

export class PlannerAdapter{
  constructor({fetchImpl=globalThis.fetch,baseUrl='',pollIntervalMs=900,maxWaitMs=90000,mediaEnricher=enrichRoutePackMedia}={}){
    this.fetchImpl=fetchImpl;this.baseUrl=String(baseUrl||'').replace(/\/$/,'');this.pollIntervalMs=pollIntervalMs;this.maxWaitMs=maxWaitMs;this.mediaEnricher=mediaEnricher;
  }
  url(path){return`${this.baseUrl}${path}`;}
  async fetchJson(url,options={}){
    const response=await this.fetchImpl(url,options),payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload?.error||`HTTP ${response.status}`);return{response,payload};
  }
  async generate(intent,{signal,progress=()=>{}}={}){
    progress({phase:'understanding',step:1,total:6,label:'Compréhension'});
    const body={prompt:planPrompt(intent),destination:intent.destination,maxPlaces:intent.maxPlaces,timezone:'Europe/Rome'};
    progress({phase:'verification',step:2,total:6,label:'Vérification'});
    const started=await this.fetchJson(this.url('/api/plan'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    let pack=started.payload.pack||null;
    if(!pack){
      const taskId=started.payload.taskId;if(!taskId)throw new Error('Identifiant Planner absent');const deadline=Date.now()+this.maxWaitMs;
      progress({phase:'construction',step:3,total:6,label:'Construction',taskId});
      while(Date.now()<deadline){
        if(signal?.aborted)throw signal.reason||abortError();await delay(this.pollIntervalMs,signal);
        const result=await this.fetchJson(this.url(`/api/plan-status?id=${encodeURIComponent(taskId)}`),{method:'GET',headers:{Accept:'application/json'},signal});
        if(result.payload.status==='completed'&&result.payload.pack){pack=result.payload.pack;break;}
      }
      if(!pack)throw new Error('Le Planner a dépassé le délai autorisé');
    }
    const report=validateRoutePack(pack);if(!report.valid)throw new Error(`RoutePack invalide : ${report.errors.map(item=>item.code).join(', ')}`);
    progress({phase:'media',step:4,total:6,label:'Médias',completed:0,totalPlaces:pack.places.length});
    const fetchWithSignal=(url,options={})=>this.fetchImpl(url,{...options,signal});
    const enriched=await this.mediaEnricher(pack,{destination:intent.destination,fetchImpl:fetchWithSignal,onProgress:item=>progress({phase:'media',step:4,total:6,label:'Médias',completed:item.index,totalPlaces:item.total,placeId:item.place?.id})});
    progress({phase:'map',step:5,total:6,label:'Cartographie'});const map=mapModel(enriched);
    progress({phase:'narration',step:6,total:6,label:'Narration'});
    const places=enriched.places||[],mediaReady=places.filter(place=>place.heroImage).length;
    return{pack:enriched,map,summary:{title:enriched.title,durationMinutes:intent.durationMinutes,places:places.length,distanceKm:map.distanceKm,mediaReady,mediaMissing:places.length-mediaReady},report};
  }
}

export {mapModel,planPrompt};


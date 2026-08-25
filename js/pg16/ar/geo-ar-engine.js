import {projectPlaces,haversineKm,bearingDeg,compassLabel} from '../../ar-core.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';

function places(){return (pocketGuideState.select('route.pack')?.places||[]).filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));}
export class GeoAREngine {
  project({fov=70,maxDistanceKm=2.5}={}){
    const state=pocketGuideState.get();const position=state.location;const heading=state.location.heading;
    if(!Number.isFinite(position?.lat)||!Number.isFinite(position?.lng)||!Number.isFinite(heading))return [];
    const projections=projectPlaces({lat:position.lat,lng:position.lng},heading,places(),{fov,maxDistanceKm});
    return projections.map(item=>({...item,distanceKm:Number.isFinite(item.distanceKm)?item.distanceKm:haversineKm(position,item.place),bearing:Number.isFinite(item.bearing)?item.bearing:bearingDeg(position,item.place),direction:compassLabel(Number.isFinite(item.bearing)?item.bearing:bearingDeg(position,item.place))}));
  }
  nearest(limit=5){const state=pocketGuideState.get();const position=state.location;if(!Number.isFinite(position?.lat)||!Number.isFinite(position?.lng))return[];return places().map(place=>({place,distanceKm:haversineKm(position,place),bearing:bearingDeg(position,place)})).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,limit);}
  focus(placeId){const place=places().find(p=>p.id===placeId);if(!place)return false;pocketGuideState.patch({conversation:{currentPlaceId:place.id,lastMentionedPlaceId:place.id},ui:{ar:true}},{source:'geo-ar',event:'ar.focus.changed'});return true;}
  context(){const nearest=this.nearest(1)[0];return nearest?{placeId:nearest.place.id,name:nearest.place.name,distanceMeters:Math.round(nearest.distanceKm*1000),bearing:Math.round(nearest.bearing),direction:compassLabel(nearest.bearing)}:null;}
}
export const geoAREngine=new GeoAREngine();
eventBus.on('gps.updated',()=>eventBus.emit('ar.projection.updated',{count:geoAREngine.project().length}));
eventBus.on('heading.updated',()=>eventBus.emit('ar.projection.updated',{count:geoAREngine.project().length}));
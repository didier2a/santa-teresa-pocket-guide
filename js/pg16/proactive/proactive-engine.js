import {eventBus} from '../core/event-bus.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {geoAREngine} from '../ar/geo-ar-engine.js';

const DEFAULTS={poiRadiusMeters:110,globalCooldownMs:75_000,poiCooldownMs:12*60_000,offRouteMeters:450,gpsAccuracyBad:80};
export class ProactiveEngine {
  constructor(options={}){this.options={...DEFAULTS,...options};this.lastGlobalAt=0;this.poiAt=new Map();this.started=false;this.unsubs=[];this.onSuggestion=null;}
  canSpeak(){const now=Date.now();if(now-this.lastGlobalAt<this.options.globalCooldownMs)return false;const status=pocketGuideState.select('conversation.status');return !['listening','thinking','speaking','waiting_confirmation'].includes(status);}
  suggest(type,text,metadata={}){if(!this.canSpeak())return false;this.lastGlobalAt=Date.now();const payload={type,text,metadata,at:new Date().toISOString()};eventBus.emit('proactive.suggestion',payload);this.onSuggestion?.(payload);return true;}
  onGps(){const state=pocketGuideState.get();if(state.perception?.gps!=='ready')return;const accuracy=Number(state.location?.accuracy);if(Number.isFinite(accuracy)&&accuracy>this.options.gpsAccuracyBad){this.suggest('gps_degraded','Le GPS est devenu imprécis. Je préfère ne pas vous donner une direction exacte pour le moment.',{accuracy});return;}
    const nearest=geoAREngine.nearest(1)[0];if(!nearest)return;const meters=Math.round(nearest.distanceKm*1000);
    if(meters>this.options.offRouteMeters){this.suggest('off_route',`Vous vous êtes éloigné du parcours d’environ ${meters} mètres. Je peux vous montrer le point utile le plus proche sans modifier votre balade.`,{placeId:nearest.place.id,distanceMeters:meters});return;}
    if(meters<=this.options.poiRadiusMeters){const previous=this.poiAt.get(nearest.place.id)||0;if(Date.now()-previous>=this.options.poiCooldownMs){this.poiAt.set(nearest.place.id,Date.now());this.suggest('near_place',`Nous approchons de ${nearest.place.name}. Vous voulez que je vous raconte ce lieu ?`,{placeId:nearest.place.id,distanceMeters:meters});}}
  }
  onNetwork(online){this.suggest(online?'network_restored':'network_lost',online?'La connexion est revenue. Le guide conversationnel peut reprendre son contexte.':'La connexion est coupée. Le parcours, la carte locale et votre progression restent disponibles.');}
  onRouteCompleted(){this.suggest('route_completed','Nous avons terminé le parcours. Je peux vous proposer une suite si vous le souhaitez.');}
  start(){if(this.started)return;this.started=true;this.unsubs.push(eventBus.on('gps.updated',()=>this.onGps()),eventBus.on('network.offline',()=>this.onNetwork(false)),eventBus.on('network.online',()=>this.onNetwork(true)),eventBus.on('route.completed',()=>this.onRouteCompleted()));}
  stop(){this.unsubs.splice(0).forEach(off=>off?.());this.started=false;}
}
export const proactiveEngine=new ProactiveEngine();
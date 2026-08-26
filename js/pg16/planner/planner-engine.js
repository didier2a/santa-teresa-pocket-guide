import {plannerClient} from './planner-client.js';
import {proposalManager} from '../core/proposal-manager.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';

function currentRouteSummary(){const route=pocketGuideState.select('route');return {id:route?.activeId||null,title:route?.title||null,currentEventId:route?.currentEventId||null,completedEventIds:route?.completedEventIds||[],skippedEventIds:route?.skippedEventIds||[],remainingMinutes:route?.remainingMinutes??null};}
function normalize(value=''){return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function extractDurationMinutes(text=''){
  const value=String(text).toLowerCase();
  let match=value.match(/(?:dans\s+)?(?:l['’]heure(?:\s+qui\s+suit)?|une\s+heure|1\s*h(?:eure)?)/i);if(match)return 60;
  match=value.match(/(\d{1,3})\s*(?:min|minutes?)/i);if(match)return Math.max(15,Math.min(480,Number(match[1])));
  match=value.match(/(\d+(?:[.,]\d+)?)\s*(?:h|heures?)/i);if(match)return Math.max(15,Math.min(480,Math.round(Number(match[1].replace(',','.'))*60)));
  return null;
}
function currentPlannerContext(prompt){
  const location=pocketGuideState.select('location')||{};
  const durationMinutes=extractDurationMinutes(prompt);
  const now=new Date();
  return {
    previousRoute:currentRouteSummary(),
    origin:Number.isFinite(location.lat)&&Number.isFinite(location.lng)?{lat:location.lat,lng:location.lng,accuracy:location.accuracy??null,updatedAt:location.updatedAt??null}:null,
    localDate:now.toLocaleDateString('sv-SE'),
    localTime:now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',hour12:false}),
    durationMinutes,
    preferences:pocketGuideState.select('preferences')
  };
}
function resolveDestination(prompt,destination=''){
  const candidate=String(destination||'').trim();if(!candidate)return '';
  const request=normalize(prompt),needle=normalize(candidate);if(needle&&request.includes(needle))return candidate;
  const route=pocketGuideState.select('route')||{},pack=route.pack||{};
  const staleNames=[route.title,...(pack.places||[]).flatMap(place=>[place?.name,place?.title])].filter(Boolean).map(normalize);
  if(staleNames.includes(needle))return '';
  return candidate;
}

export class PlannerEngine {
  async proposeReplacement({prompt,destination='',maxPlaces=5,timezone,signal}={}){
    const request=String(prompt||'').trim();
    pocketGuideState.patch({conversation:{status:'thinking'}},{source:'planner-engine',event:'planner.started'});
    const context=currentPlannerContext(request);
    const resolvedDestination=resolveDestination(request,destination);
    const enriched=`${request}\n\nRÈGLES DE CONTEXTE POCKETGUIDE:\n- Le parcours actif précédent est uniquement un contexte à remplacer; il NE DOIT JAMAIS devenir la destination implicite d'un nouveau parcours.\n- Si l'utilisateur nomme une ville ou un lieu dans sa demande, ce lieu est prioritaire sur l'ancien parcours.\n- Si l'utilisateur dit « ici », « autour de moi » ou équivalent, utiliser l'origine GPS fournie ci-dessous.\n- Si durationMinutes est renseigné, le parcours complet doit tenir dans cette durée à partir de localTime.\nContexte structuré: ${JSON.stringify(context)}`;
    try{
      const result=await plannerClient.plan({prompt:enriched,destination:resolvedDestination,maxPlaces,timezone,signal});
      const proposal=proposalManager.create({action:'route.replace',args:{pack:result.pack},reason:request,summary:`Remplacer le parcours par « ${result.pack.title} » (${result.pack.places?.length||0} lieux).`,requiresConfirmation:true,metadata:{plannerModel:result.plannerModel,verificationSources:result.verificationSources,requestedDestination:resolvedDestination||null,origin:context.origin,durationMinutes:context.durationMinutes}});
      eventBus.emit('planner.proposal.ready',{proposalId:proposal.id,routeId:result.pack.id});return {proposal,plan:result,context};
    }catch(error){
      eventBus.emit('planner.failed',{message:String(error?.message||error),destination:resolvedDestination||null,origin:context.origin,durationMinutes:context.durationMinutes,previousRouteId:context.previousRoute.id});
      throw error;
    }
  }

  proposeShortening({targetMinutes,removeCount=1,reason='Réduire le temps de visite'}={}){
    const proposal=proposalManager.create({action:'route.shorten',args:{targetMinutes,removeCount},reason,summary:Number.isFinite(Number(targetMinutes))?`Raccourcir le parcours vers environ ${Number(targetMinutes)} minutes en préservant les incontournables.`:'Raccourcir le parcours en préservant les incontournables.',requiresConfirmation:true});
    eventBus.emit('planner.proposal.ready',{proposalId:proposal.id,type:'shorten'});return proposal;
  }
}

export const plannerEngine=new PlannerEngine();
export {extractDurationMinutes,currentPlannerContext,resolveDestination};

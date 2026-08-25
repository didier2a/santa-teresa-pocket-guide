import {plannerClient} from './planner-client.js';
import {proposalManager} from '../core/proposal-manager.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';

function currentRouteSummary(){const route=pocketGuideState.select('route');return {id:route?.activeId||null,title:route?.title||null,currentEventId:route?.currentEventId||null,completedEventIds:route?.completedEventIds||[],skippedEventIds:route?.skippedEventIds||[],remainingMinutes:route?.remainingMinutes??null};}
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

export class PlannerEngine {
  async proposeReplacement({prompt,destination='',maxPlaces=5,timezone}={}){
    const request=String(prompt||'').trim();
    pocketGuideState.patch({conversation:{status:'thinking'}},{source:'planner-engine',event:'planner.started'});
    const context=currentPlannerContext(request);
    const resolvedDestination=String(destination||'').trim();
    const enriched=`${request}\n\nRÈGLES DE CONTEXTE POCKETGUIDE:\n- Le parcours actif précédent est uniquement un contexte à remplacer; il NE DOIT JAMAIS devenir la destination implicite d'un nouveau parcours.\n- Si l'utilisateur nomme une ville ou un lieu dans sa demande, ce lieu est prioritaire sur l'ancien parcours.\n- Si l'utilisateur dit « ici », « autour de moi » ou équivalent, utiliser l'origine GPS fournie ci-dessous.\n- Si durationMinutes est renseigné, le parcours complet doit tenir dans cette durée à partir de localTime.\nContexte structuré: ${JSON.stringify(context)}`;
    const result=await plannerClient.plan({prompt:enriched,destination:resolvedDestination,maxPlaces,timezone});
    const proposal=proposalManager.create({action:'route.replace',args:{pack:result.pack},reason:request,summary:`Remplacer le parcours par « ${result.pack.title} » (${result.pack.places?.length||0} lieux).`,requiresConfirmation:true,metadata:{plannerModel:result.plannerModel,verificationSources:result.verificationSources,requestedDestination:resolvedDestination||null,origin:context.origin,durationMinutes:context.durationMinutes}});
    eventBus.emit('planner.proposal.ready',{proposalId:proposal.id,routeId:result.pack.id});return {proposal,plan:result,context};
  }

  proposeShortening({targetMinutes,removeCount=1,reason='Réduire le temps de visite'}={}){
    const proposal=proposalManager.create({action:'route.shorten',args:{targetMinutes,removeCount},reason,summary:Number.isFinite(Number(targetMinutes))?`Raccourcir le parcours vers environ ${Number(targetMinutes)} minutes en préservant les incontournables.`:'Raccourcir le parcours en préservant les incontournables.',requiresConfirmation:true});
    eventBus.emit('planner.proposal.ready',{proposalId:proposal.id,type:'shorten'});return proposal;
  }
}

export const plannerEngine=new PlannerEngine();
export {extractDurationMinutes,currentPlannerContext};

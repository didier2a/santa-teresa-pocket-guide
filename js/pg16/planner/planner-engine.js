import {plannerClient} from './planner-client.js';
import {proposalManager} from '../core/proposal-manager.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';

function currentRouteSummary(){const route=pocketGuideState.select('route');return {id:route?.activeId||null,title:route?.title||null,currentEventId:route?.currentEventId||null,completedEventIds:route?.completedEventIds||[],skippedEventIds:route?.skippedEventIds||[],remainingMinutes:route?.remainingMinutes??null};}

export class PlannerEngine {
  async proposeReplacement({prompt,destination='',maxPlaces=5,timezone}={}){
    pocketGuideState.patch({conversation:{status:'thinking'}},{source:'planner-engine',event:'planner.started'});
    const context={route:currentRouteSummary(),location:pocketGuideState.select('location'),preferences:pocketGuideState.select('preferences')};
    const enriched=`${String(prompt||'').trim()}\n\nContexte PocketGuide actuel: ${JSON.stringify(context)}`;
    const result=await plannerClient.plan({prompt:enriched,destination,maxPlaces,timezone});
    const proposal=proposalManager.create({action:'route.replace',args:{pack:result.pack},reason:String(prompt||''),summary:`Remplacer le parcours par « ${result.pack.title} » (${result.pack.places?.length||0} lieux).`,requiresConfirmation:true,metadata:{plannerModel:result.plannerModel,verificationSources:result.verificationSources}});
    eventBus.emit('planner.proposal.ready',{proposalId:proposal.id,routeId:result.pack.id});return {proposal,plan:result};
  }

  proposeShortening({targetMinutes,removeCount=1,reason='Réduire le temps de visite'}={}){
    const proposal=proposalManager.create({action:'route.shorten',args:{targetMinutes,removeCount},reason,summary:Number.isFinite(Number(targetMinutes))?`Raccourcir le parcours vers environ ${Number(targetMinutes)} minutes en préservant les incontournables.`:'Raccourcir le parcours en préservant les incontournables.',requiresConfirmation:true});
    eventBus.emit('planner.proposal.ready',{proposalId:proposal.id,type:'shorten'});return proposal;
  }
}

export const plannerEngine=new PlannerEngine();
import {actionRegistry} from '../core/action-registry.js';
import {humanContextEngine} from '../core/context-engine.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';

const INTENTS=[
  {test:/\b(carte|map)\b/i,action:'ui.open_map',say:'Je vous ouvre la carte.'},
  {test:/\b(parcours|itin[eé]raire|journ[eé]e)\b/i,action:'ui.open_route',say:'Je vous montre le parcours.'},
  {test:/\b(planner|cr[eé]er|nouvelle balade|changer de balade)\b/i,action:'ui.open_create',say:'Je vous ouvre le Planner.'},
  {test:/\b(ar|r[eé]alit[eé] augment[eé]e)\b/i,action:'ar.open',say:'J’ouvre la vue Geo-AR.'},
  {test:/\b(raconte|explique|histoire|qu.est.ce que je regarde|ce que je regarde|ce lieu)\b/i,action:'place.explain',say:null},
  {test:/\b(suivant|continue|continuer|prochaine [eé]tape|et ensuite)\b/i,action:'route.next',say:null},
  {test:/\b(saute|sauter|ignore|passer cette [eé]tape)\b/i,action:'route.skip',say:'Je peux passer cette étape.'},
  {test:/\b(o[uù] (en )?(sommes|suis)|reste|encore combien|statut)\b/i,action:'route.status',say:null}
];

function allEvents(){return (pocketGuideState.select('route.pack')?.days||[]).flatMap(day=>day.events||[]);}
function eventById(id){return allEvents().find(event=>event?.id===id)||null;}
function placeById(id){return (pocketGuideState.select('route.pack')?.places||[]).find(place=>place?.id===id)||null;}
function placeForEventId(eventId){const event=eventById(eventId);return event?placeById(event.placeId):null;}
function displayName(eventId){const event=eventById(eventId);const place=event?placeById(event.placeId):null;return place?.name||place?.title||event?.title||event?.name||eventId||null;}

function statusAnswer(){
  const context=humanContextEngine.build();const route=context.route;
  if(!route.activeId)return 'Aucun parcours n’est chargé pour le moment.';
  const current=displayName(route.currentEventId);const next=displayName(route.nextEventId);
  const parts=[route.title||route.activeId];
  if(current)parts.push(`nous sommes à ${current}`);
  if(next)parts.push(`puis ${next}`);
  if(Number.isFinite(route.remainingMinutes))parts.push(`il reste environ ${Math.round(route.remainingMinutes)} minutes`);
  return `${parts.join('. ')}.`;
}

function explainAnswer(result){
  if(!result)return 'Je n’ai pas encore de description fiable pour ce lieu dans le RoutePack.';
  const lead=result.name?`${result.name}. `:'';
  const body=result.description||'Je n’ai pas encore de commentaire historique détaillé pour ce lieu.';
  const cue=result.cue?` Regardez ${result.cue}.`:'';
  return `${lead}${body}${cue}`.trim();
}

export class HumanGuide {
  context(){return humanContextEngine.build();}

  async handleText(text,{source='text'}={}){
    const message=String(text||'').trim();if(!message)return {type:'SAY',text:'Je vous écoute.'};
    pocketGuideState.patch({conversation:{status:'thinking',currentTopic:message}},{source:'human-guide',event:'guide.thinking'});
    eventBus.emit('guide.input',{text:message,source});
    const intent=INTENTS.find(item=>item.test.test(message));
    if(!intent){
      const current=displayName(pocketGuideState.select('route.currentEventId'));
      const answer=current
        ?`Je vous ai entendu. Nous sommes actuellement autour de ${current}. Pour cette Alpha 2, vous pouvez déjà me demander où nous en sommes, de raconter le lieu, d’ouvrir la carte, de continuer ou de sauter une étape.`
        :`Je vous ai entendu. ${humanContextEngine.summary()}`;
      pocketGuideState.patch({conversation:{status:'idle'}},{source:'human-guide',event:'guide.idle'});
      return {type:'SAY',text:answer};
    }
    const definition=actionRegistry.describe(intent.action);
    if(definition?.confirmation==='required'||definition?.confirmation==='recommended'){
      const proposal={id:`p_${Date.now()}`,type:'action',action:intent.action,args:{},requiresConfirmation:true,createdAt:new Date().toISOString()};
      pocketGuideState.patch({proposals:{pending:proposal},conversation:{status:'waiting_confirmation',lastAction:intent.action}},{source:'human-guide',event:'proposal.created'});
      return {type:'ASK',text:`${intent.say||'Je peux le faire.'} Vous confirmez ?`,proposal};
    }
    const execution=await actionRegistry.execute(intent.action,{}, {source:'human-guide'});
    let answer=intent.say||'C’est fait.';
    if(intent.action==='route.status')answer=statusAnswer();
    if(intent.action==='place.explain')answer=explainAnswer(execution?.result);
    if(intent.action==='route.next'){
      const current=displayName(pocketGuideState.select('route.currentEventId'));
      answer=current?`Très bien. On continue vers ${current}.`:'Le parcours est terminé.';
    }
    pocketGuideState.patch({conversation:{status:'idle',lastAction:intent.action}},{source:'human-guide',event:'guide.idle'});
    return {type:'SAY',text:answer,execution};
  }

  async confirmPending(confirmed){
    const proposal=pocketGuideState.select('proposals.pending');
    if(!proposal)return {type:'SAY',text:'Je n’ai aucune proposition en attente.'};
    if(!confirmed){
      pocketGuideState.patch({proposals:{pending:null,lastResolved:{...proposal,status:'rejected'}},conversation:{status:'idle'}},{source:'human-guide',event:'proposal.rejected'});
      return {type:'SAY',text:'D’accord, je ne change rien.'};
    }
    const execution=await actionRegistry.execute(proposal.action,proposal.args||{}, {source:'human-guide-confirmation',proposalId:proposal.id});
    pocketGuideState.patch({proposals:{pending:null,lastResolved:{...proposal,status:'confirmed'}},conversation:{status:'idle',lastAction:proposal.action}},{source:'human-guide',event:'proposal.confirmed'});
    const current=displayName(pocketGuideState.select('route.currentEventId'));
    return {type:'SAY',text:current?`C’est confirmé. On continue vers ${current}.`:'C’est confirmé.',execution};
  }
}

export const humanGuide=new HumanGuide();

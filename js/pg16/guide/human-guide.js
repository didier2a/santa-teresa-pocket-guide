import {actionRegistry} from '../core/action-registry.js';
import {humanContextEngine} from '../core/context-engine.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';

const INTENTS=[
  {test:/\b(carte|map)\b/i,action:'ui.open_map',say:'Je vous ouvre la carte.'},
  {test:/\b(parcours|itin[eé]raire|journ[eé]e)\b/i,action:'ui.open_route',say:'Je vous montre le parcours.'},
  {test:/\b(ar|r[eé]alit[eé] augment[eé]e)\b/i,action:'ar.open',say:'J’ouvre la vue Geo-AR.'},
  {test:/\b(suivant|continue|continuer|prochaine [eé]tape)\b/i,action:'route.next',say:'Très bien, on continue.'},
  {test:/\b(saute|sauter|ignore|passer cette [eé]tape)\b/i,action:'route.skip',say:'Je peux passer cette étape.'},
  {test:/\b(o[uù] (en )?(sommes|suis)|reste|encore combien|statut)\b/i,action:'route.status',say:null}
];

function statusAnswer(){
  const context=humanContextEngine.build();const route=context.route;
  if(!route.activeId)return 'Aucun parcours n’est chargé pour le moment.';
  const parts=[route.title||route.activeId];
  if(route.currentEventId)parts.push(`étape actuelle ${route.currentEventId}`);
  if(route.nextEventId)parts.push(`puis ${route.nextEventId}`);
  if(Number.isFinite(route.remainingMinutes))parts.push(`environ ${Math.round(route.remainingMinutes)} minutes restantes`);
  return `Nous sommes sur ${parts.join(', ')}.`;
}

export class HumanGuide {
  context(){return humanContextEngine.build();}

  async handleText(text,{source='text'}={}){
    const message=String(text||'').trim();if(!message)return {type:'SAY',text:'Je vous écoute.'};
    pocketGuideState.patch({conversation:{status:'thinking',currentTopic:message}},{source:'human-guide',event:'guide.thinking'});
    eventBus.emit('guide.input',{text:message,source});
    const intent=INTENTS.find(item=>item.test.test(message));
    if(!intent){
      const answer=`Je vous ai entendu. Mon contexte actuel est : ${humanContextEngine.summary()}. L’interprétation IA complète sera branchée dans l’étape suivante de la 1.6.`;
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
    const answer=intent.action==='route.status'?statusAnswer():(intent.say||'C’est fait.');
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
    return {type:'SAY',text:'C’est confirmé.',execution};
  }
}

export const humanGuide=new HumanGuide();

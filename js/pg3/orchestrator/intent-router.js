import {eventBus} from '../../pg16/core/event-bus.js';
import {proposalManager} from '../../pg16/core/proposal-manager.js';
import {journeyConcierge} from '../../pg21/companion/journey-concierge.js';
import {classifyPocketGuideCommand,guideCommandRouter} from '../../pg233/core/guide-command-router.js';
import {cyberneticStateMachine} from '../core/cybernetic-state-machine.js';

const SUMMARIES=Object.freeze({
  create_itinerary:'Créer un itinéraire illustré et vérifiable',edit_itinerary:'Préparer une modification sans altérer le voyage actif',shorten_route:'Préparer un parcours plus court',skip_step:'Préparer le passage de cette étape',
  confirm_proposal:'Confirmer et enregistrer la proposition',reject_proposal:'Conserver le voyage actuel',undo_change:'Restaurer le voyage précédent',
  start_guidance:'Ouvrir la carte et démarrer le guidage GPS',repeat_guidance:'Répéter la dernière instruction',route_status:'Contrôler la progression du parcours',continue_route:'Continuer vers l’étape suivante',
  show_map:'Afficher la carte du parcours',present_route:'Présenter les étapes et leurs médias',show_route_content:'Réunir carte, photos et fiches',show_place:'Afficher la fiche fiable du lieu',
  save_current_journey:'Sauvegarder le voyage sur ce téléphone',list_saved_journeys:'Lister les voyages sauvegardés',open_saved_journey:'Reprendre le voyage demandé',open_saved_journeys:'Ouvrir les voyages sauvegardés',manage_saved_journeys:'Gérer les voyages sauvegardés'
});

function defaultContext(){return{pendingProposal:Boolean(proposalManager.pending?.()),planningActive:Boolean(journeyConcierge.active)};}
function compactProof(intent,result={}){
  const proof={intent};
  for(const key of ['proposalId','routeId','placeId','itineraryId','count'])if(result[key]!==undefined&&result[key]!==null)proof[key]=result[key];
  if(result.snapshot)proof.guidance={phase:result.snapshot.phase||null,instruction:Boolean(result.snapshot.instruction),accuracy:result.snapshot.accuracy??null};
  if(result.execution)proof.execution=Boolean(result.execution.ok!==false);
  return proof;
}

export function evaluateIntentProof(intent,result={}){
  if(!result||result.ok===false||result.error)return{state:'failed',reason:'execution-failed',detail:'Action non terminée',evidence:compactProof(intent,result||{})};
  if(result.degraded)return{state:'degraded',reason:result.reason||'capability-degraded',detail:result.speech||'Fonction disponible en mode dégradé',evidence:compactProof(intent,result)};
  if(result.awaiting)return{state:'blocked',reason:'awaiting-input',detail:'Informations complémentaires nécessaires',evidence:{...compactProof(intent,result),awaiting:result.awaiting}};
  if(intent==='start_guidance'&&!result.snapshot)return{state:'blocked',reason:'permission-required',detail:'Autorisation GPS nécessaire',evidence:compactProof(intent,result)};
  if(intent==='create_itinerary'&&!result.proposalId&&!result.routeId)return{state:'blocked',reason:'awaiting-route-request',detail:'Destination ou préférences nécessaires',evidence:compactProof(intent,result)};
  if(intent==='edit_itinerary'&&!result.proposalId&&/dites-moi|précisément/i.test(String(result.speech||'')))return{state:'blocked',reason:'awaiting-edit-request',detail:'Modification précise nécessaire',evidence:compactProof(intent,result)};
  return{state:'succeeded',reason:'proof-observed',detail:result.speech||'Action terminée et vérifiée',evidence:compactProof(intent,result)};
}

export class IntentRouter{
  constructor({delegate=guideCommandRouter,machine=cyberneticStateMachine,bus=eventBus,classifier=classifyPocketGuideCommand,context=defaultContext,autoDelay=3000,verificationDelay=180,logger=console,schedule=setTimeout,cancelSchedule=clearTimeout}={}){
    this.delegate=delegate;this.machine=machine;this.bus=bus;this.classifier=classifier;this.context=context;this.autoDelay=Math.max(0,Number(autoDelay)||0);this.verificationDelay=Math.max(0,Number(verificationDelay)||0);this.logger=logger;this.schedule=schedule;this.cancelSchedule=cancelSchedule;this.sequence=0;this.active=null;
  }
  summaryFor(intent){return SUMMARIES[intent]||'Exécuter la commande dans PocketGuide';}
  current(){if(!this.active)return null;const {resolve,timer,completion,...publicRecord}=this.active;return{...publicRecord};}
  handle(text,{source='guide',autoDelay=this.autoDelay}={}){
    const request=String(text||'').trim();if(!request)return{handled:false};
    const intent=this.classifier(request,this.context());if(!intent){this.bus.emit('pg3.intent.unhandled',{source});return{handled:false};}
    if(this.active?.status==='running'){
      const result={ok:false,busy:true,intent:intent.type,speech:'Je termine d’abord l’action en cours, puis vous pourrez me donner la suivante.'};
      this.bus.emit('pg3.intent.busy',{intent:intent.type,source});return{handled:true,id:this.active.id,intent:intent.type,completion:Promise.resolve(result),launch:()=>Promise.resolve(result),cancel:()=>false};
    }
    if(this.active?.status==='pending')this.cancel(this.active.id,'superseded');
    const id=`pg3-command-${++this.sequence}`,delay=Math.max(0,Number(autoDelay)||0),createdAt=Date.now();let resolveCompletion;
    const completion=new Promise(resolve=>{resolveCompletion=resolve;});
    const record={id,intent:intent.type,text:request,summary:this.summaryFor(intent.type),source,status:'pending',createdAt,autoAt:createdAt+delay,timer:null,resolve:resolveCompletion,completion};
    this.active=record;
    this.machine.transition('listening',{commandId:id,intent:intent.type,detail:'Commande reçue',reason:'intent-received',source});
    this.machine.transition('interpreting',{commandId:id,intent:intent.type,detail:'Compréhension de la demande',reason:'intent-classified',source});
    this.machine.transition('checking',{commandId:id,intent:intent.type,detail:record.summary,reason:'preflight',source});
    this.logger?.info?.('[PocketGuide V3] intent ready',{id,intent:intent.type,source,autoDelay:delay});
    this.bus.emit('pg3.intent.ready',{id,intent:intent.type,text:request,summary:record.summary,source,autoAt:record.autoAt,autoDelay:delay});
    record.timer=this.schedule(()=>{void this.launch(id);},delay);
    return{handled:true,id,intent:intent.type,completion,launch:()=>this.launch(id),cancel:reason=>this.cancel(id,reason)};
  }
  launch(id=this.active?.id){
    const record=this.active;if(!record||record.id!==id)return Promise.resolve({ok:false,stale:true,speech:'Cette commande n’est plus active.'});
    if(record.status==='running')return record.completion;
    this.cancelSchedule(record.timer);record.timer=null;record.status='running';
    this.machine.transition('acting',{commandId:record.id,intent:record.intent,detail:record.summary,reason:'execution-started',source:record.source});
    this.logger?.info?.('[PocketGuide V3] intent launched',{id:record.id,intent:record.intent,source:record.source});
    this.bus.emit('pg3.intent.launched',{id:record.id,intent:record.intent,text:record.text,summary:record.summary,source:record.source});
    let routed;try{routed=this.delegate.handle(record.text,{source:record.source});}catch(error){this.fail(record,error);return record.completion;}
    if(!routed?.handled){this.fail(record,new Error('La commande reconnue n’a pas été acceptée par le moteur applicatif.'));return record.completion;}
    record.delegateId=routed.id||null;
    Promise.resolve(routed.completion).then(result=>this.complete(record,result)).catch(error=>this.fail(record,error));return record.completion;
  }
  async complete(record,result){
    if(this.active?.id!==record.id)return;
    this.machine.transition('verifying',{commandId:record.id,intent:record.intent,detail:'Contrôle du résultat',reason:'execution-completed',source:record.source});
    if(this.verificationDelay)await new Promise(resolve=>this.schedule(resolve,this.verificationDelay));
    const verdict=evaluateIntentProof(record.intent,result);
    this.machine.transition(verdict.state,{commandId:record.id,intent:record.intent,detail:verdict.detail,reason:verdict.reason,evidence:verdict.evidence,source:record.source});
    const enriched={...result,pg3:{commandId:record.id,intent:record.intent,state:verdict.state,proof:verdict.evidence}};
    record.status='completed';record.resolve(enriched);this.active=null;
    this.logger?.info?.('[PocketGuide V3] intent completed',{id:record.id,intent:record.intent,state:verdict.state,reason:verdict.reason});
    this.bus.emit('pg3.intent.completed',{id:record.id,intent:record.intent,result:enriched,state:verdict.state,proof:verdict.evidence,source:record.source});
  }
  fail(record,error){
    if(this.active?.id!==record.id)return;
    const message=String(error?.message||error||'Erreur inconnue');
    this.machine.transition('failed',{commandId:record.id,intent:record.intent,detail:'Action interrompue',reason:'exception',evidence:{intent:record.intent,error:'runtime-error'},source:record.source});
    const result={ok:false,intent:record.intent,speech:`Je n’ai pas pu terminer cette action : ${message}. Votre voyage actuel reste intact.`,error:message,pg3:{commandId:record.id,intent:record.intent,state:'failed',proof:{intent:record.intent,error:'runtime-error'}}};
    record.status='failed';record.resolve(result);this.active=null;this.logger?.error?.('[PocketGuide V3] intent failed',{id:record.id,intent:record.intent,error:message});
    this.bus.emit('pg3.intent.failed',{id:record.id,intent:record.intent,result,source:record.source});
  }
  cancel(id=this.active?.id,reason='user'){
    const record=this.active;if(!record||record.id!==id||record.status!=='pending')return false;
    this.cancelSchedule(record.timer);record.timer=null;record.status='cancelled';
    const result={ok:false,cancelled:true,intent:record.intent,speech:'Commande mise en modification.',pg3:{commandId:record.id,intent:record.intent,state:'idle',proof:{intent:record.intent,cancelled:true}}};
    this.machine.transition('idle',{detail:'Commande à modifier',reason:`intent-${reason}`,source:record.source});record.resolve(result);this.active=null;
    this.bus.emit('pg3.intent.cancelled',{id:record.id,intent:record.intent,text:record.text,reason,source:record.source});return true;
  }
}

export const intentRouter=new IntentRouter();

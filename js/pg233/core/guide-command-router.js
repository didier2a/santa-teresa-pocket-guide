import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {actionRegistry} from '../../pg16/core/action-registry.js';
import {proposalManager} from '../../pg16/core/proposal-manager.js';
import {plannerEngine} from '../../pg16/planner/planner-engine.js';
import {humanGuide} from '../../pg16/guide/human-guide.js';
import {walkingGuidanceEngine} from '../../pg17/guidance/walking-guidance-engine.js';
import {itineraryManager} from '../../pg18/itineraries/itinerary-manager.js';
import {journeyConcierge} from '../../pg21/companion/journey-concierge.js';
import {livingSceneEngine} from '../../pg23/scenes/living-scene-engine.js';
import {attributionForPlace} from '../../pg23/scenes/route-presentation-director.js';

const YES=/^(?:oui|yes|ok|d['’]?accord|confirme|je confirme|vas[- ]?y|c['’]est bon)[,.!?\s]*$/i;
const NO=/^(?:non|no|annule|annuler|pas maintenant|ne change rien|non[,\s]+ne change rien)[,.!?\s]*$/i;
const ROUTE_WORD='(?:itin[ée]raire|parcours|excursion|balade|voyage)';

export function normalizeCommand(value=''){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,"'").replace(/[^a-z0-9' ]+/g,' ').replace(/\s+/g,' ').trim();
}

function namedJourneyQuery(text=''){
  const match=String(text).match(/\b(?:ouvre|reprends?|charge)\s+(?:le\s+)?(?:voyage|itin[ée]raire|parcours)\s+(?:appel[ée]\s+)?[«“\"]?(.+?)[»”\"]?[.!?]*$/i);
  return match?.[1]?.trim()||'';
}

function requestedPlaceQuery(text=''){
  const match=String(text).match(/\b(?:fiche|photo|images?|raconte|explique|montre(?:-moi)?)\s+(?:de|du|d['’]|sur)?\s*[«“\"]?([^.!?]+?)[»”\"]?[.!?]*$/i);
  const value=match?.[1]?.trim()||'';
  return /^(?:ce lieu|ici|l['’]étape actuelle|l['’]endroit)$/i.test(value)?'':value;
}

export function classifyPocketGuideCommand(text,{pendingProposal=false,planningActive=false}={}){
  const raw=String(text||'').trim(),value=normalizeCommand(raw);
  if(!value)return null;
  if(pendingProposal&&YES.test(raw))return{type:'confirm_proposal'};
  if(pendingProposal&&NO.test(raw))return{type:'reject_proposal'};
  if(planningActive)return{type:'create_itinerary',continuation:true};

  const savedNamed=namedJourneyQuery(raw);
  if(savedNamed&&/\b(?:ouvre|reprends?|charge)\b/i.test(raw))return{type:'open_saved_journey',query:savedNamed};
  if(/\b(?:sauvegarde|enregistre|garde)\b[\s\S]{0,35}\b(?:voyage|itineraire|parcours)\b/.test(value))return{type:'save_current_journey'};
  if(/\b(?:mes voyages|voyages sauvegardes|itineraires sauvegardes|bibliotheque de voyages|archives de voyages)\b/.test(value))return{type:/\b(?:liste|quels|combien|montre)\b/.test(value)?'list_saved_journeys':'open_saved_journeys'};
  if(/\b(?:supprime|efface|archive|renomme|duplique)\b[\s\S]{0,35}\b(?:voyage|itineraire|parcours)\b/.test(value))return{type:'manage_saved_journeys'};

  if(/\b(?:repete|redis|rappelle)\b[\s\S]{0,28}\b(?:direction|indication|instruction|guidage)\b/.test(value))return{type:'repeat_guidance'};
  if(/\b(?:guide moi|guidage|navigation)\b[\s\S]{0,36}\b(?:gps|etape par etape|pas a pas)\b|\b(?:demarre|lance|active)\b[\s\S]{0,24}\b(?:gps|guidage|navigation)\b/.test(value))return{type:'start_guidance'};
  if(/\b(?:ou sommes nous|ou suis je|prochaine etape|direction actuelle|combien reste|temps restant)\b/.test(value))return{type:'route_status'};
  if(/\b(?:etape suivante|passe a la suite|continue vers la prochaine|valide cette etape)\b/.test(value))return{type:'continue_route'};

  const asksMap=/\b(?:carte|map)\b/.test(value),asksPhoto=/\b(?:photo|photos|image|images)\b/.test(value),asksSheet=/\b(?:fiche|fiches|details du lieu|informations du lieu)\b/.test(value);
  if([asksMap,asksPhoto,asksSheet].filter(Boolean).length>=2)return{type:'show_route_content'};
  if(asksMap&&/\b(?:affiche|ouvre|montre|voir|consulte|carte)\b/.test(value))return{type:'show_map'};
  if(asksPhoto&&/\b(?:affiche|ouvre|montre|voir|presente)\b/.test(value))return{type:'present_route'};
  if(asksSheet||/\b(?:raconte moi|explique moi|parle moi)\b/.test(value))return{type:'show_place',query:requestedPlaceQuery(raw)};

  if(new RegExp(`\\b(?:raccourcis?|reduis|moins de temps)\\b[\\s\\S]{0,45}\\b${ROUTE_WORD}\\b|\\b${ROUTE_WORD}\\b[\\s\\S]{0,35}\\b(?:plus court|moins long)\\b`,'i').test(value))return{type:'shorten_route'};
  if(/\b(?:saute|ignore|passe)\b[\s\S]{0,24}\b(?:cette|l')?\s*etape\b/.test(value))return{type:'skip_step'};
  if(new RegExp(`\\b(?:modifie|modifier|change|changer|ajoute|ajouter|retire|retirer|supprime|supprimer|deplace|deplacer|inverse|inverser|reordonne|reordonner|decale|decaler|remplace|remplacer)\\b[\\s\\S]{0,80}\\b${ROUTE_WORD}|\\b${ROUTE_WORD}\\b[\\s\\S]{0,60}\\b(?:ajoute|ajouter|retire|retirer|supprime|supprimer|deplace|deplacer|inverse|inverser|change|changer)`,'i').test(value))return{type:'edit_itinerary'};
  if(new RegExp(`\\b(?:cree|creer|prepare|preparer|organise|nouveau|nouvelle|autre)\\b[\\s\\S]{0,60}\\b${ROUTE_WORD}\\b|\\b${ROUTE_WORD}\\b[\\s\\S]{0,36}\\b(?:ici|autour de moi|a |au |aux |en )`,'i').test(value))return{type:'create_itinerary'};
  if(/\b(?:montre|affiche|presente|ouvre)\b[\s\S]{0,32}\b(?:itineraire|parcours|etapes|voyage)\b/.test(value))return{type:'present_route'};
  return null;
}

function routeEvents(pack){return(pack?.days||[]).flatMap(day=>day.events||[]);}
function routePlaces(pack){return Array.isArray(pack?.places)?pack.places:[];}
function currentPlace(state){
  const pack=state.select('route.pack'),event=routeEvents(pack).find(item=>item.id===state.select('route.currentEventId'));
  return routePlaces(pack).find(place=>place.id===event?.placeId)||routePlaces(pack)[0]||null;
}
function placeForQuery(state,query=''){
  const places=routePlaces(state.select('route.pack')),needle=normalizeCommand(query);
  if(!needle)return currentPlace(state);
  return places.find(place=>normalizeCommand(place.name||place.title)===needle)||places.find(place=>normalizeCommand(place.name||place.title).includes(needle)||needle.includes(normalizeCommand(place.name||place.title)))||null;
}
function routeStatusSpeech(state,guidance){
  const route=state.select('route')||{},pack=route.pack||{},events=routeEvents(pack),current=events.find(event=>event.id===route.currentEventId),next=events.find(event=>event.id===route.nextEventId),places=new Map(routePlaces(pack).map(place=>[place.id,place]));
  if(!pack.id)return'Aucun itinéraire n’est chargé pour le moment.';
  const currentName=places.get(current?.placeId)?.name||current?.title||'',nextName=places.get(next?.placeId)?.name||next?.title||'',parts=[];
  if(currentName)parts.push(`L’étape actuelle est ${currentName}`);if(nextName)parts.push(`la suivante sera ${nextName}`);if(Number.isFinite(route.remainingMinutes))parts.push(`il reste environ ${Math.round(route.remainingMinutes)} minutes`);
  const instruction=guidance?.lastSnapshot?.instruction;return`${parts.join(', ')||`Le parcours « ${pack.title} » est prêt`}.${instruction?` ${instruction}`:''}`;
}
function revisionPack(pack={}){
  return{title:pack.title||'',timezone:pack.timezone||'',start:pack.start||'',end:pack.end||'',days:(pack.days||[]).map(day=>({date:day.date,label:day.label,events:(day.events||[]).map(event=>({id:event.id,time:event.time,end:event.end,title:event.title,type:event.type,placeId:event.placeId,navigationMode:event.navigationMode}))})),places:(pack.places||[]).map(place=>({id:place.id,name:place.name,lat:place.lat,lng:place.lng,note:place.note,description:place.description,mustSee:Boolean(place.mustSee),priority:place.priority??null}))};
}
export function buildRouteRevisionPrompt(instruction,pack){
  return`Modifie le parcours actuel selon cette instruction explicite du voyageur : ${String(instruction||'').trim()}\n\nConserve toutes les étapes, contraintes et informations qui ne sont pas explicitement modifiées. Produis un nouveau RoutePack complet et cohérent, qui sera présenté comme une proposition avant confirmation.\n\nPARCOURS ACTUEL À RÉVISER :\n${JSON.stringify(revisionPack(pack))}`;
}
function genericEditRequest(text=''){
  const value=normalizeCommand(text).replace(/\b(?:s'il te plait|stp|merci)\b/g,'').trim();
  return /^(?:je veux |peux tu |tu peux )?(?:modifier|modifie|changer|change) (?:mon |le |l')?(?:itineraire|parcours|voyage)$/.test(value);
}
function outcome(intent,speech,detail={}){return{ok:true,intent,speech:String(speech||''),...detail};}

export class GuideCommandRouter{
  constructor({state=pocketGuideState,bus=eventBus,actions=actionRegistry,proposals=proposalManager,planner=plannerEngine,guide=humanGuide,guidance=walkingGuidanceEngine,itineraries=itineraryManager,concierge=journeyConcierge,scenes=livingSceneEngine}={}){
    this.state=state;this.bus=bus;this.actions=actions;this.proposals=proposals;this.planner=planner;this.guide=guide;this.guidance=guidance;this.itineraries=itineraries;this.concierge=concierge;this.scenes=scenes;this.sequence=0;
  }
  handle(text,{source='guide'}={}){
    const value=String(text||'').trim(),intent=classifyPocketGuideCommand(value,{pendingProposal:Boolean(this.proposals.pending?.()),planningActive:Boolean(this.concierge.active)});
    if(!intent)return{handled:false};const id=`pg233-command-${++this.sequence}`;this.bus.emit('pg233.command.started',{id,intent:intent.type,text:value,source});
    const completion=this.execute(intent,value,{source,id}).then(result=>{this.bus.emit('pg233.command.completed',{id,intent:intent.type,result,source});return result;}).catch(error=>{const result={ok:false,intent:intent.type,speech:`Je n’ai pas pu terminer cette action : ${error?.message||error}. Votre voyage actuel reste intact.`,error:String(error?.message||error)};this.bus.emit('pg233.command.failed',{id,intent:intent.type,result,source});return result;});
    return{handled:true,id,intent:intent.type,completion};
  }
  async execute(intent,text,{source='guide'}={}){
    switch(intent.type){
      case'confirm_proposal':{const reply=await this.guide.confirmPending(true);await this.itineraries.saveCurrent('pg233-confirmed').catch(()=>null);return outcome(intent.type,reply.text||'C’est confirmé. Le nouvel itinéraire est enregistré.');}
      case'reject_proposal':{const reply=await this.guide.confirmPending(false);return outcome(intent.type,reply.text||'D’accord, je ne change rien.');}
      case'create_itinerary':{
        const location=this.state.select('location')||{},request=this.concierge.consume(text,{location:{...location,simulated:Boolean(this.state.select('session.simulation'))}});
        if(!request.handled)return outcome(intent.type,'Dites-moi la destination, la durée, le rythme et ce que vous aimez découvrir.');
        if(request.needsLocation)this.bus.emit('ui.location.requested',{source:'pg233-command'});
        if(!request.ready)return outcome(intent.type,request.reply,{awaiting:this.concierge.awaiting});
        this.bus.emit('pg233.planning.started',{request:request.request});const planned=await this.planner.proposeReplacement(request.request);this.bus.emit('pg233.planning.completed',{routeId:planned.plan.pack.id});
        return outcome(intent.type,`J’ai préparé « ${planned.plan.pack.title} ». Regardez la proposition, puis confirmez-la seulement si elle vous convient.`,{proposalId:planned.proposal.id,routeId:planned.plan.pack.id});
      }
      case'edit_itinerary':{
        const pack=this.state.select('route.pack');if(!pack?.id)return outcome(intent.type,'Chargez d’abord un voyage, puis dites-moi ce que vous souhaitez modifier.');
        if(genericEditRequest(text)){this.bus.emit('pg233.planner.requested',{mode:'edit'});return outcome(intent.type,'Dites-moi précisément ce que vous voulez ajouter, retirer, déplacer ou changer.');}
        this.bus.emit('pg233.planning.started',{mode:'revision'});const planned=await this.planner.proposeReplacement({prompt:buildRouteRevisionPrompt(text,pack),maxPlaces:Math.max(3,Math.min(10,routePlaces(pack).length||5))});this.bus.emit('pg233.planning.completed',{routeId:planned.plan.pack.id,mode:'revision'});
        return outcome(intent.type,`J’ai préparé une version modifiée de « ${planned.plan.pack.title} ». Le parcours actuel reste intact tant que vous ne confirmez pas.`,{proposalId:planned.proposal.id,routeId:planned.plan.pack.id});
      }
      case'shorten_route':{const result=await this.guide.handleText(text,{source:'pg233-command'});return outcome(intent.type,result.text||'Je vous propose une version plus courte. Confirmez-la seulement si elle vous convient.',{proposalId:result.proposal?.id||null});}
      case'skip_step':{const result=await this.guide.handleText(text,{source:'pg233-command'});return outcome(intent.type,result.text||'Je peux passer cette étape. Vous confirmez ?',{proposalId:result.proposal?.id||null});}
      case'continue_route':{const arrived=this.guidance.lastSnapshot?.phase==='arrived';if(arrived){await this.guidance.continueAfterArrival({source:'pg233-command'});return outcome(intent.type,'Très bien, je passe à l’étape suivante et je poursuis le guidage.');}const execution=await this.actions.execute('route.next',{}, {source:'pg233-command'});return outcome(intent.type,'Très bien, nous passons à l’étape suivante.',{execution});}
      case'start_guidance':{await this.actions.execute('ui.open_map',{}, {source:'pg233-command'});if(this.state.select('perception.gps')==='ready'){const snapshot=await this.guidance.processPosition();return outcome(intent.type,snapshot?.instruction||'Le GPS est actif. Je vous guide maintenant étape par étape.',{snapshot});}this.bus.emit('ui.location.requested',{source:'pg233-command'});return outcome(intent.type,'J’ouvre le parcours. Touchez « Autoriser ma position » pour que je puisse vous guider par GPS étape par étape.');}
      case'repeat_guidance':{const repeated=this.guidance.repeatLastCue();return outcome(intent.type,repeated?(this.guidance.lastSnapshot?.instruction||'Je répète la dernière indication.'):'Je n’ai pas encore d’indication GPS à répéter. Lancez d’abord le guidage.');}
      case'route_status':return outcome(intent.type,routeStatusSpeech(this.state,this.guidance));
      case'show_map':{const execution=await this.actions.execute('ui.open_map',{}, {source:'pg233-command'});return outcome(intent.type,'J’ouvre la carte du parcours avec les étapes dans leur ordre réel.',{execution});}
      case'present_route':{const execution=await this.actions.execute('pg23.present_route',{speak:false},{source:'pg233-command'});return outcome(intent.type,'Je vous présente maintenant l’itinéraire, étape par étape, avec les photographies disponibles et leurs sources.',{execution});}
      case'show_route_content':{await this.actions.execute('ui.open_map',{}, {source:'pg233-route-content'});const execution=await this.actions.execute('pg23.present_route',{speak:false},{source:'pg233-route-content'});return outcome(intent.type,'La carte, les étapes, les fiches et les photographies disponibles sont maintenant réunies dans l’espace Voyage.',{execution});}
      case'show_place':{
        const place=placeForQuery(this.state,intent.query);if(!place)return outcome(intent.type,intent.query?`Je ne trouve pas « ${intent.query} » dans l’itinéraire actif.`:'Aucune étape n’est disponible pour le moment.');
        await this.actions.execute('ui.open_companion',{}, {source:'pg233-command'});const image=place.heroImage||place.media?.[0]?.url||'',description=place.historyLong||place.historyShort||place.description||place.note||'La fiche de ce lieu ne contient pas encore de récit détaillé.';
        this.scenes.create({id:`pg233-place-${String(place.id||Date.now()).replace(/[^a-zA-Z0-9._:-]/g,'-')}`,type:image?'media':'poi',title:place.name||place.title||'Étape du parcours',text:description,image,attribution:attributionForPlace(place),persist:true,source:'pg233-command',meta:{placeId:place.id,mediaStatus:image?'available':'unavailable'}});
        return outcome(intent.type,`${place.name}. ${description}`,{placeId:place.id});
      }
      case'save_current_journey':{const record=await this.itineraries.saveCurrent('pg233-command');await this.actions.execute('ui.open_memories',{}, {source:'pg233-command'});return outcome(intent.type,record?`« ${record.label||record.title} » est enregistré sur ce téléphone.`:'Aucun voyage actif ne peut être sauvegardé.');}
      case'list_saved_journeys':{const items=await this.itineraries.list({includeArchived:false});await this.actions.execute('ui.open_memories',{}, {source:'pg233-command'});if(!items.length)return outcome(intent.type,'Aucun voyage sauvegardé n’est encore disponible sur ce téléphone.');const names=items.slice(0,4).map(item=>item.label||item.title).filter(Boolean);return outcome(intent.type,`Vous avez ${items.length} voyage${items.length>1?'s':''} sauvegardé${items.length>1?'s':''} : ${names.join(', ')}${items.length>4?', et d’autres':''}.`,{count:items.length});}
      case'open_saved_journey':{const items=await this.itineraries.list({includeArchived:false}),needle=normalizeCommand(intent.query),item=items.find(entry=>normalizeCommand(entry.label||entry.title)===needle)||items.find(entry=>normalizeCommand(entry.label||entry.title).includes(needle)||needle.includes(normalizeCommand(entry.label||entry.title)));if(!item){await this.actions.execute('ui.open_memories',{}, {source:'pg233-command'});return outcome(intent.type,`Je ne trouve pas de voyage sauvegardé nommé « ${intent.query} ». J’ouvre la liste pour que vous puissiez le choisir.`);}await this.itineraries.load(item.id);await this.actions.execute('ui.open_companion',{}, {source:'pg233-command'});return outcome(intent.type,`Nous reprenons « ${item.label||item.title} » exactement où vous l’aviez laissé.`,{itineraryId:item.id});}
      case'open_saved_journeys':
      case'manage_saved_journeys':{const execution=await this.actions.execute('ui.open_memories',{}, {source:'pg233-command'});return outcome(intent.type,'J’ouvre vos voyages sauvegardés. Vous pouvez les reprendre, renommer, dupliquer, archiver, exporter ou supprimer.',{execution});}
      default:return outcome(intent.type,'Cette action n’est pas encore disponible.');
    }
  }
}

export const guideCommandRouter=new GuideCommandRouter();

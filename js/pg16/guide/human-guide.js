import {actionRegistry} from '../core/action-registry.js';
import {humanContextEngine} from '../core/context-engine.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {eventBus} from '../core/event-bus.js';
import {proposalManager} from '../core/proposal-manager.js';
import {transactionManager} from '../core/transaction-manager.js';
import {memoryStore} from '../memory/memory-store.js';
import {plannerEngine} from '../planner/planner-engine.js';

const INTENTS=[
  {test:/\b(carte|map)\b/i,action:'ui.open_map',say:'Je vous ouvre la carte.'},
  {test:/\b(parcours|itin[eé]raire|journ[eé]e)\b/i,action:'ui.open_route',say:'Je vous montre le parcours.'},
  {test:/\b(ar|r[eé]alit[eé] augment[eé]e)\b/i,action:'ar.open',say:'J’ouvre la vue Geo-AR.'},
  {test:/\b(suivant|continue|continuer|prochaine [eé]tape)\b/i,action:'route.next',say:'Très bien, on continue.'},
  {test:/\b(saute|sauter|ignore|passer cette [eé]tape)\b/i,action:'route.skip',say:'Je peux passer cette étape.'},
  {test:/\b(o[uù] (en )?(sommes|suis)|reste|encore combien|statut)\b/i,action:'route.status',say:null},
  {test:/\b(celui d['’]apr[eè]s|le suivant|le prochain lieu)\b/i,action:'place.explain_next',say:null},
  {test:/\b(raconte|explique|histoire|qu['’]est-ce que je regarde)\b/i,action:'place.explain',say:null}
];

function placeById(id){return (pocketGuideState.select('route.pack')?.places||[]).find(place=>place?.id===id)||null;}
function nameForEvent(id){const route=pocketGuideState.select('route'),events=(route?.pack?.days||[]).flatMap(day=>day.events||[]),event=events.find(item=>item?.id===id),place=event?placeById(event.placeId):null;return place?.name||place?.title||event?.title||event?.name||id||null;}
function statusAnswer(){const context=humanContextEngine.build(),route=context.route;if(!route.activeId)return 'Aucun parcours n’est chargé pour le moment.';const parts=[route.title||route.activeId],current=nameForEvent(route.currentEventId),next=nameForEvent(route.nextEventId);if(current)parts.push(`nous sommes à ${current}`);if(next)parts.push(`puis ${next}`);if(Number.isFinite(route.remainingMinutes))parts.push(`environ ${Math.round(route.remainingMinutes)} minutes restantes`);return `${parts.join(', ')}.`;}
function explainAnswer(result){const place=result?.result;if(!place)return 'Je n’ai pas assez de données fiables sur ce lieu dans le RoutePack.';const parts=[place.name||'Ce lieu'];if(place.description)parts.push(place.description);if(place.cue)parts.push(`Repère visuel : ${place.cue}`);return parts.join('. ');}
function memoryAnswer(){const entries=memoryStore.list(),persistent=Object.entries(entries.persistent||{}).filter(([key])=>key.startsWith('preference.')),session=Object.entries(entries.session||{}).filter(([key])=>key.startsWith('preference.'));if(!persistent.length&&!session.length)return 'Je n’ai encore mémorisé aucune préférence de voyage.';const text=[...persistent,...session].map(([key,entry])=>`${key.replace('preference.','')}: ${String(entry.value)}`);return `Voici ce que je retiens : ${text.join(' ; ')}.`;}
function requestedTargetMinutes(message){const remaining=Number(pocketGuideState.select('route.remainingMinutes'));const h=message.match(/(\d+(?:[.,]\d+)?)\s*(?:h|heure)/i),m=message.match(/(\d+)\s*(?:min|minute)/i);let amount=h?Math.round(Number(h[1].replace(',','.'))*60):m?Number(m[1]):null;if(/une\s+heure/i.test(message))amount=60;if(/de moins|en moins/i.test(message)&&Number.isFinite(remaining)&&Number.isFinite(amount))return Math.max(15,remaining-amount);return amount;}

export class HumanGuide {
  context(){return humanContextEngine.build();}
  async handleText(text,{source='text'}={}){
    const message=String(text||'').trim();if(!message)return {type:'SAY',text:'Je vous écoute.'};pocketGuideState.patch({conversation:{status:'thinking',currentTopic:message}},{source:'human-guide',event:'guide.thinking'});eventBus.emit('guide.input',{text:message,source});
    if(/\b(remets?|reviens?)\b.*\b(avant|comme avant|pr[eé]c[eé]dent)/i.test(message)){const tx=transactionManager.undo();pocketGuideState.patch({conversation:{status:'idle',lastAction:'transaction.undo'}},{source:'human-guide',event:'guide.idle'});return {type:'SAY',text:tx?'C’est revenu comme avant.':'Je n’ai pas de changement récent à annuler.'};}
    if(/\b(qu['’]est-ce que tu (sais|retiens)|mes pr[eé]f[eé]rences|ce que tu sais de moi)\b/i.test(message)){pocketGuideState.patch({conversation:{status:'idle'}},{source:'human-guide',event:'guide.idle'});return {type:'SAY',text:memoryAnswer()};}
    const pref=message.match(/(?:retiens?|souviens-toi)\s+(?:que\s+)?j['’]aime\s+(.+)/i);if(pref){memoryStore.setPreference('interest',pref[1].trim(),{scope:'persistent',source:'explicit_user'});pocketGuideState.patch({conversation:{status:'idle'}},{source:'human-guide',event:'guide.idle'});return {type:'SAY',text:`D’accord, je retiens que vous aimez ${pref[1].trim()}.`};}
    const todayPref=message.match(/(?:aujourd['’]hui|pour aujourd['’]hui)\s+(?:je\s+)?(?:veux|pr[eé]f[eè]re)\s+(.+)/i);if(todayPref){memoryStore.setPreference('today',todayPref[1].trim(),{scope:'session',source:'explicit_user'});pocketGuideState.patch({conversation:{status:'idle'}},{source:'human-guide',event:'guide.idle'});return {type:'SAY',text:`D’accord, je garde cela seulement pour aujourd’hui : ${todayPref[1].trim()}.`};}
    const forget=message.match(/(?:oublie|efface)\s+(?:ma pr[eé]f[eé]rence|ce que je t['’]ai dit)(?:\s+sur\s+(.+))?/i);if(forget){const removed=memoryStore.forgetPreference('interest');pocketGuideState.patch({conversation:{status:'idle'}},{source:'human-guide',event:'guide.idle'});return {type:'SAY',text:removed?'C’est oublié.':'Je n’avais pas cette préférence en mémoire.'};}
    if(/\b(raccourci|raccourcis|moins de temps|heure de moins|minutes? de moins)\b/i.test(message)){const targetMinutes=requestedTargetMinutes(message),proposal=plannerEngine.proposeShortening({targetMinutes,removeCount:2,reason:message});return {type:'ASK',text:Number.isFinite(targetMinutes)?`Je peux ramener le parcours vers environ ${targetMinutes} minutes en préservant les incontournables. Vous confirmez ?`:'Je peux retirer les étapes secondaires en préservant les incontournables. Vous confirmez ?',proposal};}
    if(/\b(change|nouvelle|autre)\b.*\b(balade|parcours|itin[eé]raire)\b/i.test(message)&&!/\bcarte\b/i.test(message)){pocketGuideState.patch({conversation:{status:'idle'}},{source:'human-guide',event:'guide.idle'});return {type:'SAY',text:'Je peux préparer une autre balade. Dites-moi simplement la durée, le style ou ce que vous voulez privilégier ; le Planner la vérifiera avant de vous demander confirmation.'};}
    const intent=INTENTS.find(item=>item.test.test(message));if(!intent){const answer=`Je vous ai entendu. ${humanContextEngine.summary()}. Je garde le parcours, le GPS, la carte et l’AR disponibles même sans le service IA.`;pocketGuideState.patch({conversation:{status:'idle'}},{source:'human-guide',event:'guide.idle'});return {type:'SAY',text:answer};}
    const definition=actionRegistry.describe(intent.action);if(definition?.confirmation==='required'||definition?.confirmation==='recommended'){const proposal=proposalManager.create({action:intent.action,args:{},reason:message,summary:intent.say||'Je peux effectuer ce changement.',requiresConfirmation:true,metadata:{source}});return {type:'ASK',text:`${intent.say||'Je peux le faire.'} Vous confirmez ?`,proposal};}
    const execution=await actionRegistry.execute(intent.action,{}, {source:'human-guide'});let answer=intent.say||'C’est fait.';if(intent.action==='route.status')answer=statusAnswer();if(intent.action==='place.explain'||intent.action==='place.explain_next')answer=explainAnswer(execution);pocketGuideState.patch({conversation:{status:'idle',lastAction:intent.action}},{source:'human-guide',event:'guide.idle'});return {type:'SAY',text:answer,execution};
  }
  async confirmPending(confirmed){const proposal=proposalManager.pending();if(!proposal)return {type:'SAY',text:'Je n’ai aucune proposition en attente.'};if(!confirmed){proposalManager.reject();return {type:'SAY',text:'D’accord, je ne change rien.'};}await proposalManager.confirm();return {type:'SAY',text:'C’est confirmé.'};}
}
export const humanGuide=new HumanGuide();
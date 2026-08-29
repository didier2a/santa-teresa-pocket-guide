import {saveRoutePack} from '../../route-library.js';

function routeSpeech(summary){
  const photos=summary.mediaReady?`${summary.mediaReady} photo${summary.mediaReady>1?'s':''}`:'les textes sans photo fiable';
  return`J’ai préparé ${summary.title} : ${summary.places} étapes sur environ ${summary.distanceKm.toLocaleString('fr-FR')} kilomètres, avec la carte et ${photos}. La route reste une proposition jusqu’à votre confirmation.`;
}

export function registerV4Capabilities({registry,state,planner,offline,storage=globalThis.localStorage}={}){
  registry.register({
    id:'planner.createRoute',risk:'reversible',confirmation:'none',permissions:['network'],offline:'blocked',timeoutMs:105000,cancellable:true,
    execute:async(input,context)=>{state.patch({view:'create',action:{id:'planner.createRoute',status:'running'},intent:{raw:input.request,parsed:input}},{source:context.source});const proposal=await planner.generate(input,context);state.patch({proposal,view:'route',action:{id:'planner.createRoute',status:'proposed'}},{source:context.source});return proposal;},
    toEvidence:output=>({kind:'route-proposal',proposal:output,summary:output.summary,map:output.map,media:{ready:output.summary.mediaReady,missing:output.summary.mediaMissing}}),
    toSpeech:output=>routeSpeech(output.summary)
  });
  registry.register({
    id:'route.confirmProposal',risk:'structural',confirmation:'before-commit',permissions:[],offline:'available',timeoutMs:30000,cancellable:true,undoable:true,
    execute:async(_input,context)=>{const proposal=state.select('proposal');if(!proposal?.pack)throw new Error('Aucune proposition à confirmer');const previous=state.select('activeRoute');const entry=saveRoutePack(proposal.pack,{source:'pocketguide-v4',storage});const offlineResult=await offline.prepare(proposal.pack,{signal:context.signal});state.patch({activeRoute:proposal.pack,proposal:null,view:'map',action:{id:'route.confirmProposal',status:'confirmed'},undo:{type:'route.replace',previous}},{source:context.source});return{pack:proposal.pack,map:proposal.map,summary:proposal.summary,entry,offline:offlineResult,previous};},
    toEvidence:output=>({kind:'route-confirmed',routeId:output.pack.id,pack:output.pack,map:output.map,summary:output.summary,offline:output.offline,undoAvailable:true}),
    toSpeech:output=>`Le parcours ${output.pack.title} est confirmé, sauvegardé sur ce téléphone et préparé pour le hors-ligne. J’affiche maintenant la carte et les étapes.`
  });
  registry.register({
    id:'nav.open',risk:'none',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async input=>{const view=['guide','map','route','create'].includes(input.view)?input.view:'guide';state.patch({view},{source:'navigation'});return{view};},
    toEvidence:output=>({kind:'navigation',view:output.view}),toSpeech:output=>`J’ouvre ${output.view==='map'?'la carte':output.view==='route'?'le parcours':output.view==='create'?'la création':'le guide'}.`
  });
  registry.register({
    id:'guide.explainCurrent',risk:'none',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async()=>{const pack=state.select('activeRoute'),place=pack?.places?.[0];if(!place)throw new Error('Aucun lieu actif');state.patch({view:'guide'},{source:'guide'});return{place};},
    toEvidence:output=>({kind:'place-story',place:output.place}),toSpeech:output=>`${output.place.name}. ${output.place.historyShort||output.place.description||'Le récit détaillé n’est pas encore disponible.'}`
  });
  registry.register({
    id:'guide.localFallback',risk:'none',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async input=>({text:input.text}),toEvidence:output=>({kind:'fallback',text:output.text}),toSpeech:()=>`Je n’ai pas encore relié cette demande à une fonction V4. Vous pouvez me demander de créer un itinéraire, d’ouvrir la carte ou de confirmer une proposition.`
  });
  registry.register({
    id:'operation.cancel',risk:'none',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async(_input,context)=>({cancelled:registry.cancelOthers(context.transactionId,'Interruption utilisateur')}),
    toEvidence:output=>({kind:'operation-cancelled',count:output.cancelled}),toSpeech:()=>`J’ai arrêté l’opération en cours.`
  });
  return registry;
}


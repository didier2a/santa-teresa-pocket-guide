import {saveRoutePack} from '../../route-library.js';

function routeSpeech(summary){
  const photos=summary.mediaReady?`${summary.mediaReady} photo${summary.mediaReady>1?'s':''}`:'les textes sans photo fiable';
  return`J’ai préparé ${summary.title} : ${summary.places} étapes sur environ ${summary.distanceKm.toLocaleString('fr-FR')} kilomètres, avec la carte et ${photos}. La route reste une proposition jusqu’à votre confirmation.`;
}

export function registerV4Capabilities({registry,state,planner,offline,routeState,terrain,diagnostic,storage=globalThis.localStorage}={}){
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
    id:'trip.getState',risk:'none',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async()=>routeState.contextSnapshot(),toEvidence:output=>({kind:'trip-state',snapshot:output}),toSpeech:output=>output.current?`L’étape actuelle est ${output.current.title}. Il reste ${output.remaining} étape${output.remaining>1?'s':''}.`:'Aucune étape active.'
  });
  registry.register({
    id:'places.nearby',risk:'none',confirmation:'none',permissions:['gps'],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async input=>routeState.nearby(input.limit||4),toEvidence:output=>({kind:'nearby-places',places:output}),toSpeech:output=>output.length?`Le lieu le plus proche est ${output[0].name}, à environ ${output[0].distanceMeters} mètres.`:'Activez le GPS pour trouver les lieux proches.'
  });
  registry.register({
    id:'terrain.startGPS',risk:'permission',confirmation:'none',permissions:['gps'],offline:'available',timeoutMs:3000,cancellable:false,
    execute:async()=>({started:terrain.startGPS()}),toEvidence:output=>({kind:'terrain-gps',...output}),toSpeech:()=>`Le GPS terrain est activé.`
  });
  registry.register({
    id:'terrain.openAR',risk:'permission',confirmation:'none',permissions:['camera','gps','orientation'],offline:'available',timeoutMs:30000,cancellable:true,
    execute:async input=>terrain.toggleAR(input.active),toEvidence:output=>({kind:'terrain-ar',...output}),toSpeech:output=>output.active?'La vue Geo-AR est ouverte.':'La vue Geo-AR est fermée.'
  });
  registry.register({
    id:'terrain.focusPlace',risk:'none',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async input=>{const result=routeState.focus(input.placeId);terrain.renderAR();return result;},toEvidence:output=>({kind:'route-state',action:'focus',...output,snapshot:routeState.snapshot()}),toSpeech:output=>`Je cible ${output.target.name} dans la vue terrain.`
  });
  registry.register({
    id:'route.skipNext',risk:'reversible',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,undoable:true,
    execute:async()=>routeState.skipNext(),toEvidence:output=>({kind:'route-state',action:'skip',...output,snapshot:routeState.snapshot()}),toSpeech:output=>`Étape sautée : ${output.skipped.event.title}. ${output.next?`La suite est ${output.next.event.title}.`:'Le parcours est terminé.'}`
  });
  registry.register({
    id:'route.goTo',risk:'reversible',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,undoable:true,
    execute:async input=>routeState.goTo(input.placeId),toEvidence:output=>({kind:'route-state',action:'go-to',...output,snapshot:routeState.snapshot()}),toSpeech:output=>`${output.current.name} devient l’étape courante.`
  });
  registry.register({
    id:'route.shorten',risk:'reversible',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,undoable:true,
    execute:async input=>routeState.shorten(input.removeCount),toEvidence:output=>({kind:'route-state',action:'shorten',...output,snapshot:routeState.snapshot()}),toSpeech:output=>output.removed.length?`J’ai retiré ${output.removed.map(item=>item.event.title).join(', ')} et conservé les incontournables.`:'Aucune étape secondaire ne peut être retirée sans toucher aux incontournables.'
  });
  registry.register({
    id:'route.resetProgress',risk:'reversible',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async()=>routeState.reset(),toEvidence:output=>({kind:'route-state',action:'reset',snapshot:output}),toSpeech:()=>`La progression du parcours est réinitialisée.`
  });
  registry.register({
    id:'guide.toggleProactive',risk:'none',confirmation:'none',permissions:['gps'],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async input=>routeState.setProactive(input.enabled),toEvidence:output=>({kind:'proactive-state',...output}),toSpeech:output=>`Le guide proactif est ${output.enabled?'activé':'désactivé'}.`
  });
  registry.register({
    id:'route.downloadOffline',risk:'reversible',confirmation:'none',permissions:[],offline:'available',timeoutMs:60000,cancellable:true,
    execute:async(_input,context)=>{const pack=state.select('activeRoute');if(!pack)throw new Error('Aucun parcours actif');return offline.prepare(pack,{signal:context.signal});},toEvidence:output=>({kind:'offline-route',...output}),toSpeech:output=>`Le parcours est enregistré hors ligne avec ${output.assetsCached} ressource${output.assetsCached>1?'s':''} en cache.`
  });
  registry.register({
    id:'route.openSaved',risk:'reversible',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async input=>{const pack=offline.openSaved(input.id);state.patch({activeRoute:pack,proposal:null,view:'route'},{source:'library'});return{pack};},toEvidence:output=>({kind:'route-loaded',pack:output.pack}),toSpeech:output=>`Le parcours ${output.pack.title} est ouvert depuis la bibliothèque.`
  });
  registry.register({
    id:'route.importPack',risk:'reversible',confirmation:'none',permissions:[],offline:'available',timeoutMs:3000,cancellable:false,
    execute:async input=>{const result=offline.importPack(input.pack);state.patch({activeRoute:result.pack,proposal:null,view:'route'},{source:'import'});return result;},toEvidence:output=>({kind:'route-loaded',pack:output.pack,report:output.report}),toSpeech:output=>`Le RoutePack ${output.pack.title} est validé, importé et ouvert.`
  });
  registry.register({
    id:'route.exportPack',risk:'none',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async()=>offline.exportPack(state.select('activeRoute')),toEvidence:output=>({kind:'route-export',download:output}),toSpeech:()=>`Le fichier RoutePack est prêt à être téléchargé.`
  });
  registry.register({
    id:'sensors.reset',risk:'reversible',confirmation:'none',permissions:[],offline:'available',timeoutMs:30000,cancellable:false,
    execute:async()=>({reset:await terrain.resetMedia()}),toEvidence:output=>({kind:'sensors-reset',...output}),toSpeech:()=>`La caméra, le GPS et le microphone ont été réinitialisés.`
  });
  registry.register({
    id:'diagnostic.run',risk:'none',confirmation:'none',permissions:[],offline:'available',timeoutMs:2000,cancellable:false,
    execute:async()=>diagnostic.checks(),toEvidence:output=>({kind:'diagnostic',checks:output}),toSpeech:output=>`Diagnostic terminé : ${output.filter(item=>item.ok).length} fonctions disponibles sur ${output.length}.`
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

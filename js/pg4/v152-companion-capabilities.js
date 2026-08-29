import {listSavedRoutes,loadSavedRoute,saveRoutePack} from '../route-library.js';

const normalize=value=>String(value||'').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s'-]/g,' ').replace(/\s+/g,' ').trim();

export class V152CompanionCapabilities{
  constructor({app,documentImpl=globalThis.document,windowImpl=globalThis,storage=globalThis.localStorage,now=Date.now,pendingTtlMs=120000}={}){
    if(!app)throw new TypeError('Le moteur PocketGuide 1.5.2 est requis');
    this.app=app;this.document=documentImpl;this.window=windowImpl;this.storage=storage;this.now=now;this.pendingTtlMs=pendingTtlMs;this.pendingPlanner=null;this.sequence=0;
  }

  done(intent,result,speech){return{handled:true,id:`pg152-${this.now()}-${++this.sequence}`,intent,completion:Promise.resolve(result).then(value=>({result:value,speech}))};}
  query(selector){return this.document?.querySelector?.(selector)||null;}
  pendingIsFresh(){return Boolean(this.pendingPlanner&&this.now()-this.pendingPlanner.at<=this.pendingTtlMs);}
  setPlannerStatus(text){const status=this.query('#planStatus');if(status)status.textContent=text;}

  preparePlanner(text){
    const prompt=this.query('#planPrompt');if(!prompt)return this.done('planner.prepare',{error:'Planner indisponible'},'Le Planner est indisponible sur cet écran.');
    prompt.value=String(text||'').trim();
    try{prompt.dispatchEvent?.(new (this.window.Event||Event)('input',{bubbles:true}))}catch{}
    this.app.showPanel('create');this.pendingPlanner={prompt:prompt.value,at:this.now()};
    this.setPlannerStatus('Demande préparée · dites « confirme la création » pour lancer AI Planner.');
    return this.done('planner.prepare',{pending:true,prompt:prompt.value},'J’ai préparé votre demande. Dites « confirme la création » pour lancer le Planner.');
  }

  confirmPlanner(){
    if(!this.pendingIsFresh())return this.done('planner.confirm',{error:'Aucune création en attente'},'Aucune création récente n’attend de confirmation.');
    const button=this.query('#planBtn');if(!button)return this.done('planner.confirm',{error:'Planner indisponible'},'Le Planner est indisponible.');
    const prompt=this.pendingPlanner.prompt;this.pendingPlanner=null;button.click?.();
    return this.done('planner.confirm',{started:true,prompt},'La création du parcours est lancée.');
  }

  cancelPlanner(){this.pendingPlanner=null;this.setPlannerStatus('Création annulée.');return this.done('planner.cancel',{cancelled:true},'La création du parcours est annulée.');}

  openSavedRoute(value){
    const routes=listSavedRoutes(this.storage);if(!routes.length)return this.done('library.open',{error:'Bibliothèque vide'},'Aucun itinéraire n’est sauvegardé sur cet appareil.');
    const specific=routes.find(item=>value.includes(normalize(item.label||item.title))),selected=specific||(routes.length===1?routes[0]:null);
    if(!selected)return this.done('library.open',{error:'Itinéraire non identifié',available:routes.map(item=>item.label||item.title)},'Précisez le nom de l’itinéraire à ouvrir.');
    const pack=loadSavedRoute(selected.id,this.storage);if(!pack)return this.done('library.open',{error:'RoutePack introuvable'},'Cet itinéraire ne peut pas être chargé.');
    this.app.openPack(pack);return this.done('library.open',{opened:selected.id,title:selected.label||selected.title},`J’ouvre ${selected.label||selected.title}.`);
  }

  route(text){
    const value=normalize(text);
    const plannerCancel=/^(?:annule|abandonne)(?: (?:la|le|ce|cette) (?:creation|planner|parcours|itineraire))?$/.test(value);
    const plannerConfirm=/^(?:oui )?(?:confirme|valide)(?: (?:la|le|ce|cette) (?:creation|planner|parcours|itineraire))?$|^lance (?:la|le) (?:creation|planner|parcours|itineraire)$/.test(value);
    if(this.pendingIsFresh()&&plannerCancel)return this.cancelPlanner();
    if(this.pendingIsFresh()&&plannerConfirm)return this.confirmPlanner();
    if(/\b(cree|creer|prepare|preparer|genere|generer|construis|organise)\b.*\b(parcours|itineraire|balade|visite|voyage)\b/.test(value))return this.preparePlanner(text);

    if(/\b(ouvre|charge|reprends)\b.*\b(mon|mes|itineraire|parcours|voyage)\b.*\b(sauvegarde|enregistre|bibliotheque)\b/.test(value))return this.openSavedRoute(value);
    if(/\b(sauvegarde|enregistre)\b.*\b(parcours|itineraire|voyage)\b/.test(value)){const entry=saveRoutePack(this.app.pack,{source:'companion-v152',storage:this.storage});return this.done('library.save',entry,`Le parcours ${entry.label||entry.title} est sauvegardé sur cet appareil.`);}

    if(/\b(telecharge|prepare)\b.*\b(hors ligne|offline)\b/.test(value)){const api=this.window.__POCKETGUIDE_OFFLINE__;if(!api?.downloadCurrentRoute)return this.done('offline.download',{error:'Mode hors ligne indisponible'},'Le téléchargement hors ligne est indisponible.');return this.done('offline.download',api.downloadCurrentRoute(),'Le parcours est en cours de préparation hors ligne.');}
    if(/\b(ouvre|charge)\b.*\b(hors ligne|offline)\b/.test(value)){const api=this.window.__POCKETGUIDE_OFFLINE__;if(!api?.openOfflinePack)return this.done('offline.open',{error:'Parcours hors ligne absent'},'Aucun parcours hors ligne ne peut être ouvert.');api.openOfflinePack();return this.done('offline.open',{opened:true},'J’ouvre le parcours hors ligne.');}
    if(/\b(reinitialise|redemarre)\b.*\b(capteurs|camera|micro)\b/.test(value)){const api=this.window.__POCKETGUIDE_PLATFORM__;if(!api?.resetMedia)return this.done('sensors.reset',{error:'Réinitialisation indisponible'},'La réinitialisation des capteurs est indisponible.');return this.done('sensors.reset',api.resetMedia(),'Les capteurs sont réinitialisés.');}
    if(/\b(ouvre|lance|affiche)\b.*\b(diagnostic|compatibilite)\b/.test(value)){const link=this.query('#universalDiagnosticLink');if(!link)return this.done('diagnostic.open',{error:'Diagnostic indisponible'},'Le diagnostic est indisponible.');link.click?.();return this.done('diagnostic.open',{opened:true},'J’ouvre le diagnostic de compatibilité.');}

    if(/\b(reinitialise|retablis|recommence)\b.*\b(parcours|itineraire)\b/.test(value)){this.query('#routeReset')?.click?.();return this.done('route.reset',{reset:true},'Le parcours est réinitialisé.');}
    if(/\b(arrete|coupe|desactive)\b.*\b(gps|localisation)\b/.test(value)){if(this.app.state.gpsWatch!==null&&!this.app.state.demo)this.query('#gpsBtn')?.click?.();return this.done('terrain.gps.stop',{stopped:this.app.state.gpsWatch===null||Boolean(this.app.state.demo)},this.app.state.demo?'Le GPS de démonstration reste actif en mode démo.':'Le GPS est arrêté.');}
    if(/\b(recentre|recentrer)\b/.test(value)){if(!this.app.state.followMap)this.query('#gpsBtn')?.click?.();return this.done('terrain.gps.recenter',{recentered:true},'La carte est recentrée sur votre position.');}
    if(/\b(active|demarre|lance)\b.*\b(gps|localisation)\b/.test(value)){if(this.app.state.gpsWatch===null)this.query('#gpsBtn')?.click?.();return this.done('terrain.gps.start',{started:true,alreadyActive:this.app.state.gpsWatch!==null},'Le GPS est activé.');}

    if(/\b(ferme|arrete|quitte|desactive)\b.*\b(ar|realite augmentee)\b/.test(value)){if(this.app.state.ar)this.app.toggleAR();return this.done('terrain.ar.close',{closed:true},'La réalité augmentée est fermée.');}
    if(/\b(ouvre|active|demarre|lance)\b.*\b(ar|realite augmentee)\b/.test(value)){const result=this.app.state.ar?{ok:true,alreadyActive:true}:this.app.toolCall('open_ar',{});return this.done('terrain.ar.open',result,'J’ouvre la réalité augmentée.');}

    if(/\b(raccourcis|raccourcir|moins de temps)\b/.test(value)){const result=this.app.toolCall('shorten_route',{removeCount:1});return this.done('route.shorten',result,result.removed?.length?`J’ai retiré ${result.removed.join(', ')} et conservé les incontournables.`:'Aucune étape secondaire ne peut être retirée.');}
    if(/\b(saute|sauter|ignore)\b.*\b(etape|prochaine|lieu)\b/.test(value)){const result=this.app.toolCall('skip_next_stop',{});return this.done('route.skip',result,result.error||`Étape sautée : ${result.skipped}.`);}
    if(/\b(va|aller|conduis|emmene|ouvre)\b/.test(value)){const place=(this.app.pack.places||[]).find(item=>value.includes(normalize(item.name)));if(place){const result=this.app.toolCall('go_to_place',{placeId:place.id});return this.done('route.goTo',result,result.error||`${place.name} devient l’étape active.`);}}

    const views=[['map',/\b(ouvre|affiche|montre|va sur|passe a)\b.*\b(carte|cartographie)\b|\b(carte|cartographie)\b.*\b(ouvre|affiche|montre)\b/],['route',/\b(ouvre|affiche|montre|va sur|passe a)\b.*\b(parcours|itineraire)\b/],['create',/\b(ouvre|affiche|va sur|passe a)\b.*\b(creer|creation|planner)\b/],['guide',/\b(reviens|retourne|va sur|passe a)\b.*\b(guide|compagnon)\b/]];
    for(const [view,pattern] of views)if(pattern.test(value)){this.app.showPanel(view);return this.done('navigation.open',{view},`J’ai ouvert ${view==='map'?'la carte':view==='route'?'le parcours':view==='create'?'la création':'le guide'}.`);}
    return{handled:false};
  }
}

export {normalize as normalizeV152Command};

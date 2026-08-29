const TITLES={guide:'Compagnon',map:'Carte + route',route:'Parcours',create:'Création'};
const PHASES=['understanding','verification','construction','media','map','narration'];
const PHASE_LABELS={understanding:'Compréhension',verification:'Vérification',construction:'Construction',media:'Médias',map:'Cartographie',narration:'Narration'};

function el(tag,className='',text=''){
  const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;
}
function clear(node){node?.replaceChildren();return node;}
function durationLabel(minutes=0){const hours=Math.floor(minutes/60),rest=minutes%60;return hours?`${hours} h ${String(rest).padStart(2,'0')}`:`${rest} min`;}
function placesFor(pack){const lookup=new Map((pack?.places||[]).map(place=>[place.id,place]));return(pack?.days||[]).flatMap(day=>day.events||[]).map(event=>({event,place:lookup.get(event.placeId)}));}

export class SceneDirector{
  constructor({bus,state,documentImpl=globalThis.document}={}){this.bus=bus;this.state=state;this.document=documentImpl;this.nodes={};this.progress={phase:'understanding',completed:0,totalPlaces:0};this.map=null;this.mapKey='';}
  install(){
    const query=selector=>this.document.querySelector(selector);this.nodes={app:query('#pg4App'),title:query('#screenTitle'),status:query('#screenStatus'),live:query('#liveRegion'),guide:query('#guideScene'),map:query('#mapScene'),route:query('#routeScene'),create:query('#createScene')};
    this.bus.on('pg4.state.changed',payload=>this.renderState(payload.after));this.bus.on('pg4.intent.heard',intent=>this.renderHeard(intent));this.bus.on('pg4.evidence',evidence=>this.renderEvidence(evidence));this.bus.on('pg4.avatar.status',status=>this.renderAvatarStatus(status));
    this.renderState(this.state.get());return this;
  }
  renderState(snapshot){
    const view=snapshot.view||'guide';this.nodes.app.dataset.view=view;
    for(const panel of this.document.querySelectorAll('[data-view-panel]')){const active=panel.dataset.viewPanel===view;panel.hidden=!active;panel.classList.toggle('is-active',active);}
    for(const button of this.document.querySelectorAll('[data-nav]'))button.classList.toggle('is-active',button.dataset.nav===view);
    this.nodes.title.textContent=TITLES[view]||'PocketGuide V4';this.nodes.status.textContent=snapshot.action?.status==='running'?'EN COURS':snapshot.proposal?'CONFIRMATION':snapshot.activeRoute?'ACTIF':'PRÊT';
    if(view==='map'&&this.map)setTimeout(()=>this.map?.invalidateSize?.(),0);
  }
  renderAvatarStatus(payload={}){
    const stage=this.document.querySelector('#avatarStage'),pill=this.document.querySelector('#presencePill'),title=this.document.querySelector('#avatarTitle'),message=this.document.querySelector('#avatarMessage');if(!stage)return;
    const value=payload.value||'ready';stage.dataset.presence=value;this.nodes.app.dataset.presence=value;
    const labels={connecting:'CONNEXION',listening:'J’ÉCOUTE',thinking:'JE RÉFLÉCHIS',speaking:'JE PARLE',interrupted:'INTERROMPUE',degraded:'MODE DÉGRADÉ',ready:'PRÊTE'};pill.textContent=labels[value]||'PRÊTE';
    if(value==='listening'){title.textContent='Je vous écoute.';message.textContent='Transcription visible et interruption immédiate.';}
    else if(value==='thinking'){title.textContent='Je prépare votre réponse.';message.textContent='Je n’affirmerai que les résultats réellement produits par l’application.';}
    else if(value==='speaking'){title.textContent='Voici votre parcours.';message.textContent='La voix raconte la scène réellement affichée.';}
    else if(value==='degraded'){title.textContent='Je reste disponible.';message.textContent='Le direct est indisponible, mais les fonctions locales restent accessibles.';}
    else{title.textContent='Bonjour. Je suis avec vous.';message.textContent='Parlez-moi naturellement. Je peux créer et afficher votre parcours.';}
  }
  renderHeard(intent){
    if(intent.capabilityId==='planner.createRoute')this.nodes.guide.replaceChildren(this.intentPanel({state:'heard',title:'J’ai entendu votre demande.',label:'Transcription',detail:intent.raw}));
    this.announce(`Intention comprise : ${intent.capabilityId}`);
  }
  renderEvidence(evidence){
    if(evidence.status==='progress'&&evidence.capabilityId==='planner.createRoute'){this.progress={...this.progress,...evidence.data};this.renderPlanning(evidence);return;}
    if(evidence.status==='failed'||evidence.status==='cancelled'){this.renderRecovery(evidence);return;}
    if(evidence.status==='blocked'){this.renderRecovery(evidence);return;}
    if(!['succeeded','degraded'].includes(evidence.status))return;
    const kind=evidence.data?.kind;
    if(kind==='route-proposal')this.renderProposal(evidence.data.proposal);
    else if(kind==='route-confirmed')this.renderConfirmed(evidence.data);
    else if(kind==='place-story')this.renderStory(evidence.data.place);
    this.announce(evidence.speech);
  }
  renderPlanning(evidence){
    const host=clear(this.nodes.create),progress=el('article','planning-progress');progress.dataset.state='running';
    const head=el('div','card-head');head.append(el('h2','', 'Création du parcours'),el('strong','','EN COURS'));progress.append(head);
    const steps=el('div','progress-steps'),activeIndex=Math.max(0,PHASES.indexOf(this.progress.phase));
    PHASES.forEach((phase,index)=>{const row=el('div',`progress-step${index<activeIndex?' is-done':index===activeIndex?' is-active':''}`,PHASE_LABELS[phase]);steps.append(row);});progress.append(steps);
    const caption=this.progress.phase==='media'&&this.progress.totalPlaces?`Médias · ${this.progress.completed||0}/${this.progress.totalPlaces}`:`${PHASE_LABELS[this.progress.phase]||'Préparation'} · ${Math.min(6,activeIndex+1)}/6`;progress.append(el('p','progress-caption',caption));
    host.append(progress,this.intentPanel({state:'executing',title:'Je prépare votre parcours.',label:'Action',detail:'Vérification des lieux, médias, tracé et disponibilité hors ligne.'}));
  }
  intentPanel({state,title,label,detail}){
    const card=el('article','intent-panel');card.dataset.state=state;const head=el('div','intent-head');head.append(el('strong','', 'INTENTION'),el('span','status-pill',state==='heard'?'ENTENDU':'EN COURS'));card.append(head,el('h2','',title));
    const body=el('div','intent-detail');body.append(el('strong','',label),el('p','',detail));card.append(body);
    const actions=el('div','intent-actions');const cancel=el('button','secondary','Annuler');cancel.type='button';cancel.dataset.action='cancel';actions.append(cancel);
    if(state==='heard'){const go=el('button','intent-button','Continuer');go.type='button';go.dataset.action='continue';actions.append(go);}else{const stop=el('button','danger','Arrêter');stop.type='button';stop.dataset.action='cancel';actions.append(stop);}card.append(actions);return card;
  }
  renderProposal(proposal){
    const host=clear(this.nodes.route);host.append(this.routeCard(proposal,{proposed:true}));
    const dialog=el('article','dialog-card'),head=el('div','card-head');head.append(el('strong','', '●  Confirmation'),el('span','status-pill','Prêt'));dialog.append(head,el('h2','', 'Confirmer ce parcours ?'),el('p','', 'La nouvelle proposition remplacera la route active après votre accord.'),el('div','dialog-proof','●  Prêt à confirmer'));
    const actions=el('div','dialog-actions'),confirm=el('button','dialog-button','Confirmer'),cancel=el('button','dialog-button secondary','Annuler');confirm.type=cancel.type='button';confirm.dataset.action='confirm-route';cancel.dataset.action='reject-route';actions.append(confirm,cancel);dialog.append(actions);host.append(dialog);
    this.state.patch({view:'route'},{source:'scene-proposal'});this.document.querySelector('[data-nav="route"] .nav-badge')?.removeAttribute('hidden');
  }
  routeCard(proposal,{proposed=false}={}){
    const pack=proposal?.pack||proposal,summary=proposal?.summary||{places:pack?.places?.length||0,durationMinutes:120,distanceKm:proposal?.map?.distanceKm||0};
    const card=el('article',`route-card${proposed?' is-proposed':''}`),head=el('div','card-head');head.append(el('strong','', 'PARCOURS'),el('strong','',proposed?'PROPOSITION':'CONFIRMÉ'));card.append(head,el('h2','',pack?.title||'Parcours sans titre'),el('p','route-meta',`${durationLabel(summary.durationMinutes)} · ${Number(summary.distanceKm||0).toLocaleString('fr-FR')} km · ${summary.places||0} étapes`));
    const list=el('ol','route-list');placesFor(pack).slice(0,3).forEach((item,index)=>{const row=el('li');row.append(el('b','',String(index+1).padStart(2,'0')),el('span','',item.place?.name||item.event.title));list.append(row);});card.append(list,el('p','route-foot',proposed?'Prête à être confirmée':'Route active · hors ligne préparée'));return card;
  }
  renderConfirmed(data){
    clear(this.nodes.map).append(this.mapCard(data.pack,data.map),this.routeCard({pack:data.pack,summary:data.summary,map:data.map}));
    clear(this.nodes.route).append(this.routeCard({pack:data.pack,summary:data.summary,map:data.map}));
    this.renderStory(data.pack.places?.[0],{preserveView:true});this.state.patch({view:'map'},{source:'scene-confirmed'});this.document.querySelector('[data-nav="route"] .nav-badge')?.setAttribute('hidden','');
  }
  mapCard(pack,mapModel){
    if(this.map){try{this.map.remove()}catch{}this.map=null;}
    const card=el('article','map-stage'),head=el('div','card-head');head.append(el('strong','',navigator.onLine===false?'CARTE HORS LIGNE':'CARTE EN LIGNE'),el('span','route-foot','© OpenStreetMap'));card.append(head);
    const canvas=el('div','map-canvas');canvas.id=`pg4Map-${Date.now()}`;card.append(canvas,el('div','map-proof',`OSM · tracé et ${mapModel?.markers?.length||0} marqueurs`));
    setTimeout(()=>this.mountMap(canvas,mapModel,pack),0);return card;
  }
  mountMap(canvas,mapModel,pack){
    const points=mapModel?.polyline||[];if(!canvas.isConnected)return;
    if(globalThis.L&&points.length){
      const map=globalThis.L.map(canvas,{zoomControl:false,attributionControl:true});globalThis.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);globalThis.L.polyline(points,{color:'#79dccf',weight:5,opacity:.95}).addTo(map);for(const marker of mapModel.markers||[])globalThis.L.circleMarker([marker.lat,marker.lng],{radius:7,color:'#f5f5ee',weight:2,fillColor:'#eacb82',fillOpacity:1}).addTo(map).bindPopup(marker.label);map.fitBounds(globalThis.L.latLngBounds(points).pad(.18));this.map=map;this.mapKey=pack?.id||'';return;
    }
    const fallback=el('div','media-empty','Carte schématique disponible après chargement de Leaflet.');canvas.append(fallback);
  }
  renderStory(place,{preserveView=false}={}){
    if(!place)return;clear(this.nodes.guide).append(this.storyCard(place));if(!preserveView)this.state.patch({view:'guide'},{source:'scene-story'});
  }
  storyCard(place){
    const card=el('article','story-card'),head=el('div','card-head');head.append(el('strong','',place.heroImage?'IMAGE PRÊTE':'IMAGE ABSENTE'),el('span','route-foot','Récit sourcé'));card.append(head);
    const media=el('div','story-image');if(place.heroImage){const image=el('img');image.src=place.heroImage;image.alt=place.name;image.loading='lazy';media.append(image);}else media.append(el('div','media-empty','Aucune photo publique fiable trouvée.'));card.append(media,el('h2','',place.name),el('p','',place.historyShort||place.description||'Description indisponible.'));
    const attribution=place.imageAttribution,source=attribution?.source||place.sourceLabel||'Source non renseignée',license=attribution?.license?` · ${attribution.license}`:'';const sourceLine=el('p','story-source',`${source}${license}`);const href=attribution?.descriptionUrl||place.sourceUrl;if(href){const link=el('a','',sourceLine.textContent);link.href=href;link.target='_blank';link.rel='noopener noreferrer';sourceLine.replaceChildren(link);}card.append(sourceLine);return card;
  }
  renderRecovery(evidence){
    const target=evidence.capabilityId==='planner.createRoute'?this.nodes.create:this.nodes.guide,card=el('article','recovery-banner');card.append(el('strong','',evidence.status==='cancelled'?'Action arrêtée':'Action indisponible'),el('p','',evidence.error||evidence.speech||'Vous pouvez réessayer sans perdre la route active.'));const retry=el('button','text-action','Réessayer');retry.type='button';retry.dataset.action='retry';card.append(retry);target.prepend(card);this.announce(card.textContent);
  }
  announce(text){if(this.nodes.live)this.nodes.live.textContent=String(text||'');}
}


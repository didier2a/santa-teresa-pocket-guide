import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';

export const MOMENTS=Object.freeze({
  welcome:{id:'welcome',eyebrow:'Votre guide personnel',title:'Que souhaitez-vous vivre aujourd’hui ?',message:'Parlez naturellement : je peux préparer, reprendre, montrer ou raconter un voyage.',primaryLabel:'Parler à ma guide',primaryAction:'voice.toggle',secondaryLabel:'Écrire ma demande',secondaryAction:'composer.focus',portrait:'hero'},
  prepare:{id:'prepare',eyebrow:'Je prépare avec vous',title:'Construisons une excursion qui vous ressemble',message:'Une question à la fois, puis je vérifierai les lieux avant de vous proposer le parcours.',primaryLabel:'Continuer à la voix',primaryAction:'voice.toggle',secondaryLabel:'Préciser par écrit',secondaryAction:'composer.focus',portrait:'hero'},
  ready:{id:'ready',eyebrow:'Votre voyage est prêt',title:'Quand vous êtes prêt, nous partons ensemble',message:'Je peux vous montrer le parcours avant le départ ou commencer à vous guider.',primaryLabel:'Commencer le parcours',primaryAction:'journey.start',secondaryLabel:'Voir avant de partir',secondaryAction:'preview.open',portrait:'hero'},
  walking:{id:'walking',eyebrow:'Je marche avec vous',title:'Suivez simplement ma voix et le prochain repère',message:'La direction, la distance et le prochain lieu restent lisibles d’un coup d’œil.',primaryLabel:'Me parler',primaryAction:'voice.toggle',secondaryLabel:'Regarder en AR',secondaryAction:'ar.open',portrait:'compact'},
  arrived:{id:'arrived',eyebrow:'Nous y sommes',title:'Prenons le temps de découvrir ce lieu',message:'Je peux vous le raconter, regarder avec vous ou conserver un souvenir situé.',primaryLabel:'Raconte-moi ce lieu',primaryAction:'place.explain',secondaryLabel:'Regarder en AR',secondaryAction:'ar.open',portrait:'compact'},
  preview:{id:'preview',eyebrow:'Avant de partir',title:'Je vous montre le voyage, étape par étape',message:'Cette simulation photographique ne modifie jamais votre progression réelle.',primaryLabel:'Continuer la visite',primaryAction:'preview.next',secondaryLabel:'Fermer la simulation',secondaryAction:'preview.close',portrait:'compact'},
  completed:{id:'completed',eyebrow:'Voyage accompli',title:'Votre histoire est maintenant dans votre carnet',message:'Retrouvez les lieux, vos photographies et vos notes vocales, uniquement sur ce téléphone.',primaryLabel:'Ouvrir mon carnet',primaryAction:'journal.open',secondaryLabel:'Voir mes voyages',secondaryAction:'memories.open',portrait:'hero'},
  memories:{id:'memories',eyebrow:'Votre mémoire privée',title:'Chaque voyage conserve son histoire',message:'Reprenez, simulez, exportez ou enrichissez vos excursions et leurs souvenirs.',primaryLabel:'Reprendre le voyage actif',primaryAction:'companion.open',secondaryLabel:'Créer une excursion',secondaryAction:'planner.open',portrait:'compact'}
});

export function deriveMoment({state={},snapshot=null,previewOpen=false,planning=false}={}){
  if(previewOpen)return MOMENTS.preview;
  if(planning)return MOMENTS.prepare;
  if(state?.ui?.panel==='memories')return MOMENTS.memories;
  const route=state?.route||{},events=(route.pack?.days||[]).flatMap(day=>day.events||[]);
  if(!route.pack?.id||!events.length)return MOMENTS.welcome;
  if(!route.currentEventId&&route.completedEventIds?.length)return MOMENTS.completed;
  if(snapshot?.phase==='completed')return MOMENTS.completed;
  if(snapshot?.phase==='arrived')return MOMENTS.arrived;
  if(['en_route','preview','approaching'].includes(snapshot?.phase)&&state?.perception?.gps==='ready')return MOMENTS.walking;
  return MOMENTS.ready;
}

export class AdaptiveMomentEngine{
  constructor(){this.previewOpen=false;this.planning=false;this.current=MOMENTS.welcome;this.onChange=null;this.started=false;this.unsubs=[];this.snapshot=null;}
  start(){
    if(this.started)return this;this.started=true;
    const sync=()=>this.sync();
    for(const type of ['app.ready','route.loaded','route.replaced','route.advanced','route.completed','gps.updated','gps.stopped','ui.panel.changed'])this.unsubs.push(eventBus.on(type,sync));
    this.unsubs.push(eventBus.on('guidance.snapshot',payload=>{this.snapshot=payload;this.sync();}));
    return this.sync();
  }
  setPlanning(value){this.planning=Boolean(value);return this.sync();}
  setPreview(value){this.previewOpen=Boolean(value);return this.sync();}
  sync(){const next=deriveMoment({state:pocketGuideState.get(),snapshot:this.snapshot,previewOpen:this.previewOpen,planning:this.planning}),changed=next.id!==this.current?.id;this.current=next;if(changed)this.onChange?.(next);eventBus.emit('pg21.moment.changed',{moment:next,changed});return this;}
  stop(){this.unsubs.splice(0).forEach(off=>off?.());this.started=false;return this;}
}

export const adaptiveMomentEngine=new AdaptiveMomentEngine();

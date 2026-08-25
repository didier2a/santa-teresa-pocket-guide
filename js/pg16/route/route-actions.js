import {actionRegistry} from '../core/action-registry.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {advanceRoute,routeEventsFromState} from './route-adapter-v15.js';

function currentEvent(){
  const id=pocketGuideState.select('route.currentEventId');
  return routeEventsFromState().find(event=>event?.id===id)||null;
}

function placeForEvent(event){
  if(!event)return null;
  const pack=pocketGuideState.select('route.pack');
  return (pack?.places||[]).find(place=>place?.id===event.placeId)||null;
}

function currentPlace(){return placeForEvent(currentEvent());}

export function registerRouteActions(){
  if(!actionRegistry.has('route.next'))actionRegistry.register('route.next',{
    description:'Valider l’étape courante et avancer à la suivante.',
    riskLevel:'reversible',confirmation:'none',
    availability:()=>Boolean(pocketGuideState.select('route.currentEventId')),
    handler:()=>advanceRoute({skip:false})
  });

  if(!actionRegistry.has('route.skip'))actionRegistry.register('route.skip',{
    description:'Sauter l’étape courante et avancer à la suivante.',
    riskLevel:'reversible',confirmation:'recommended',
    availability:()=>Boolean(pocketGuideState.select('route.currentEventId')),
    handler:()=>advanceRoute({skip:true})
  });

  if(!actionRegistry.has('route.status'))actionRegistry.register('route.status',{
    description:'Lire l’état courant du parcours.',
    riskLevel:'safe',confirmation:'none',
    handler:()=>pocketGuideState.select('route')
  });

  if(!actionRegistry.has('place.current'))actionRegistry.register('place.current',{
    description:'Lire le lieu associé à l’étape courante.',
    riskLevel:'safe',confirmation:'none',
    availability:()=>Boolean(currentPlace()),
    handler:()=>currentPlace()
  });

  if(!actionRegistry.has('place.explain'))actionRegistry.register('place.explain',{
    description:'Expliquer le lieu courant à partir des données fiables du RoutePack.',
    riskLevel:'safe',confirmation:'none',
    availability:()=>Boolean(currentPlace()),
    handler:()=>{
      const place=currentPlace();
      if(!place)return null;
      return {
        id:place.id,
        name:place.name||place.title||'Ce lieu',
        description:place.historyLong||place.historyShort||place.description||place.note||'',
        cue:place.arCue||place.repere||''
      };
    }
  });
}

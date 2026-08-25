import {actionRegistry} from '../core/action-registry.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {advanceRoute} from './route-adapter-v15.js';

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
}

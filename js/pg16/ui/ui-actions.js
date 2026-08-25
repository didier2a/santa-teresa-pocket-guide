import {actionRegistry} from '../core/action-registry.js';
import {pocketGuideState} from '../core/pocketguide-state.js';

const PANELS=new Set(['guide','map','route','create']);

export function registerUiActions(){
  for(const panel of PANELS){
    const name=`ui.open_${panel}`;
    if(actionRegistry.has(name))continue;
    actionRegistry.register(name,{
      description:`Ouvrir la vue ${panel}.`,riskLevel:'safe',confirmation:'none',
      handler:()=>{pocketGuideState.patch({ui:{panel}},{source:'ui-action',event:'ui.panel.changed'});return {panel};}
    });
  }

  if(!actionRegistry.has('ar.open'))actionRegistry.register('ar.open',{
    description:'Demander l’ouverture du mode Geo-AR. La caméra ne s’active qu’après un geste utilisateur.',riskLevel:'safe',confirmation:'none',
    handler:()=>{pocketGuideState.patch({ui:{arRequested:true,panel:'guide'}},{source:'ui-action',event:'ar.requested'});return {ar:false,arRequested:true,requiresUserGesture:true};}
  });

  if(!actionRegistry.has('ar.close'))actionRegistry.register('ar.close',{
    description:'Fermer le mode Geo-AR.',riskLevel:'safe',confirmation:'none',
    handler:()=>{pocketGuideState.patch({ui:{ar:false,arRequested:false}},{source:'ui-action',event:'ar.close.requested'});return {ar:false};}
  });
}

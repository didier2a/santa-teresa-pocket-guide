import {actionRegistry} from '../../pg16/core/action-registry.js';
import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';

const VIEWS=new Set(['companion','journey','memories']);

export function registerV2Actions(){
  for(const view of VIEWS){
    const name=`ui.open_${view}`;
    if(actionRegistry.has(name))continue;
    actionRegistry.register(name,{description:`Afficher l’espace ${view} de PocketGuide V2.`,riskLevel:'safe',confirmation:'none',handler:()=>{pocketGuideState.patch({ui:{panel:view}},{source:'pg2-ui',event:'ui.panel.changed'});return {view};}});
  }
  const aliases={
    'ui.open_guide':'companion',
    'ui.open_map':'journey',
    'ui.open_route':'journey',
    'ui.open_create':'journey'
  };
  for(const [name,view] of Object.entries(aliases)){
    if(actionRegistry.has(name))continue;
    actionRegistry.register(name,{description:`Afficher ${view} dans l’interface V2.`,riskLevel:'safe',confirmation:'none',handler:()=>{pocketGuideState.patch({ui:{panel:view,journeyMode:name==='ui.open_map'?'map':'timeline'}},{source:'pg2-ui-alias',event:'ui.panel.changed'});return {view};}});
  }
  const requests=[
    ['ui.open_preview','preview'],
    ['ui.request_vision','vision'],
    ['ui.open_journal','journal']
  ];
  for(const [name,request] of requests){
    if(actionRegistry.has(name))continue;
    actionRegistry.register(name,{description:`Demander l’interface ${request}.`,riskLevel:'safe',confirmation:'none',handler:()=>{pocketGuideState.patch({ui:{request}},{source:'pg2-ui',event:`ui.${request}.requested`});return {request};}});
  }
  if(!actionRegistry.has('ar.open'))actionRegistry.register('ar.open',{description:'Proposer l’ouverture consentie de Geo-AR.',riskLevel:'safe',confirmation:'none',handler:()=>{pocketGuideState.patch({ui:{arRequested:true,panel:'companion'}},{source:'pg2-ui',event:'ar.requested'});return {arRequested:true,requiresUserGesture:true};}});
  if(!actionRegistry.has('ar.close'))actionRegistry.register('ar.close',{description:'Fermer Geo-AR.',riskLevel:'safe',confirmation:'none',handler:()=>{pocketGuideState.patch({ui:{ar:false,arRequested:false}},{source:'pg2-ui',event:'ar.close.requested'});return {ar:false};}});
}

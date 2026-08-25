import {actionRegistry} from '../core/action-registry.js';
import {pocketGuideState} from '../core/pocketguide-state.js';
import {advanceRoute,routeEventsFromState} from './route-adapter-v15.js';
import {validateRoutePack,minutes} from '../../../engine/routepack.js';

function clone(value){return typeof globalThis.structuredClone==='function'?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));}
function currentEvent(){const id=pocketGuideState.select('route.currentEventId');return routeEventsFromState().find(event=>event?.id===id)||null;}
function placeForEvent(event){if(!event)return null;const pack=pocketGuideState.select('route.pack');return (pack?.places||[]).find(place=>place?.id===event.placeId)||null;}
function currentPlace(){return placeForEvent(currentEvent());}
function allEvents(pack){return (pack?.days||[]).flatMap(day=>day.events||[]);}
function durationOf(event){const direct=Number(event?.durationMinutes??event?.duration);if(Number.isFinite(direct)&&direct>0)return direct;const a=minutes(event?.time),b=minutes(event?.end);return Number.isFinite(a)&&Number.isFinite(b)&&b>a?b-a:0;}
function remainingMinutes(pack,currentEventId){const events=allEvents(pack);let index=Math.max(0,events.findIndex(e=>e.id===currentEventId));if(index<0)index=0;const total=events.slice(index).reduce((sum,e)=>sum+durationOf(e),0);return total||null;}
function routePatchForPack(pack,{completed=[],skipped=[],preferredCurrentId=null}={}){
  const events=allEvents(pack);const validIds=new Set(events.map(e=>e.id));const keptCompleted=completed.filter(id=>validIds.has(id));const keptSkipped=skipped.filter(id=>validIds.has(id));const current=events.find(e=>e.id===preferredCurrentId&&!keptCompleted.includes(e.id)&&!keptSkipped.includes(e.id))||events.find(e=>!keptCompleted.includes(e.id)&&!keptSkipped.includes(e.id))||null;const index=current?events.findIndex(e=>e.id===current.id):-1;const next=index>=0?events[index+1]||null:null;
  return {activeId:pack.id,title:pack.title,pack,currentEventId:current?.id||null,nextEventId:next?.id||null,completedEventIds:keptCompleted,skippedEventIds:keptSkipped,remainingMinutes:current?remainingMinutes(pack,current.id):0};
}
function priority(event,place){const raw=Number(event?.priority??place?.priority??50);return Number.isFinite(raw)?Math.max(0,Math.min(100,raw)):50;}
function mustKeep(event,place){const type=String(event?.type||'').toLowerCase();return Boolean(event?.mustSee||place?.mustSee||event?.fixed||event?.locked||['bus','train','ferry','flight','avion','navette'].includes(type)||priority(event,place)>=80);}

export function registerRouteActions(){
  if(!actionRegistry.has('route.next'))actionRegistry.register('route.next',{description:'Valider l’étape courante et avancer à la suivante.',riskLevel:'reversible',confirmation:'none',availability:()=>Boolean(pocketGuideState.select('route.currentEventId')),handler:()=>advanceRoute({skip:false})});
  if(!actionRegistry.has('route.skip'))actionRegistry.register('route.skip',{description:'Sauter l’étape courante et avancer à la suivante.',riskLevel:'reversible',confirmation:'recommended',availability:()=>Boolean(pocketGuideState.select('route.currentEventId')),handler:()=>advanceRoute({skip:true})});
  if(!actionRegistry.has('route.status'))actionRegistry.register('route.status',{description:'Lire l’état courant du parcours.',riskLevel:'safe',confirmation:'none',handler:()=>pocketGuideState.select('route')});

  if(!actionRegistry.has('route.replace'))actionRegistry.register('route.replace',{
    description:'Remplacer le parcours actif par un RoutePack validé.',riskLevel:'structural',confirmation:'required',
    availability:({args})=>Boolean(args?.pack),
    handler:({pack})=>{const candidate=clone(pack);const report=validateRoutePack(candidate);if(!report.valid){const error=new Error(`RoutePack invalide: ${report.errors.map(e=>e.code).join(', ')}`);error.report=report;throw error;}const route=routePatchForPack(candidate);pocketGuideState.patch({route,trip:{active:true,resumedAt:new Date().toISOString()}},{source:'route-action',event:'route.replaced'});return {routeId:candidate.id,title:candidate.title,places:candidate.places?.length||0,warnings:report.warnings};}
  });

  if(!actionRegistry.has('route.shorten'))actionRegistry.register('route.shorten',{
    description:'Raccourcir le reste du parcours en préservant les incontournables.',riskLevel:'structural',confirmation:'required',
    availability:()=>Boolean(pocketGuideState.select('route.pack')),
    handler:({removeCount=1,targetMinutes=null}={})=>{const route=pocketGuideState.select('route');const pack=clone(route.pack);const placesById=Object.fromEntries((pack.places||[]).map(p=>[p.id,p]));const events=allEvents(pack);const currentIndex=Math.max(0,events.findIndex(e=>e.id===route.currentEventId));const candidates=events.slice(currentIndex+1).filter(e=>!mustKeep(e,placesById[e.placeId])).sort((a,b)=>priority(a,placesById[a.placeId])-priority(b,placesById[b.placeId]));let count=Math.max(1,Math.min(6,Number(removeCount)||1));const remove=new Set();for(const event of candidates){if(remove.size>=count)break;remove.add(event.id);if(Number.isFinite(Number(targetMinutes))){const simulated=clone(pack);for(const day of simulated.days)day.events=(day.events||[]).filter(e=>!remove.has(e.id));if((remainingMinutes(simulated,route.currentEventId)||Infinity)<=Number(targetMinutes))break;}}
      if(!remove.size)return {removed:[],preservedMustSee:true,unchanged:true};for(const day of pack.days)day.events=(day.events||[]).filter(e=>!remove.has(e.id));const report=validateRoutePack(pack);if(!report.valid)throw new Error(`Raccourcissement invalide: ${report.errors.map(e=>e.code).join(', ')}`);const nextRoute=routePatchForPack(pack,{completed:route.completedEventIds||[],skipped:[...(route.skippedEventIds||[]),...remove],preferredCurrentId:route.currentEventId});pocketGuideState.patch({route:nextRoute},{source:'route-action',event:'route.shortened'});return {removed:[...remove],preservedMustSee:true,remainingMinutes:nextRoute.remainingMinutes};}
  });

  if(!actionRegistry.has('place.current'))actionRegistry.register('place.current',{description:'Lire le lieu associé à l’étape courante.',riskLevel:'safe',confirmation:'none',availability:()=>Boolean(currentPlace()),handler:()=>currentPlace()});
  if(!actionRegistry.has('place.explain'))actionRegistry.register('place.explain',{description:'Expliquer le lieu courant à partir des données fiables du RoutePack.',riskLevel:'safe',confirmation:'none',availability:()=>Boolean(currentPlace()),handler:()=>{const place=currentPlace();if(!place)return null;return {id:place.id,name:place.name||place.title||'Ce lieu',description:place.historyLong||place.historyShort||place.description||place.note||'',cue:place.arCue||place.repere||''};}});
}

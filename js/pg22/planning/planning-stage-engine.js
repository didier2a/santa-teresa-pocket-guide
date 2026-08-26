import {eventBus} from '../../pg16/core/event-bus.js';

export const PLANNING_STAGES=Object.freeze([
  {id:'understanding',label:'Je comprends votre envie',progress:8},
  {id:'verification',label:'Je vérifie les lieux avec Terra',progress:24},
  {id:'route',label:'Je construis un parcours cohérent',progress:48},
  {id:'media',label:'Je rassemble les images vérifiées',progress:68},
  {id:'audio',label:'Je prépare ma voix pour le hors ligne',progress:86},
  {id:'finalizing',label:'Je finalise votre excursion',progress:96},
  {id:'ready',label:'Votre excursion est prête',progress:100}
]);

export class PlanningStageEngine{
  constructor({bus=eventBus}={}){this.bus=bus;this.controller=null;this.current=null;this.running=false;this.request=null;}
  begin(request={}){
    this.cancel('replaced',false);this.controller=new AbortController();this.running=true;this.request={...request};this.set('understanding');
    return this.controller.signal;
  }
  set(id,detail={}){
    const stage=PLANNING_STAGES.find(item=>item.id===id)||PLANNING_STAGES[0];this.current={...stage,...detail,at:new Date().toISOString()};
    this.bus.emit('pg22.planning.stage',this.snapshot());return this.current;
  }
  progress(id,completed,total,detail={}){const safeTotal=Math.max(1,Number(total)||1),ratio=Math.max(0,Math.min(1,(Number(completed)||0)/safeTotal));return this.set(id,{...detail,completed,total:safeTotal,progress:Math.round((PLANNING_STAGES.find(item=>item.id===id)?.progress||0)+ratio*12)});}
  complete(detail={}){this.running=false;this.set('ready',detail);this.controller=null;return this.snapshot();}
  fail(error){this.running=false;const payload={...this.snapshot(),error:String(error?.message||error||'Erreur')};this.bus.emit('pg22.planning.failed',payload);this.controller=null;return payload;}
  cancel(reason='user',emit=true){if(this.controller&&!this.controller.signal.aborted)this.controller.abort(reason);const wasRunning=this.running;this.running=false;this.controller=null;if(wasRunning&&emit)this.bus.emit('pg22.planning.cancelled',{reason,request:this.request});return wasRunning;}
  snapshot(){return {running:this.running,stage:this.current,request:this.request,cancellable:Boolean(this.running&&this.controller)};}
}

export const planningStageEngine=new PlanningStageEngine();

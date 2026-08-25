import {eventBus} from './event-bus.js';

const VALID_RISK=new Set(['safe','reversible','structural']);
const VALID_CONFIRMATION=new Set(['none','recommended','required']);

export class ActionRegistry {
  constructor(){this.actions=new Map();}

  register(name,{handler,availability=()=>true,riskLevel='safe',confirmation='none',undoHandler=null,description=''}={}){
    if(!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/.test(name))throw new Error(`Action invalide: ${name}`);
    if(typeof handler!=='function')throw new TypeError(`Handler manquant pour ${name}`);
    if(!VALID_RISK.has(riskLevel))throw new Error(`Niveau de risque invalide: ${riskLevel}`);
    if(!VALID_CONFIRMATION.has(confirmation))throw new Error(`Politique de confirmation invalide: ${confirmation}`);
    const definition={name,handler,availability,riskLevel,confirmation,undoHandler,description};
    this.actions.set(name,definition);eventBus.emit('action.registered',{name,riskLevel,confirmation});return definition;
  }

  unregister(name){return this.actions.delete(name);}
  has(name){return this.actions.has(name);}
  describe(name){const action=this.actions.get(name);return action?{name:action.name,riskLevel:action.riskLevel,confirmation:action.confirmation,description:action.description,undoable:typeof action.undoHandler==='function'}:null;}
  list(){return [...this.actions.keys()].sort().map(name=>this.describe(name));}

  async execute(name,args={},context={}){
    const action=this.actions.get(name);if(!action)throw new Error(`Action PocketGuide inconnue: ${name}`);
    const available=await action.availability({args,context});
    if(!available){const error=new Error(`Action indisponible: ${name}`);error.code='ACTION_UNAVAILABLE';throw error;}
    eventBus.emit('action.started',{name,args,source:context.source||'unknown'});
    try{
      const result=await action.handler(args,context);
      eventBus.emit('action.completed',{name,args,result,source:context.source||'unknown'});
      return {ok:true,name,result};
    }catch(error){eventBus.emit('action.failed',{name,args,error:String(error?.message||error),source:context.source||'unknown'});throw error;}
  }
}

export const actionRegistry=new ActionRegistry();

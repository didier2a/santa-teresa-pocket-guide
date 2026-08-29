const REQUIRED=['id','execute','toEvidence','toSpeech'];

function abortError(reason='Action annulée'){
  const error=new Error(reason);error.name='AbortError';return error;
}

function transactionId(id){return`${id}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;}

export class CapabilityRegistry{
  constructor({policyGuard,evidenceBus,bus}={}){this.items=new Map();this.running=new Map();this.policyGuard=policyGuard;this.evidenceBus=evidenceBus;this.bus=bus;}
  register(capability){
    for(const key of REQUIRED)if(!capability?.[key])throw new TypeError(`Capacité invalide: ${key} absent`);
    if(this.items.has(capability.id))throw new Error(`Capacité déjà enregistrée: ${capability.id}`);
    this.items.set(capability.id,Object.freeze({version:1,risk:'none',confirmation:'none',permissions:[],offline:'blocked',timeoutMs:30000,cancellable:true,undoable:false,...capability}));return this;
  }
  has(id){return this.items.has(id);}
  list(){return[...this.items.values()];}
  cancel(id=null,reason='Interruption utilisateur'){
    const targets=id?[this.running.get(id)]:[...this.running.values()];let cancelled=0;
    for(const item of targets.filter(Boolean)){if(item.controller.signal.aborted)continue;item.controller.abort(abortError(reason));cancelled+=1;}
    return cancelled;
  }
  cancelOthers(exceptId,reason='Interruption utilisateur'){
    let cancelled=0;
    for(const item of this.running.values()){
      if(item.id===exceptId||item.controller.signal.aborted)continue;
      item.controller.abort(abortError(reason));cancelled+=1;
    }
    return cancelled;
  }
  async execute(id,input={},context={}){
    const capability=this.items.get(id);if(!capability)throw new Error(`Capacité inconnue: ${id}`);
    const tx=transactionId(id),started=Date.now(),controller=new AbortController();
    if(context.signal){if(context.signal.aborted)controller.abort(context.signal.reason);else context.signal.addEventListener('abort',()=>controller.abort(context.signal.reason),{once:true});}
    const running={id:tx,capabilityId:id,controller,started};this.running.set(tx,running);
    this.bus?.emit('pg4.capability.started',{transactionId:tx,capabilityId:id,input,source:context.source||'application'});
    this.evidenceBus?.publish({transactionId:tx,capabilityId:id,status:'started',source:context.source||'application',data:{input}});
    let timeout=null;
    try{
      const decision=await this.policyGuard.evaluate(capability,input,context);
      if(!decision?.allowed){
        const speech=decision?.confirmationRequired?'Votre confirmation est nécessaire avant de modifier la route.':'Cette action n’est pas disponible dans l’état actuel.';
        return this.evidenceBus.publish({transactionId:tx,capabilityId:id,status:'blocked',source:context.source||'application',speech,data:{reason:decision?.reason,confirmationRequired:Boolean(decision?.confirmationRequired)},durationMs:Date.now()-started});
      }
      if(capability.timeoutMs>0)timeout=setTimeout(()=>controller.abort(abortError('Délai dépassé')),capability.timeoutMs);
      const progress=(data,speech='')=>this.evidenceBus.publish({transactionId:tx,capabilityId:id,status:'progress',source:context.source||'application',speech,data,durationMs:Date.now()-started});
      const output=await capability.execute(input,{...context,transactionId:tx,signal:controller.signal,progress,degraded:Boolean(decision.degraded)});
      if(controller.signal.aborted)throw controller.signal.reason||abortError();
      if(output===undefined)throw new Error(`La capacité ${id} n’a produit aucune preuve`);
      const data=capability.toEvidence(output,input,context);if(data===undefined)throw new Error(`La capacité ${id} n’a produit aucune preuve typée`);
      const speech=capability.toSpeech(output,input,context);const status=output?.degraded?'degraded':'succeeded';
      return this.evidenceBus.publish({transactionId:tx,capabilityId:id,status,source:context.source||'application',speech,data,durationMs:Date.now()-started});
    }catch(error){
      const cancelled=error?.name==='AbortError'||controller.signal.aborted,status=cancelled?'cancelled':'failed';
      const speech=cancelled?'J’ai arrêté cette action.':'Je n’ai pas pu terminer cette action.';
      return this.evidenceBus.publish({transactionId:tx,capabilityId:id,status,source:context.source||'application',speech,error:error?.message||error,data:{recoverable:!cancelled},durationMs:Date.now()-started});
    }finally{if(timeout)clearTimeout(timeout);this.running.delete(tx);this.bus?.emit('pg4.capability.ended',{transactionId:tx,capabilityId:id,durationMs:Date.now()-started});}
  }
}

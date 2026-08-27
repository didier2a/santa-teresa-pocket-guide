import {validateRoutePack} from '../../../engine/routepack.js';

const DEFAULT_TIMEOUT_MS=240_000;

function abortError(){const error=new Error('Génération annulée.');error.name='AbortError';return error;}
function delay(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted){reject(abortError());return;}const timer=setTimeout(done,ms);function done(){signal?.removeEventListener?.('abort',cancel);resolve();}function cancel(){clearTimeout(timer);signal?.removeEventListener?.('abort',cancel);reject(abortError());}signal?.addEventListener?.('abort',cancel,{once:true});});}
function cleanBase(value=''){return String(value||'').replace(/\/$/,'');}
function errorMessage(payload,status){return payload?.error||`Planner indisponible (${status})`;}

export function usesSameOriginPlanner(locationLike=globalThis.location){
  const hostname=String(locationLike?.hostname||'').toLowerCase();
  return hostname==='santa-teresa-pocket-guide.vercel.app'||hostname.endsWith('.vercel.app');
}

export class PlannerClient {
  constructor({fetchImpl=(...args)=>globalThis.fetch(...args),locationLike=globalThis.location,waitImpl=delay,nowImpl=()=>Date.now(),timeoutMs=DEFAULT_TIMEOUT_MS}={}){
    this.fetchImpl=fetchImpl;this.locationLike=locationLike;this.waitImpl=waitImpl;this.nowImpl=nowImpl;this.timeoutMs=timeoutMs;this.configPromise=null;
  }

  async config(){
    if(!this.configPromise)this.configPromise=this.fetchImpl('./data/v2-config.json',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject(new Error(`Config ${response.status}`)));
    return this.configPromise;
  }

  async payload(response){return response.json().catch(()=>({}));}

  validate(pack){
    const report=validateRoutePack(pack);if(!report.valid){const error=new Error(`RoutePack Planner rejeté: ${report.errors.map(item=>item.code).join(', ')}`);error.report=report;throw error;}return report;
  }

  async pollSameOrigin(taskId,{signal}={}){
    const started=this.nowImpl();let attempt=0;
    while(this.nowImpl()-started<this.timeoutMs){
      if(signal?.aborted)throw abortError();
      const response=await this.fetchImpl(`/api/plan-status?id=${encodeURIComponent(taskId)}`,{cache:'no-store',signal});
      const payload=await this.payload(response);
      if(response.status===202){attempt+=1;await this.waitImpl(Math.min(5_000,1_800+attempt*180),signal);continue;}
      if(!response.ok)throw new Error(errorMessage(payload,response.status));
      if(payload?.pack)return payload;
      await this.waitImpl(2_500,signal);
    }
    throw new Error('La génération prend trop de temps. Réessayez dans quelques instants.');
  }

  async planSameOrigin(input,{signal,cfg}={}){
    const response=await this.fetchImpl('/api/plan',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(input),signal});
    const started=await this.payload(response);if(!response.ok)throw new Error(errorMessage(started,response.status));if(!started?.taskId)throw new Error('Le backend n’a pas renvoyé d’identifiant de génération.');
    const completed=await this.pollSameOrigin(started.taskId,{signal}),pack=completed.pack,report=this.validate(pack);
    return {pack,plannerModel:completed.model||started.model||cfg?.plannerModel||null,verificationSources:completed.verificationSources||[],report,transport:'vercel-background'};
  }

  async planWorker(input,{signal,cfg}={}){
    if(!cfg?.apiBase)throw new Error('Le pont Planner n’est pas configuré.');
    const response=await this.fetchImpl(`${cleanBase(cfg.apiBase)}/v1/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
    const payload=await this.payload(response);if(!response.ok)throw new Error(errorMessage(payload,response.status));const pack=payload?.pack,report=this.validate(pack);
    return {pack,plannerModel:payload.plannerModel||cfg.plannerModel||null,verificationSources:payload.verificationSources||[],report,transport:'worker'};
  }

  async plan({prompt,destination='',maxPlaces=5,timezone='Europe/Paris',signal}={}){
    const text=String(prompt||'').trim();if(text.length<8)throw new Error('Décrivez davantage la balade souhaitée.');
    const cfg=await this.config(),input={prompt:text,destination:String(destination||'').trim(),maxPlaces:Math.max(3,Math.min(10,Number(maxPlaces)||5)),timezone};
    return usesSameOriginPlanner(this.locationLike)?this.planSameOrigin(input,{signal,cfg}):this.planWorker(input,{signal,cfg});
  }
}

export const plannerClient=new PlannerClient();

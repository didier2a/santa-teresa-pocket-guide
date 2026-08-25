import {validateRoutePack} from '../../../engine/routepack.js';

let configPromise=null;
async function config(){if(!configPromise)configPromise=fetch('./data/v2-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error(`Config ${r.status}`)));return configPromise;}

export class PlannerClient {
  async plan({prompt,destination='',maxPlaces=5,timezone='Europe/Paris',signal}={}){
    const text=String(prompt||'').trim();if(text.length<8)throw new Error('Décrivez davantage la balade souhaitée.');
    const cfg=await config();if(!cfg.apiBase)throw new Error('Le pont Planner n’est pas configuré.');
    const response=await fetch(`${cfg.apiBase}/v1/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:text,destination:String(destination||'').trim(),maxPlaces:Math.max(3,Math.min(10,Number(maxPlaces)||5)),timezone}),signal});
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.error||`Planner indisponible (${response.status})`);
    const pack=payload?.pack;const report=validateRoutePack(pack);if(!report.valid){const error=new Error(`RoutePack Planner rejeté: ${report.errors.map(e=>e.code).join(', ')}`);error.report=report;throw error;}
    return {pack,plannerModel:payload.plannerModel||cfg.plannerModel||null,verificationSources:payload.verificationSources||[],report};
  }
}

export const plannerClient=new PlannerClient();
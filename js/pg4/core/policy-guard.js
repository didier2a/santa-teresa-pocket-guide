function online(context){return context?.online??(typeof navigator==='undefined'||navigator.onLine!==false);}

export class PolicyGuard{
  async evaluate(capability,input,context={}){
    const permissions=Array.isArray(capability.permissions)?capability.permissions:[];
    if(permissions.includes('network')&&!online(context)){
      return capability.offline==='degraded'
        ?{allowed:true,degraded:true,reason:'network-offline'}
        :{allowed:false,reason:'network-required'};
    }
    if(capability.confirmation==='before-commit'&&context.confirmed!==true)return{allowed:false,confirmationRequired:true,reason:'confirmation-required'};
    if(typeof capability.policy==='function')return capability.policy(input,context);
    return{allowed:true,degraded:false};
  }
}


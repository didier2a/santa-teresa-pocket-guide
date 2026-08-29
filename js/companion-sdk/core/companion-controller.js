export class CompanionController{
  constructor({provider,bus=null}={}){
    if(!provider)throw new TypeError('CompanionController requiert un provider');
    this.provider=provider;
    this.bus=bus;
    this.capabilityHandler=null;
    this.statusHandler=null;
    this.turnHandler=null;
    this.installed=false;this.installOptions=null;
  }

  install({onCapability,onStatus,onTurn,...nodes}={}){
    this.installOptions={onCapability,onStatus,onTurn,...nodes};
    this.capabilityHandler=onCapability||null;
    this.statusHandler=onStatus||null;
    this.turnHandler=onTurn||null;
    this.provider.install({
      ...nodes,
      onCommand:(text,meta)=>this.routeCapability(text,meta),
      onStatus:payload=>{
        this.statusHandler?.(payload);
        this.bus?.emit('companion.sdk.status',payload);
      },
      onTurn:(role,text,meta)=>{
        this.turnHandler?.(role,text,meta);
        this.bus?.emit('companion.sdk.turn',{role,text,meta});
      }
    });
    this.installed=true;
    this.bus?.emit('companion.sdk.installed',{provider:this.provider.id});
    return this;
  }

  routeCapability(text,meta={}){
    if(!this.capabilityHandler)return{handled:false};
    const routed=this.capabilityHandler(text,meta);
    return routed?.handled?routed:{handled:false};
  }

  startListening(){return this.provider.startListening();}
  toggleListening(){return this.provider.toggleListening();}
  suspendMicrophone(){return this.provider.suspendMicrophone();}
  resumeMicrophone(shouldResume=true){return this.provider.resumeMicrophone(shouldResume);}
  interrupt(reason){return this.provider.interrupt(reason);}
  narrateEvidence(evidence){return this.provider.narrateEvidence(evidence);}

  diagnostic(){
    return{
      controller:'companion-controller',
      installed:this.installed,
      ...this.provider.diagnostic()
    };
  }

  async destroy(){
    this.installed=false;
    await this.provider.destroy();
    this.bus?.emit('companion.sdk.destroyed',{provider:this.provider.id});
  }

  async reset(){
    const options=this.installOptions;await this.destroy();if(options)this.install(options);
    this.bus?.emit('companion.sdk.reset',{provider:this.provider.id});return true;
  }
}

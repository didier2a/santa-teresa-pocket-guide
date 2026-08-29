export class V4Orchestrator{
  constructor({router,registry,state,bus,avatar}={}){this.router=router;this.registry=registry;this.state=state;this.bus=bus;this.avatar=avatar;}
  route(text,{source='text'}={}){
    const intent=this.router.parse(text,{source});if(!intent)return{handled:false};
    this.state.patch({intent},{source:'intent'});this.bus?.emit('pg4.intent.heard',intent);
    const completion=this.execute(intent);
    return{handled:true,id:intent.id,intent:intent.capabilityId,completion};
  }
  async execute(intent){
    const confirmed=intent.capabilityId==='route.confirmProposal'&&intent.confidence>=.9;
    const evidence=await this.registry.execute(intent.capabilityId,intent.input,{source:intent.source,confirmed});
    if(intent.source!=='liveavatar-voice')await this.avatar?.narrateEvidence(evidence).catch(()=>false);
    return evidence;
  }
  submit(text,options){return this.route(text,options).completion;}
}


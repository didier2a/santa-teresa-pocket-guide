import {eventBus} from '../../pg16/core/event-bus.js';

export const LIVING_PRESENCE_STATES=Object.freeze(['ready','listening','thinking','speaking','presenting','walking','arrived','interrupted','degraded','error']);
const PORTRAIT_BY_STATE=Object.freeze({ready:'hero',listening:'hero',thinking:'hero',speaking:'guide',presenting:'guide',walking:'compact',arrived:'compact',interrupted:'guide',degraded:'guide',error:'guide'});

export class LivingPresenceMachine{
  constructor({bus=eventBus,clock=()=>new Date().toISOString(),historyLimit=40}={}){this.bus=bus;this.clock=clock;this.historyLimit=historyLimit;this.state='ready';this.sequence=0;this.history=[];this.app=null;this.avatar=null;this.label=null;}
  install({app,avatar,label}={}){this.app=app||this.app;this.avatar=avatar||this.avatar;this.label=label||this.label;this.transition('ready',{source:'runtime',reason:'installed',label:'Je suis avec vous',force:true});return this;}
  transition(state,{source='runtime',reason='state-update',label='',portrait,force=false}={}){
    const next=LIVING_PRESENCE_STATES.includes(state)?state:'ready',mode=portrait||PORTRAIT_BY_STATE[next]||'guide';if(!force&&next===this.state&&mode===this.current().mode&&label===this.label?.textContent)return this.current();
    const previous=this.state;this.state=next;this.sequence+=1;const at=this.clock(),record={sequence:this.sequence,previous,state:next,mode,source:String(source||'runtime'),reason:String(reason||'state-update'),label:String(label||''),at};
    if(this.app){this.app.dataset.presence=next;this.app.dataset.portrait=mode;this.app.dataset.presenceSource=record.source;this.app.dataset.presenceReason=record.reason;}
    if(this.avatar)this.avatar.dataset.avatarState=next;if(this.label&&label)this.label.textContent=label;
    this.history.push(record);if(this.history.length>this.historyLimit)this.history.shift();this.bus.emit('pg23.presence.changed',record);return record;
  }
  interrupt(source='user'){return this.transition('interrupted',{source,reason:'immediate-stop',label:'Je vous écoute',portrait:'guide'});}
  current(){return this.history.at(-1)||{sequence:this.sequence,state:this.state,mode:PORTRAIT_BY_STATE[this.state],source:'runtime',reason:'current',at:this.clock()};}
  diagnostic(){return{...this.current(),historyLength:this.history.length};}
}

export const livingPresenceMachine=new LivingPresenceMachine();
export {PORTRAIT_BY_STATE};

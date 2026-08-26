import {eventBus} from '../../pg16/core/event-bus.js';

export function autoRevealPolicy({distanceFromEnd=Infinity,userActive=false,dialogOpen=false,editing=false,reducedMotion=false,threshold=220}={}){const reasons=[];if(Number(distanceFromEnd)>threshold)reasons.push('reader-away');if(userActive)reasons.push('human-interaction');if(dialogOpen)reasons.push('dialog-open');if(editing)reasons.push('editing');if(reducedMotion)reasons.push('reduced-motion');return{allowed:reasons.length===0,reasons};}

export class ScrollDirector{
  constructor({bus=eventBus,clock=()=>Date.now()}={}){this.bus=bus;this.clock=clock;this.flow=null;this.resumeButton=null;this.app=null;this.pendingNode=null;this.suspendedUntil=0;this.installed=false;this.handlers=[];this.reducedMotion=false;}
  install({flow,resumeButton,app}={}){
    if(this.installed)return this;this.installed=true;this.flow=flow;this.resumeButton=resumeButton;this.app=app;this.reducedMotion=Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    const interact=()=>this.suspend('human-interaction',3600),scroll=()=>{this.updateEngagement();if(!this.pendingNode)return;const policy=this.policy();if(policy.allowed)this.revealPending();},focus=event=>{if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))this.suspend('editing',5000);};
    for(const [target,type,handler,options] of [[globalThis,'pointerdown',interact,{passive:true}],[globalThis,'touchstart',interact,{passive:true}],[globalThis,'wheel',interact,{passive:true}],[globalThis,'keydown',interact],[globalThis,'scroll',scroll,{passive:true}],[document,'focusin',focus]]){target?.addEventListener?.(type,handler,options);this.handlers.push([target,type,handler,options]);}
    this.resumeButton?.addEventListener('click',()=>this.revealPending(true));this.updateEngagement();return this;
  }
  distanceFromEnd(){const doc=globalThis.document?.documentElement;return doc?Math.max(0,(doc.scrollHeight||0)-((globalThis.scrollY||0)+(globalThis.innerHeight||0))):0;}
  policy(){const doc=globalThis.document;return autoRevealPolicy({distanceFromEnd:this.distanceFromEnd(),userActive:this.clock()<this.suspendedUntil,dialogOpen:Boolean(doc?.querySelector?.('dialog[open]')),editing:Boolean(doc?.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')),reducedMotion:this.reducedMotion});}
  suspend(reason='human-interaction',duration=3600){this.suspendedUntil=Math.max(this.suspendedUntil,this.clock()+duration);this.bus.emit('pg23.scroll.suspended',{reason,until:this.suspendedUntil});return this.suspendedUntil;}
  present(node){if(!node)return false;this.pendingNode=node;const policy=this.policy();if(policy.allowed){queueMicrotask(()=>this.revealPending());return true;}if(this.resumeButton)this.resumeButton.hidden=false;this.bus.emit('pg23.scroll.pending',{reasons:policy.reasons});return false;}
  revealPending(force=false){if(!this.pendingNode)return false;if(!force&&!this.policy().allowed)return false;const node=this.pendingNode;this.pendingNode=null;if(this.resumeButton)this.resumeButton.hidden=true;node.scrollIntoView?.({block:'nearest',behavior:this.reducedMotion?'auto':'smooth'});this.bus.emit('pg23.scroll.resumed',{forced:force});return true;}
  updateEngagement(){if(!this.flow||!this.app)return false;const rect=this.flow.getBoundingClientRect(),engaged=rect.top<(globalThis.innerHeight||800)*.7&&rect.bottom>90;this.app.dataset.flowEngaged=String(engaged);return engaged;}
  destroy(){for(const [target,type,handler,options] of this.handlers)target?.removeEventListener?.(type,handler,options);this.handlers=[];this.installed=false;}
}

export const scrollDirector=new ScrollDirector();

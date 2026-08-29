export class EventBus {
  constructor(){this.listeners=new Map();}

  on(type,handler){
    if(typeof handler!=='function')throw new TypeError('EventBus handler must be a function');
    const set=this.listeners.get(type)||new Set();
    set.add(handler);this.listeners.set(type,set);
    return()=>this.off(type,handler);
  }

  once(type,handler){
    const off=this.on(type,(payload,event)=>{off();handler(payload,event);});
    return off;
  }

  off(type,handler){
    const set=this.listeners.get(type);if(!set)return false;
    const deleted=set.delete(handler);if(!set.size)this.listeners.delete(type);return deleted;
  }

  emit(type,payload={}){
    const event={type,payload,at:new Date().toISOString()};
    const targets=[...(this.listeners.get(type)||[]),...(this.listeners.get('*')||[])];
    for(const handler of targets){try{handler(payload,event)}catch(error){console.error('[PocketGuide 1.6] event handler failed',type,error)}}
    return event;
  }

  clear(type=null){if(type)this.listeners.delete(type);else this.listeners.clear();}
}

export const eventBus=new EventBus();

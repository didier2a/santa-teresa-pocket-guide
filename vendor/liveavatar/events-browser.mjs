export class EventEmitter{
  constructor(){this._events=new Map();this._maxListeners=10;}
  setMaxListeners(value){this._maxListeners=Number(value);return this;}
  getMaxListeners(){return this._maxListeners;}
  eventNames(){return[...this._events.keys()];}
  listenerCount(name){return this._events.get(name)?.length||0;}
  listeners(name){return(this._events.get(name)||[]).map(listener=>listener.listener||listener);}
  rawListeners(name){return[...(this._events.get(name)||[])];}
  on(name,listener){return this.addListener(name,listener);}
  addListener(name,listener){
    if(typeof listener!=='function')throw new TypeError('listener must be a function');
    const listeners=this._events.get(name)||[];listeners.push(listener);this._events.set(name,listeners);return this;
  }
  prependListener(name,listener){
    if(typeof listener!=='function')throw new TypeError('listener must be a function');
    const listeners=this._events.get(name)||[];listeners.unshift(listener);this._events.set(name,listeners);return this;
  }
  once(name,listener){
    const wrapper=(...args)=>{this.removeListener(name,wrapper);listener.apply(this,args);};wrapper.listener=listener;return this.addListener(name,wrapper);
  }
  prependOnceListener(name,listener){
    const wrapper=(...args)=>{this.removeListener(name,wrapper);listener.apply(this,args);};wrapper.listener=listener;return this.prependListener(name,wrapper);
  }
  off(name,listener){return this.removeListener(name,listener);}
  removeListener(name,listener){
    const listeners=this._events.get(name);if(!listeners)return this;
    const next=listeners.filter(item=>item!==listener&&item.listener!==listener);if(next.length)this._events.set(name,next);else this._events.delete(name);return this;
  }
  removeAllListeners(name){if(name===undefined)this._events.clear();else this._events.delete(name);return this;}
  emit(name,...args){
    const listeners=this._events.get(name);if(!listeners?.length){if(name==='error'&&args[0] instanceof Error)throw args[0];return false;}
    for(const listener of[...listeners])listener.apply(this,args);return true;
  }
}

EventEmitter.defaultMaxListeners=10;
EventEmitter.listenerCount=(emitter,name)=>emitter.listenerCount(name);

export function once(emitter,name){
  return new Promise((resolve,reject)=>{
    const done=(...args)=>{emitter.removeListener?.('error',failed);resolve(args);};
    const failed=error=>{emitter.removeListener?.(name,done);reject(error);};
    emitter.once(name,done);if(name!=='error')emitter.once('error',failed);
  });
}

export default EventEmitter;

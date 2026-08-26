import {eventBus} from '../../pg16/core/event-bus.js';

const now=()=>globalThis.performance?.now?.()||Date.now();

export class LivingPerformanceMonitor{
  constructor({bus=eventBus,clock=now,raf=globalThis.requestAnimationFrame,caf=globalThis.cancelAnimationFrame}={}){this.bus=bus;this.clock=clock;this.raf=raf;this.caf=caf;this.bootAt=this.clock();this.firstRenderMs=null;this.firstContentfulPaintMs=null;this.lastTouchMs=null;this.lastLipMs=null;this.sampledFps=null;this.longTasks=0;this.battery=null;this.observers=[];this.handlers=[];this.fpsFrame=0;}
  install({root}={}){
    this.raf?.(()=>{this.firstRenderMs=Math.round(this.clock()-this.bootAt);this.bus.emit('pg23.performance.first-render',{durationMs:this.firstRenderMs});});
    const onPointer=()=>{const started=this.clock();this.raf?.(()=>{this.lastTouchMs=Math.round(this.clock()-started);this.bus.emit('pg23.performance.touch',{durationMs:this.lastTouchMs});});};root?.addEventListener?.('pointerdown',onPointer,{passive:true});this.handlers.push([root,'pointerdown',onPointer]);
    try{const observer=new PerformanceObserver(list=>{this.longTasks+=list.getEntries().length;});observer.observe({type:'longtask',buffered:true});this.observers.push(observer);}catch{}
    try{const observer=new PerformanceObserver(list=>{const entry=list.getEntriesByName('first-contentful-paint').at(-1);if(entry){this.firstContentfulPaintMs=Math.round(entry.startTime);this.bus.emit('pg23.performance.fcp',{durationMs:this.firstContentfulPaintMs});}});observer.observe({type:'paint',buffered:true});this.observers.push(observer);}catch{}
    try{globalThis.navigator?.getBattery?.().then(value=>{this.battery={charging:Boolean(value.charging),level:Math.round(Number(value.level)*100)};const update=()=>{this.battery={charging:Boolean(value.charging),level:Math.round(Number(value.level)*100)};this.bus.emit('pg23.performance.battery',this.battery);};for(const type of ['chargingchange','levelchange']){value.addEventListener?.(type,update);this.handlers.push([value,type,update]);}update();}).catch(()=>{});}catch{}
    void this.sampleFps();return this;
  }
  sampleFps(durationMs=1000){if(!this.raf||this.fpsFrame)return Promise.resolve(this.sampledFps);const started=this.clock();let frames=0;return new Promise(resolve=>{const tick=()=>{frames+=1;const elapsed=this.clock()-started;if(elapsed>=durationMs){this.fpsFrame=0;this.sampledFps=Math.round(frames*1000/Math.max(1,elapsed));this.bus.emit('pg23.performance.fps',{fps:this.sampledFps,durationMs:Math.round(elapsed)});resolve(this.sampledFps);return;}this.fpsFrame=this.raf(tick);};this.fpsFrame=this.raf(tick);});}
  noteLipLatency(durationMs){if(Number.isFinite(durationMs)){this.lastLipMs=Math.round(durationMs);this.bus.emit('pg23.performance.lipsync',{durationMs:this.lastLipMs});}return this.lastLipMs;}
  snapshot(){const memory=globalThis.performance?.memory,activeVideos=globalThis.document?[...document.querySelectorAll('video')].filter(video=>Boolean(video.srcObject)&&!video.paused).length:0;return{firstRenderMs:this.firstRenderMs,firstContentfulPaintMs:this.firstContentfulPaintMs,lastTouchMs:this.lastTouchMs,lastLipMs:this.lastLipMs,sampledFps:this.sampledFps,longTasks:this.longTasks,heapBytes:Number(memory?.usedJSHeapSize)||null,battery:this.battery,activeVideoDecoders:activeVideos,at:new Date().toISOString()};}
  destroy(){for(const observer of this.observers)observer?.disconnect?.();this.observers=[];if(this.fpsFrame)this.caf?.(this.fpsFrame);this.fpsFrame=0;for(const [target,type,handler] of this.handlers)target?.removeEventListener?.(type,handler);this.handlers=[];}
}

export const livingPerformanceMonitor=new LivingPerformanceMonitor();

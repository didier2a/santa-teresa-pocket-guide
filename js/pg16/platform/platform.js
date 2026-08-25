import {eventBus} from '../core/event-bus.js';
import {pocketGuideState} from '../core/pocketguide-state.js';

function ua(){return String(globalThis.navigator?.userAgent||'');}
export function detectPlatform(){const value=ua();if(/iPhone|iPad|iPod/i.test(value))return'ios';if(/Android/i.test(value))return'android';return'web';}

export class PlatformAdapter {
  constructor(){this.platform=detectPlatform();}
  async requestOrientationPermission(){
    const EventType=globalThis.DeviceOrientationEvent;
    if(!EventType){pocketGuideState.patch({perception:{orientation:'unavailable'}},{source:'platform',event:'orientation.unavailable'});return false;}
    if(typeof EventType.requestPermission==='function'){
      try{const value=await EventType.requestPermission();const ok=value==='granted';pocketGuideState.patch({perception:{orientation:ok?'ready':'denied'}},{source:'platform',event:ok?'orientation.permission.granted':'orientation.permission.denied'});return ok;}catch(error){pocketGuideState.patch({perception:{orientation:'error'}},{source:'platform',event:'orientation.permission.error'});return false;}
    }
    pocketGuideState.patch({perception:{orientation:'ready'}},{source:'platform',event:'orientation.permission.granted'});return true;
  }
  updateDeviceState(){const platform=this.platform;pocketGuideState.patch({device:{platform,online:globalThis.navigator?.onLine!==false,standalone:Boolean(globalThis.matchMedia?.('(display-mode: standalone)')?.matches)}},{source:'platform',event:'platform.detected'});return platform;}
  installNetworkWatch(){if(typeof globalThis.addEventListener!=='function')return()=>{};const online=()=>pocketGuideState.patch({device:{online:true}},{source:'platform',event:'network.online'});const offline=()=>pocketGuideState.patch({device:{online:false}},{source:'platform',event:'network.offline'});globalThis.addEventListener('online',online);globalThis.addEventListener('offline',offline);return()=>{globalThis.removeEventListener?.('online',online);globalThis.removeEventListener?.('offline',offline);};}
}

export const platformAdapter=new PlatformAdapter();
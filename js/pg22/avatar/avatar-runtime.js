import {eventBus} from '../../pg16/core/event-bus.js';

const ACTIVE_VISEMES=['neutral','mbp','fv','a','ei','o','u','lt'];
export class AvatarRuntime{
  constructor(){this.root=null;this.mouth=null;this.label=null;this.state='ready';this.viseme='neutral';this.lastVisemeAt=0;this.unsubscribe=[];}
  install({root,mouth,label}={}){this.root=root;this.mouth=mouth;this.label=label;this.setState('ready','Je suis avec vous');this.unsubscribe.push(eventBus.on('pg22.planning.stage',payload=>this.setState(payload?.running?'thinking':'ready',payload?.stage?.label)),eventBus.on('pg22.planning.cancelled',()=>this.setState('ready','Préparation annulée')),eventBus.on('pg22.audio.started',()=>this.setState('speaking','Je vous parle')),eventBus.on('pg22.audio.ended',()=>this.setState('ready','Je suis avec vous')),eventBus.on('pg22.audio.interrupted',()=>this.setState('ready','Je vous écoute')));return this;}
  setState(state,label=''){this.state=state;this.root?.setAttribute('data-avatar-state',state);if(this.label&&label)this.label.textContent=label;if(state!=='speaking')this.setViseme('neutral');return state;}
  setViseme(viseme){const value=ACTIVE_VISEMES.includes(viseme)?viseme:'neutral';this.viseme=value;if(this.mouth){this.mouth.dataset.viseme=value;this.mouth.style.setProperty('--viseme-index',String(ACTIVE_VISEMES.indexOf(value)));}return value;}
  drive(level=0){
    if(level<0.035){if(this.state==='speaking')this.setViseme('neutral');return;}if(this.state!=='speaking')this.setState('speaking','Je vous parle');const now=performance.now();if(now-this.lastVisemeAt<72)return;this.lastVisemeAt=now;const energy=Math.max(0,Math.min(1,Number(level)||0)),index=energy>.78?3:energy>.55?5:energy>.32?4:1+Math.floor((now/97)%7);this.setViseme(ACTIVE_VISEMES[Math.max(1,Math.min(7,index))]);
  }
  interrupt(){this.setState('ready','Je vous écoute');this.setViseme('neutral');}
  destroy(){this.unsubscribe.splice(0).forEach(off=>off?.());}
}

export const avatarRuntime=new AvatarRuntime();

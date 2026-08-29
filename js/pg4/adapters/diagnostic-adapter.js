export class DiagnosticAdapter{
  constructor({windowImpl=globalThis.window,navigatorImpl=globalThis.navigator,terrain=null,layout=null,companion=null,offline=null}={}){this.window=windowImpl;this.navigator=navigatorImpl;this.terrain=terrain;this.layout=layout;this.companion=companion;this.offline=offline;}
  checks(){
    const value=(name,ok,detail='')=>({name,ok:Boolean(ok),detail});
    return[
      value('Service Worker','serviceWorker'in(this.navigator||{})),
      value('GPS Web',Boolean(this.navigator?.geolocation)),
      value('Caméra / micro',Boolean(this.navigator?.mediaDevices?.getUserMedia)),
      value('WebRTC',typeof this.window?.RTCPeerConnection!=='undefined'),
      value('Orientation',typeof this.window?.DeviceOrientationEvent!=='undefined'),
      value('SpeechRecognition',Boolean(this.window?.SpeechRecognition||this.window?.webkitSpeechRecognition)),
      value('MediaRecorder fallback',typeof this.window?.MediaRecorder!=='undefined'),
      value('Cache API','caches'in(this.window||{})),
      value('Affichage 9:16 / 16:9',this.layout?.diagnostic?.().automatic,this.layout?.diagnostic?.().aspect||''),
      value('Companion SDK',this.companion?.diagnostic?.().sdkVersion,this.companion?.diagnostic?.().provider||''),
      value('Route hors ligne',Boolean(this.offline?.restore?.()))
    ];
  }
  async testPermissions(){
    const output=[];
    const orientation=await this.terrain?.requestOrientationFromGesture?.();output.push({name:'Orientation',ok:Boolean(orientation)});
    if(this.navigator?.geolocation)output.push(await new Promise(resolve=>this.navigator.geolocation.getCurrentPosition(position=>resolve({name:'GPS Web',ok:true,detail:`±${Math.round(position.coords.accuracy||0)} m`}),error=>resolve({name:'GPS Web',ok:false,detail:error.message}),{enableHighAccuracy:true,timeout:10000,maximumAge:0})));else output.push({name:'GPS Web',ok:false,detail:'API absente'});
    if(this.navigator?.mediaDevices?.getUserMedia){try{const stream=await this.navigator.mediaDevices.getUserMedia({audio:true,video:{facingMode:{ideal:'environment'}}});stream.getTracks().forEach(track=>track.stop());output.push({name:'Caméra / micro',ok:true});}catch(error){output.push({name:'Caméra / micro',ok:false,detail:error.message});}}else output.push({name:'Caméra / micro',ok:false,detail:'API absente'});
    return output;
  }
  render(host,checks=this.checks()){
    if(!host)return checks;host.replaceChildren();
    for(const check of checks){const row=this.window.document.createElement('li');row.className=check.ok?'is-ok':'is-ko';const strong=this.window.document.createElement('strong');strong.textContent=`${check.ok?'✓':'×'} ${check.name}`;const small=this.window.document.createElement('small');small.textContent=check.detail|| (check.ok?'Disponible':'Indisponible');row.append(strong,small);host.append(row);}return checks;
  }
}

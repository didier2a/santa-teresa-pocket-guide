import {haversineKm} from './ar-core.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<80&&!window.__POCKETGUIDE_15__;i++)await sleep(100);
const app=window.__POCKETGUIDE_15__;
if(app){
  const radiusMeters=Number((await fetch('./data/v2-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():({})).catch(()=>({}))).autoGuideRadiusMeters)||110;
  const cooldownMs=(Number((await fetch('./data/v2-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():({})).catch(()=>({}))).autoGuideCooldownMinutes)||12)*60000;
  let lastPlaceId='',lastAt=0;
  setInterval(()=>{
    const {state,pack}=app;
    if(!state?.connected||state.listening||!state.position||state.dc?.readyState!=='open')return;
    const nearest=(pack.places||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>({p,d:haversineKm(state.position,p)})).sort((a,b)=>a.d-b.d)[0];
    if(!nearest||nearest.d*1000>radiusMeters)return;
    const now=Date.now();if(nearest.p.id===lastPlaceId&&now-lastAt<cooldownMs)return;
    lastPlaceId=nearest.p.id;lastAt=now;state.focusedPlaceId=nearest.p.id;
    try{navigator.vibrate?.(20)}catch{}
    state.dc.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:`Le voyageur vient d'entrer dans la zone du lieu « ${nearest.p.name} » à environ ${Math.round(nearest.d*1000)} mètres. Prends l'initiative comme un guide humain : attire brièvement son attention sur ce qu'il peut observer, donne un détail mémorable tiré du RoutePack, puis laisse-le poursuivre. Ne parle pas plus de 20 secondes.`}]}}));
    state.dc.send(JSON.stringify({type:'response.create',response:{instructions:'Guidage proactif de proximité : sois bref, concret et orienté vers ce qui est visible.'}}));
  },5000);
}

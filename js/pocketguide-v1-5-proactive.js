import {haversineKm} from './ar-core.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<80&&!window.__POCKETGUIDE_15__;i++)await sleep(100);
const app=window.__POCKETGUIDE_15__;
if(app){
  const cfg=await fetch('./data/v2-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():({})).catch(()=>({}));
  const radiusMeters=Number(cfg.autoGuideRadiusMeters)||110;
  const exitRadiusMeters=Math.max(radiusMeters+45,Math.round(radiusMeters*1.45));
  const placeCooldownMs=(Number(cfg.autoGuideCooldownMinutes)||12)*60000;
  const globalCooldownMs=Math.max(45000,Number(cfg.autoGuideGlobalCooldownSeconds||75)*1000);
  const seenKey=`pg15-proactive-v2:${app.pack.id}`;
  let seen={};try{seen=JSON.parse(localStorage.getItem(seenKey)||'{}')||{}}catch{}
  let lastGlobalAt=0;
  let insidePlaceId='';

  function save(){try{localStorage.setItem(seenKey,JSON.stringify(seen))}catch{}}
  setInterval(()=>{
    const {state,pack}=app;
    if(!state?.proactiveEnabled||!state.connected||state.listening||state.responding||!state.position||state.dc?.readyState!=='open')return;
    if(!state.position.simulated&&Number(state.position.accuracy)>Math.max(80,radiusMeters))return;
    const nearest=(pack.places||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>({p,d:haversineKm(state.position,p)*1000})).sort((a,b)=>a.d-b.d)[0];
    if(!nearest)return;
    if(insidePlaceId&&nearest.p.id===insidePlaceId&&nearest.d<=exitRadiusMeters)return;
    if(nearest.d>radiusMeters){if(nearest.d>exitRadiusMeters)insidePlaceId='';return}
    const now=Date.now();
    if(now-lastGlobalAt<globalCooldownMs)return;
    if(now-Number(seen[nearest.p.id]||0)<placeCooldownMs)return;
    insidePlaceId=nearest.p.id;seen[nearest.p.id]=now;lastGlobalAt=now;save();
    try{navigator.vibrate?.(20)}catch{}
    app.requestProactiveGuide?.(nearest.p,nearest.d);
  },5000);
}

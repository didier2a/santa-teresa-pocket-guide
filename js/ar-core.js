export function toRad(value){return Number(value)*Math.PI/180}
export function toDeg(value){return Number(value)*180/Math.PI}
export function normalizeHeading(value){const n=Number(value);return Number.isFinite(n)?((n%360)+360)%360:0}
export function haversineKm(a,b){
  if(!a||!b)return Infinity;
  const R=6371;
  const dLat=toRad(Number(b.lat)-Number(a.lat));
  const dLng=toRad(Number(b.lng)-Number(a.lng));
  const lat1=toRad(Number(a.lat)),lat2=toRad(Number(b.lat));
  const q=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
}
export function bearingDeg(a,b){
  if(!a||!b)return 0;
  const p1=toRad(Number(a.lat)),p2=toRad(Number(b.lat)),dl=toRad(Number(b.lng)-Number(a.lng));
  const y=Math.sin(dl)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return normalizeHeading(toDeg(Math.atan2(y,x)));
}
export function deltaHeading(target,current){return((normalizeHeading(target)-normalizeHeading(current)+540)%360)-180}
export function compassLabel(value){return['N','NE','E','SE','S','SO','O','NO'][Math.round(normalizeHeading(value)/45)%8]}
export function projectPlaces({position,places=[],heading=0,fov=68,maxDistanceKm=25,includeOutsideFov=false}={}){
  if(!position)return[];
  return places.map(place=>{
    const distanceKm=haversineKm(position,place);
    const bearing=bearingDeg(position,place);
    const delta=deltaHeading(bearing,heading);
    const visible=distanceKm<=maxDistanceKm&&(includeOutsideFov||Math.abs(delta)<=fov/2+10);
    const x=.5+delta/fov;
    return {place,distanceKm,bearing,delta,visible,x};
  }).filter(item=>item.distanceKm<=maxDistanceKm).sort((a,b)=>a.distanceKm-b.distanceKm);
}
export function simulatedPositionForPlace(place,{northMeters=35,westMeters=20}={}){
  if(!place||!Number.isFinite(place.lat)||!Number.isFinite(place.lng))return null;
  const latOffset=northMeters/111320;
  const lngScale=Math.max(.2,Math.cos(toRad(place.lat)));
  const lngOffset=westMeters/(111320*lngScale);
  return {lat:place.lat+latOffset,lng:place.lng-lngOffset,accuracy:3,simulated:true};
}

if(typeof window!=='undefined'){
  const version=document.querySelector('#today .hero__meta > div:nth-child(3) span');if(version)version.textContent='V1.4.9';
  const label=document.querySelector('#today .hero__meta > div:nth-child(3) small');if(label)label.textContent='16:9 + Audio';
  const css=document.createElement('link');
  if(!document.querySelector('link[data-pg-v149]')){css.rel='stylesheet';css.href='./ar-v149.css?v=1.4.9';css.dataset.pgV149='1';document.head.append(css)}
  import('./orientation-v149.js?v=1.4.9').catch(error=>console.warn('PocketGuide orientation',error));
  import('./audio-companion-v149.js?v=1.4.9').catch(error=>console.warn('PocketGuide audio companion',error));
}

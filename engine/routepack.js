const HHMM=/^([01]\d|2[0-3]):[0-5]\d$/;

export function minutes(value){
  if(!HHMM.test(value||''))return NaN;
  const [h,m]=value.split(':').map(Number);
  return h*60+m;
}

export function legacyTripToRoutePack(legacy){
  const trip=legacy?.trip||{};
  const slug=String(trip.title||'route').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64)||'route';
  return {
    schemaVersion:'1.0',
    id:slug,
    title:trip.title||'PocketGuide Route',
    subtitle:trip.subtitle||'',
    timezone:trip.timezone||'UTC',
    travelers:Number.isInteger(trip.travelers)&&trip.travelers>0?trip.travelers:1,
    start:trip.start,
    end:trip.end,
    days:(legacy.days||[]).map((day,di)=>({
      ...day,
      events:(day.events||[]).map((event,ei)=>({
        id:event.id||`d${di+1}-e${ei+1}`,
        ...event
      }))
    })),
    places:(legacy.places||[]).map(place=>({...place})),
    meta:{source:'legacy-trip-json',sourceVersion:trip.version||null}
  };
}

export function validateRoutePack(pack){
  const errors=[];
  const warnings=[];
  const err=(code,message,path='')=>errors.push({code,message,path});
  const warn=(code,message,path='')=>warnings.push({code,message,path});

  if(!pack||typeof pack!=='object')return {valid:false,errors:[{code:'PACK_TYPE',message:'RoutePack absent ou invalide',path:''}],warnings};
  if(pack.schemaVersion!=='1.0')err('SCHEMA_VERSION','schemaVersion doit valoir 1.0','schemaVersion');
  if(!/^[a-z0-9][a-z0-9-]{2,63}$/.test(pack.id||''))err('PACK_ID','id RoutePack invalide','id');
  if(!String(pack.title||'').trim())err('TITLE','title est obligatoire','title');
  if(!String(pack.timezone||'').trim())err('TIMEZONE','timezone est obligatoire','timezone');
  if(!Array.isArray(pack.days)||!pack.days.length)err('DAYS','au moins un jour est obligatoire','days');
  if(!Array.isArray(pack.places)||!pack.places.length)err('PLACES','au moins un lieu est obligatoire','places');

  const placeIds=new Set();
  for(const [i,p] of (pack.places||[]).entries()){
    const path=`places[${i}]`;
    if(!p?.id)err('PLACE_ID','id du lieu obligatoire',`${path}.id`);
    else if(placeIds.has(p.id))err('PLACE_ID_DUP','id de lieu dupliqué',`${path}.id`);
    else placeIds.add(p.id);
    if(!String(p?.name||'').trim())err('PLACE_NAME','nom du lieu obligatoire',`${path}.name`);
    if(!Number.isFinite(p?.lat)||p.lat<-90||p.lat>90)err('PLACE_LAT','latitude invalide',`${path}.lat`);
    if(!Number.isFinite(p?.lng)||p.lng<-180||p.lng>180)err('PLACE_LNG','longitude invalide',`${path}.lng`);
  }

  const eventIds=new Set();
  for(const [di,day] of (pack.days||[]).entries()){
    const dpath=`days[${di}]`;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day?.date||''))err('DAY_DATE','date de jour invalide',`${dpath}.date`);
    if(!Array.isArray(day?.events))err('EVENTS','events doit être un tableau',`${dpath}.events`);
    let previousEnd=-1;
    for(const [ei,event] of (day?.events||[]).entries()){
      const path=`${dpath}.events[${ei}]`;
      if(!event?.id)err('EVENT_ID','id étape obligatoire',`${path}.id`);
      else if(eventIds.has(event.id))err('EVENT_ID_DUP','id étape dupliqué',`${path}.id`);
      else eventIds.add(event.id);
      if(!String(event?.title||'').trim())err('EVENT_TITLE','titre étape obligatoire',`${path}.title`);
      const start=minutes(event?.time),end=minutes(event?.end);
      if(!Number.isFinite(start))err('EVENT_TIME','heure de début invalide',`${path}.time`);
      if(!Number.isFinite(end))err('EVENT_END','heure de fin invalide',`${path}.end`);
      if(Number.isFinite(start)&&Number.isFinite(end)&&end<=start)err('EVENT_RANGE','heure de fin doit être après le début',path);
      if(Number.isFinite(start)&&start<previousEnd)err('EVENT_OVERLAP','chevauchement détecté',path);
      if(Number.isFinite(end))previousEnd=Math.max(previousEnd,end);
      if(event?.placeId&&!placeIds.has(event.placeId))err('PLACE_REF','placeId référence un lieu inconnu',`${path}.placeId`);
      if(['bus','train','ferry','flight','avion','navette'].includes(String(event?.type||'').toLowerCase())&&!event.locked&&!event.fixed)warn('TRANSPORT_UNLOCKED','transport horaire non marqué fixed/locked',path);
    }
  }

  if(pack.start&&pack.end&&pack.start>pack.end)err('TRIP_RANGE','start est postérieur à end','start');
  return {valid:errors.length===0,errors,warnings};
}

export async function loadRoutePack(source,{fetchImpl=fetch,allowLegacy=true}={}){
  const raw=typeof source==='string'?await fetchImpl(source,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`RoutePack indisponible (${r.status})`);return r.json()}):source;
  const pack=raw?.schemaVersion?raw:(allowLegacy?legacyTripToRoutePack(raw):raw);
  const report=validateRoutePack(pack);
  if(!report.valid){
    const error=new Error(`RoutePack invalide: ${report.errors.map(e=>e.code).join(', ')}`);
    error.report=report;
    throw error;
  }
  return {pack,report};
}

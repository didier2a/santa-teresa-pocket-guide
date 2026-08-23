const LIBRARY_KEY='pg-route-library-v1';
const MAX_ROUTES=24;

function storageOrDefault(storage){return storage||globalThis.localStorage}
function readLibrary(storage=globalThis.localStorage){
  try{
    const value=JSON.parse(storageOrDefault(storage)?.getItem(LIBRARY_KEY)||'[]');
    return Array.isArray(value)?value:[];
  }catch{return[]}
}
function writeLibrary(items,storage=globalThis.localStorage){
  const target=storageOrDefault(storage);
  if(!target?.setItem)throw new Error('Stockage local indisponible.');
  const trimmed=[...items].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,MAX_ROUTES);
  try{target.setItem(LIBRARY_KEY,JSON.stringify(trimmed));return trimmed}
  catch{
    const reduced=trimmed.slice(0,Math.max(1,Math.floor(trimmed.length/2)));
    target.setItem(LIBRARY_KEY,JSON.stringify(reduced));
    return reduced;
  }
}
function clone(value){return JSON.parse(JSON.stringify(value))}

export function listSavedRoutes(storage=globalThis.localStorage){
  return readLibrary(storage).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).map(clone);
}

export function saveRoutePack(pack,{label='',source='pocketguide',storage=globalThis.localStorage}={}){
  if(!pack?.id||!pack?.title)throw new Error('RoutePack impossible à sauvegarder.');
  const now=new Date().toISOString();
  const items=readLibrary(storage);
  const existing=items.find(x=>x.id===pack.id);
  const entry={
    id:pack.id,
    label:String(label||existing?.label||pack.title).trim()||pack.title,
    title:pack.title,
    start:pack.start||pack.days?.[0]?.date||'',
    end:pack.end||pack.days?.at?.(-1)?.date||pack.days?.[pack.days.length-1]?.date||'',
    timezone:pack.timezone||'',
    places:Array.isArray(pack.places)?pack.places.length:0,
    days:Array.isArray(pack.days)?pack.days.length:0,
    heroImage:pack.places?.find?.(p=>p.heroImage)?.heroImage||'',
    source,
    savedAt:existing?.savedAt||now,
    updatedAt:now,
    pack:clone(pack)
  };
  const next=[entry,...items.filter(x=>x.id!==pack.id)];
  writeLibrary(next,storage);
  return clone(entry);
}

export function loadSavedRoute(id,storage=globalThis.localStorage){
  const entry=readLibrary(storage).find(x=>x.id===id);
  return entry?.pack?clone(entry.pack):null;
}

export function deleteSavedRoute(id,storage=globalThis.localStorage){
  const items=readLibrary(storage);
  const next=items.filter(x=>x.id!==id);
  writeLibrary(next,storage);
  return next.length!==items.length;
}

export function renameSavedRoute(id,label,storage=globalThis.localStorage){
  const items=readLibrary(storage);const entry=items.find(x=>x.id===id);
  if(!entry)return false;
  entry.label=String(label||'').trim()||entry.title;
  entry.updatedAt=new Date().toISOString();
  writeLibrary(items,storage);
  return true;
}

export function clearSavedRoutes(storage=globalThis.localStorage){
  storageOrDefault(storage)?.removeItem?.(LIBRARY_KEY);
}

export {LIBRARY_KEY};

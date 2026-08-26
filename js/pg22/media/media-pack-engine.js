const COMMONS_ENDPOINT='https://commons.wikimedia.org/w/api.php';
const OPEN_LICENSE=/^(CC|Public domain|PD|GFDL)/i;

function clean(value=''){return String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function https(value=''){const url=String(value||'');return /^https:\/\//.test(url)?url:'';}
function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
function metadataValue(meta,key){return clean(meta?.[key]?.value||'');}
function unique(values){return [...new Set(values.map(clean).filter(Boolean))];}

export function mediaSearchQueries(place={},context={}){
  const name=clean(place.name||place.title),locality=clean(place.locality||place.city||place.destination),destination=clean(context.destination||context.title?.split(/[—:|]/)[0]),source=clean(place.sourceLabel);
  return unique([[name,locality||destination].filter(Boolean).join(' '),[name,source,destination].filter(Boolean).join(' '),name]).slice(0,3);
}

export function mediaRecord(page,place,{now=()=>new Date().toISOString()}={}){
  const info=page?.imageinfo?.[0],meta=info?.extmetadata||{},license=metadataValue(meta,'LicenseShortName')||metadataValue(meta,'UsageTerms'),sourceUrl=https(info?.descriptionurl),url=https(info?.thumburl||info?.url);
  if(!url||!sourceUrl||!OPEN_LICENSE.test(license))return null;
  const author=metadataValue(meta,'Artist')||metadataValue(meta,'Credit')||'Contributeur Wikimedia Commons',title=clean(page?.title||place?.name||'Image');
  return {id:`wm-${Number(page?.pageid)||Math.abs(title.length*7919)}`,placeId:place.id,url,thumbnailUrl:https(info?.thumburl)||url,source:'Wikimedia Commons',sourceUrl,author,license,licenseUrl:https(meta?.LicenseUrl?.value),attribution:`${author} · ${license} · Wikimedia Commons`,alt:`Vue de ${place.name||title}`,confidence:0.82,kind:'photo',cachePolicy:'open-license-local',verifiedAt:now()};
}

export class MediaPackEngine{
  constructor({fetchImpl=globalThis.fetch,endpoint=COMMONS_ENDPOINT}={}){this.fetchImpl=fetchImpl;this.endpoint=endpoint;}
  async findForPlace(place,{signal,context={}}={}){
    if(typeof this.fetchImpl!=='function')return null;let lastError=null;
    for(const query of mediaSearchQueries(place,context)){
      const params=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrwhat:'text',gsrnamespace:'6',gsrlimit:'8',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1280',format:'json',origin:'*'});
      try{const response=await this.fetchImpl(`${this.endpoint}?${params}`,{signal,headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Wikimedia ${response.status}`);const payload=await response.json(),pages=Object.values(payload?.query?.pages||{}),record=pages.map(page=>mediaRecord(page,place)).find(Boolean);if(record)return{...record,query};}catch(error){if(error?.name==='AbortError')throw error;lastError=error;}
    }
    if(lastError)throw lastError;return null;
  }
  async enrich(pack,{signal,onProgress}={}){
    const output=clone(pack),places=output.places||[],items=[],failures=[];
    for(let index=0;index<places.length;index+=1){
      if(signal?.aborted)throw new DOMException('Préparation annulée','AbortError');const place=places[index];let media=null;
      try{media=await this.findForPlace(place,{signal,context:{title:output.title,destination:output.destination||output.meta?.destination||output.meta?.locality}});}catch(error){if(error?.name==='AbortError')throw error;failures.push({placeId:place.id,message:String(error?.message||error)});}
      if(media){items.push(media);place.heroImage=media.url;place.media=[media,...(place.media||[]).filter(item=>item?.url!==media.url)];place.imageAttribution={source:media.source,author:media.author,license:media.license,descriptionUrl:media.sourceUrl};}
      onProgress?.({index:index+1,total:places.length,place,media,status:media?'verified':failures.some(item=>item.placeId===place.id)?'failed':'unavailable',items:[...items],failures:[...failures],pack:output});
    }
    output.mediaPack={schemaVersion:'1.0',status:items.length===places.length?'complete':items.length?'partial':'empty',providerOrder:['wikimedia-commons','official-tourism','google-online-only'],generatedAt:new Date().toISOString(),items,failures};
    return {pack:output,mediaPack:output.mediaPack};
  }
}

export const mediaPackEngine=new MediaPackEngine();
export {COMMONS_ENDPOINT,OPEN_LICENSE};

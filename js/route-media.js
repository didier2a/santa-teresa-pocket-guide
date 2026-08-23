const COMMONS_API='https://commons.wikimedia.org/w/api.php';
const MAX_IMAGES_PER_PLACE=3;

function text(value=''){return String(value||'').trim()}
function htmlToText(value=''){
  const raw=String(value||'');
  if(typeof document!=='undefined'){
    const el=document.createElement('div');el.innerHTML=raw;return text(el.textContent||el.innerText||'');
  }
  return text(raw.replace(/<[^>]+>/g,' '));
}
function mediaFromPage(page){
  const info=page?.imageinfo?.[0];if(!info)return null;
  const meta=info.extmetadata||{};
  const imageUrl=info.thumburl||info.url||'';
  if(!imageUrl)return null;
  const title=text(page.title).replace(/^File:/i,'');
  if(/\.(svg|pdf|djvu)$/i.test(title))return null;
  return {
    url:imageUrl,
    originalUrl:info.url||imageUrl,
    descriptionUrl:info.descriptionurl||'',
    title,
    author:htmlToText(meta.Artist?.value||''),
    license:text(meta.LicenseShortName?.value||meta.UsageTerms?.value||''),
    credit:htmlToText(meta.Credit?.value||''),
    source:'Wikimedia Commons'
  };
}

export async function findCommonsImages(query,{limit=MAX_IMAGES_PER_PLACE,fetchImpl=fetch}={}){
  const q=text(query);if(!q)return[];
  const url=new URL(COMMONS_API);
  const params={action:'query',format:'json',origin:'*',generator:'search',gsrnamespace:'6',gsrsearch:`${q} filetype:bitmap`,gsrlimit:String(Math.max(1,Math.min(8,limit*2))),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1200'};
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const response=await fetchImpl(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`Wikimedia ${response.status}`);
  const payload=await response.json();
  return Object.values(payload?.query?.pages||{}).map(mediaFromPage).filter(Boolean).slice(0,limit);
}

export async function enrichPlaceMedia(place,{destination='',fetchImpl=fetch}={}){
  const current=Array.isArray(place?.media)?place.media.filter(x=>x?.url):[];
  if(current.length&&place.heroImage)return {...place,media:current};
  const queries=[
    [place?.name,destination].filter(Boolean).join(' '),
    place?.name
  ].filter(Boolean);
  let media=[];
  for(const query of queries){
    try{media=await findCommonsImages(query,{fetchImpl});if(media.length)break}catch{}
  }
  if(!media.length)return {...place,media:current};
  return {
    ...place,
    heroImage:place.heroImage||media[0].url,
    media,
    photoExact:true,
    photoLabel:'Wikimedia Commons',
    imageAttribution:{source:media[0].source,author:media[0].author,license:media[0].license,descriptionUrl:media[0].descriptionUrl}
  };
}

export async function enrichRoutePackMedia(pack,{destination='',fetchImpl=fetch,onProgress}={}){
  const places=Array.isArray(pack?.places)?pack.places:[];
  const enriched=[];
  for(let i=0;i<places.length;i++){
    const place=await enrichPlaceMedia(places[i],{destination:destination||pack.title,fetchImpl});
    enriched.push(place);
    onProgress?.({index:i+1,total:places.length,place});
  }
  return {
    ...pack,
    places:enriched,
    meta:{...(pack.meta||{}),mediaEnrichedAt:new Date().toISOString(),mediaProvider:'Wikimedia Commons'}
  };
}

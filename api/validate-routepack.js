import {cors} from './_util.js';
import {validateRoutePack} from '../engine/routepack.js';
import {lookup} from 'node:dns/promises';
import net from 'node:net';

const MAX_SOURCE_BYTES=131072;
const SOURCE_TIMEOUT_MS=6500;

function normalize(value=''){
  return String(value).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
}
function significantTokens(value=''){
  return normalize(value).split(/\s+/).filter(x=>x.length>=3);
}
function ipv4Private(ip){
  const p=ip.split('.').map(Number);if(p.length!==4||p.some(x=>!Number.isInteger(x)))return true;
  return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]>=224);
}
function ipv6Private(ip){const x=ip.toLowerCase();return x==='::1'||x==='::'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe8')||x.startsWith('fe9')||x.startsWith('fea')||x.startsWith('feb')||x.startsWith('ff');}
function publicIp(ip){const family=net.isIP(ip);return family===4?!ipv4Private(ip):family===6?!ipv6Private(ip):false;}
async function resolvePublicHost(hostname){
  try{const answers=await lookup(hostname,{all:true,verbatim:true});return answers.length>0&&answers.every(a=>publicIp(a.address))}
  catch{return false}
}
async function isPublicHttpsUrl(value){
  try{
    const u=new URL(value);
    if(u.protocol!=='https:')return {ok:false,reason:'SOURCE_HTTPS'};
    const h=u.hostname.toLowerCase();
    if(!h||h==='localhost'||h.endsWith('.local')||h.endsWith('.internal'))return {ok:false,reason:'SOURCE_HOST'};
    if(net.isIP(h))return {ok:publicIp(h),reason:'SOURCE_IP_LITERAL',url:u};
    if(!(await resolvePublicHost(h)))return {ok:false,reason:'SOURCE_PRIVATE_DNS'};
    return {ok:true,url:u};
  }catch{return {ok:false,reason:'SOURCE_URL'};}
}
function haversine(a,b){
  const R=6371,toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);
  const q=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}
async function readLimited(response){
  if(!response.body)return'';
  const reader=response.body.getReader();let total=0;const chunks=[];
  try{while(total<MAX_SOURCE_BYTES){const {done,value}=await reader.read();if(done)break;const take=value.slice(0,Math.max(0,MAX_SOURCE_BYTES-total));chunks.push(take);total+=take.length;if(total>=MAX_SOURCE_BYTES)break}}
  finally{try{await reader.cancel()}catch{}}
  let length=0;for(const c of chunks)length+=c.length;const all=new Uint8Array(length);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length}
  return new TextDecoder('utf-8',{fatal:false}).decode(all);
}
async function verifySource(place,index){
  const base={index,id:place?.id||'',name:place?.name||'',sourceLabel:String(place?.sourceLabel||''),sourceUrl:String(place?.sourceUrl||''),reachable:false,httpStatus:null,finalUrl:'',mentionsName:false,blocking:[],warnings:[]};
  if(!base.sourceLabel.trim())base.blocking.push('SOURCE_LABEL_MISSING');
  const parsed=await isPublicHttpsUrl(base.sourceUrl);if(!parsed.ok){base.blocking.push(parsed.reason);return base}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),SOURCE_TIMEOUT_MS);
  try{
    const response=await fetch(parsed.url,{method:'GET',redirect:'manual',signal:controller.signal,headers:{'User-Agent':'PocketGuide-Deterministic-Validator/1.4.7','Accept':'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.2'}});
    base.httpStatus=response.status;base.finalUrl=base.sourceUrl;
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location){base.blocking.push('SOURCE_REDIRECT');return base}const redirected=new URL(location,parsed.url);const allowed=await isPublicHttpsUrl(redirected.toString());if(!allowed.ok){base.blocking.push('SOURCE_REDIRECT_PRIVATE');return base}base.warnings.push('SOURCE_REDIRECT');base.finalUrl=redirected.toString();base.reachable=true;return base}
    base.reachable=response.status>=200&&response.status<300;if(!base.reachable){base.blocking.push('SOURCE_HTTP');return base}
    const text=normalize(await readLimited(response));const tokens=significantTokens(place?.name||'');const hits=tokens.filter(t=>text.includes(t));base.mentionsName=tokens.length?hits.length>=Math.max(1,Math.ceil(tokens.length/2)):false;if(!base.mentionsName)base.warnings.push('SOURCE_NAME_NOT_FOUND');
  }catch(error){base.blocking.push(error?.name==='AbortError'?'SOURCE_TIMEOUT':'SOURCE_FETCH')}
  finally{clearTimeout(timer)}
  return base;
}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;async function worker(){while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out}
function deterministicPackChecks(pack){
  const blocking=[],warnings=[];const dayDates=(pack.days||[]).map(d=>d.date).filter(Boolean);
  if(dayDates.length){if(pack.start!==dayDates[0])blocking.push({code:'START_DAY_MISMATCH',path:'start',message:'start doit correspondre au premier jour'});if(pack.end!==dayDates.at(-1))blocking.push({code:'END_DAY_MISMATCH',path:'end',message:'end doit correspondre au dernier jour'});for(let i=1;i<dayDates.length;i++)if(dayDates[i]<=dayDates[i-1])blocking.push({code:'DAY_ORDER',path:`days[${i}].date`,message:'les jours doivent être strictement croissants'})}
  const byId=new Map((pack.places||[]).map(p=>[p.id,p]));const used=new Set();
  for(const [di,day] of (pack.days||[]).entries()){let previous=null;for(const [ei,event] of (day.events||[]).entries()){if(!event.placeId)blocking.push({code:'EVENT_PLACE_REQUIRED',path:`days[${di}].events[${ei}].placeId`,message:'chaque étape AI doit référencer un lieu'});const place=byId.get(event.placeId);if(place)used.add(place.id);if(previous&&place){const distance=haversine(previous.place,place);if(distance>120)warnings.push({code:'GEOGRAPHIC_JUMP',path:`days[${di}].events[${ei}]`,message:`saut géographique de ${distance.toFixed(1)} km entre deux étapes`});if(String(event.navigationMode||'').toLowerCase()==='walking'&&distance>10)blocking.push({code:'WALKING_DISTANCE',path:`days[${di}].events[${ei}].navigationMode`,message:`segment pédestre déclaré de ${distance.toFixed(1)} km`})}if(place)previous={place,event}}}
  for(const [i,p] of (pack.places||[]).entries())if(!used.has(p.id))warnings.push({code:'UNUSED_PLACE',path:`places[${i}]`,message:'lieu découvert mais non utilisé dans le programme'});
  const seen=new Map();for(const [i,p] of (pack.places||[]).entries()){const u=String(p.sourceUrl||'');if(!u)continue;if(seen.has(u))warnings.push({code:'SOURCE_REUSED',path:`places[${i}].sourceUrl`,message:`même source que places[${seen.get(u)}]`});else seen.set(u,i)}
  return {blocking,warnings};
}
export default async function handler(req,res){
  cors(req,res);if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return res.status(405).json({error:'Méthode non autorisée'});
  const origin=String(req.headers.origin||'');let host='';try{host=new URL(origin||'https://invalid.local').hostname}catch{}if(origin&&origin!=='https://didier2a.github.io'&&!/\.vercel\.app$/i.test(host))return res.status(403).json({error:'Origine non autorisée'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};const pack=body.pack;const structural=validateRoutePack(pack);const deterministic=pack&&typeof pack==='object'?deterministicPackChecks(pack):{blocking:[],warnings:[]};const sources=pack&&Array.isArray(pack.places)?await mapLimit(pack.places,3,verifySource):[];
    const sourceBlocking=sources.flatMap(s=>s.blocking.map(code=>({code,path:`places[${s.index}].sourceUrl`,message:`${s.name||s.id}: ${code}`})));const sourceWarnings=sources.flatMap(s=>s.warnings.map(code=>({code,path:`places[${s.index}].sourceUrl`,message:`${s.name||s.id}: ${code}`})));const blocking=[...structural.errors,...deterministic.blocking,...sourceBlocking];const warnings=[...structural.warnings,...deterministic.warnings,...sourceWarnings];const valid=blocking.length===0&&sources.length>0&&sources.every(s=>s.reachable&&s.blocking.length===0);
    return res.status(200).json({validatorVersion:'1.4.7',deterministic:true,valid,packId:pack?.id||'',checkedAt:new Date().toISOString(),summary:{blocking:blocking.length,warnings:warnings.length,sources:sources.length,sourcesReachable:sources.filter(s=>s.reachable).length},blocking,warnings,sources});
  }catch(error){return res.status(400).json({error:error?.message||'RoutePack impossible à valider'})}
}

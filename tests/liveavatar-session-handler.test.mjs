import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{POCKETGUIDE_AVATAR_ID,OPENAI_SECRET_NAME,POCKETGUIDE_CONTEXT_NAME} from '../api/liveavatar-session.js';

function responseRecorder(){
  return{
    statusCode:200,headers:{},body:null,
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return this;},
    end(){return this;}
  };
}

const request={method:'POST',headers:{origin:'https://pocketguide-v2.infoserv2a.workers.dev'}};

async function withRealtimeEnv(run){
  const names=['LIVEAVATAR_API_KEY','HEYGEN_API_KEY','HEYGEN_AVATAR_ID','OPENAI_API_KEY','LIVEAVATAR_OPENAI_SECRET_ID','LIVEAVATAR_CONTEXT_ID','LIVEAVATAR_OPENAI_MODEL'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  process.env.LIVEAVATAR_API_KEY='test-liveavatar-key';process.env.OPENAI_API_KEY='test-openai-key';delete process.env.HEYGEN_API_KEY;delete process.env.HEYGEN_AVATAR_ID;delete process.env.LIVEAVATAR_OPENAI_SECRET_ID;delete process.env.LIVEAVATAR_CONTEXT_ID;delete process.env.LIVEAVATAR_OPENAI_MODEL;
  try{return await run();}finally{for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
}

test('la première session enregistre la clé OpenAI côté LiveAvatar puis crée un jeton LITE marin',async()=>withRealtimeEnv(async()=>{
  const previousFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options={})=>{
    const call={url:String(url),options};calls.push(call);const method=options.method||'GET';
    if(call.url==='https://api.liveavatar.com/v1/secrets'&&method==='GET')return{ok:true,status:200,json:async()=>({data:[]})};
    if(call.url==='https://api.liveavatar.com/v1/secrets'&&method==='POST')return{ok:true,status:200,json:async()=>({data:{id:'secret-id',secret_name:OPENAI_SECRET_NAME}})};
    if(call.url.includes('/v1/contexts?')&&method==='GET')return{ok:true,status:200,json:async()=>({data:{results:[]}})};
    if(call.url==='https://api.liveavatar.com/v1/contexts'&&method==='POST')return{ok:true,status:200,json:async()=>({data:{id:'context-id',name:POCKETGUIDE_CONTEXT_NAME}})};
    if(call.url.endsWith('/v1/sessions/token')&&method==='POST')return{ok:true,status:200,json:async()=>({data:{session_id:'session-id',session_token:'session-token'}})};
    throw new Error(`appel inattendu ${method} ${call.url}`);
  };
  try{
    const res=responseRecorder();await handler(request,res);assert.equal(res.statusCode,200);assert.equal(res.headers['Access-Control-Allow-Origin'],request.headers.origin);assert.equal(res.body.sessionToken,'session-token');assert.equal(res.body.connector,'OPENAI_REALTIME');assert.equal(res.body.voice,'marin');
    const secretCall=calls.find(call=>call.url.endsWith('/v1/secrets')&&call.options.method==='POST'),secretBody=JSON.parse(secretCall.options.body);assert.deepEqual(secretBody,{secret_name:OPENAI_SECRET_NAME,secret_type:'OPENAI_API_KEY',secret_value:'test-openai-key'});assert.equal(secretCall.options.headers['X-API-KEY'],'test-liveavatar-key');
    const tokenCall=calls.find(call=>call.url.endsWith('/v1/sessions/token')),tokenBody=JSON.parse(tokenCall.options.body);assert.equal(tokenBody.mode,'LITE');assert.equal(tokenBody.avatar_id,POCKETGUIDE_AVATAR_ID);assert.equal(tokenBody.is_sandbox,false);assert.deepEqual(tokenBody.video_settings,{quality:'high',encoding:'H264'});assert.deepEqual(tokenBody.openai_realtime_config,{secret_id:'secret-id',context_id:'context-id',voice:'marin',model:'gpt-realtime',temperature:0.8});
    assert.doesNotMatch(JSON.stringify(res.body),/test-openai-key|test-liveavatar-key|secret-id|context-id/);
  }finally{globalThis.fetch=previousFetch;}
}));

test('les métadonnées existantes sont réutilisées sans retransmettre la clé OpenAI',async()=>withRealtimeEnv(async()=>{
  const previousFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options={})=>{
    const call={url:String(url),options};calls.push(call);
    if(call.url.endsWith('/v1/secrets'))return{ok:true,status:200,json:async()=>({data:[{id:'existing-secret',secret_name:OPENAI_SECRET_NAME,secret_type:'OPENAI_API_KEY'}]})};
    if(call.url.includes('/v1/contexts?'))return{ok:true,status:200,json:async()=>({data:{results:[{id:'existing-context',name:POCKETGUIDE_CONTEXT_NAME}]}})};
    if(call.url.endsWith('/v1/sessions/token'))return{ok:true,status:200,json:async()=>({data:{session_id:'session-id',session_token:'session-token'}})};
    throw new Error(`appel inattendu ${call.url}`);
  };
  try{const res=responseRecorder();await handler(request,res);assert.equal(res.statusCode,200);assert.equal(calls.length,3);assert.doesNotMatch(calls.map(call=>String(call.options.body||'')).join('\n'),/test-openai-key/);}finally{globalThis.fetch=previousFetch;}
}));

test('une origine extérieure est refusée avant toute transmission de secret',async()=>withRealtimeEnv(async()=>{
  const previousFetch=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;throw new Error('ne doit pas être appelé');};
  try{const res=responseRecorder();await handler({method:'POST',headers:{origin:'https://example.com'}},res);assert.equal(res.statusCode,403);assert.equal(called,false);}finally{globalThis.fetch=previousFetch;}
}));

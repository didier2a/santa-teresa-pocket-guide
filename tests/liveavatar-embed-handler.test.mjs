import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{POCKETGUIDE_AVATAR_ID} from '../api/liveavatar-embed.js';

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

async function withLiveAvatarEnv(run){
  const names=['LIVEAVATAR_API_KEY','HEYGEN_API_KEY','HEYGEN_AVATAR_ID','HEYGEN_LIVEAVATAR_SANDBOX','LIVEAVATAR_VOICE_ID','LIVEAVATAR_CONTEXT_ID'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  process.env.LIVEAVATAR_API_KEY='test-only-key';delete process.env.HEYGEN_API_KEY;delete process.env.HEYGEN_AVATAR_ID;process.env.HEYGEN_LIVEAVATAR_SANDBOX='true';delete process.env.LIVEAVATAR_VOICE_ID;delete process.env.LIVEAVATAR_CONTEXT_ID;
  try{return await run();}finally{for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
}

test('Embedded vérifie l’avatar ACTIVE puis crée un portrait vertical français',async()=>withLiveAvatarEnv(async()=>{
  const previousFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(calls.length===1)return{ok:true,status:200,json:async()=>({data:{id:POCKETGUIDE_AVATAR_ID,name:'Pocket Guide',status:'ACTIVE',is_expired:false,default_voice:{id:'voice-fr'}}})};
    return{ok:true,status:200,json:async()=>({data:{embed_id:'embed-id',url:'https://embed.liveavatar.com/test-pocket-guide',orientation:'vertical'}})};
  };
  try{
    const res=responseRecorder();await handler(request,res);
    assert.equal(res.statusCode,200);assert.equal(res.headers['Access-Control-Allow-Origin'],request.headers.origin);assert.equal(res.body.url,'https://embed.liveavatar.com/test-pocket-guide');assert.equal(res.body.orientation,'vertical');assert.equal(res.body.sandbox,true);
    assert.equal(calls.length,2);assert.equal(calls[0].url,`https://api.liveavatar.com/v1/avatars/${POCKETGUIDE_AVATAR_ID}`);assert.equal(calls[0].options.headers['X-API-KEY'],'test-only-key');
    const body=JSON.parse(calls[1].options.body);assert.deepEqual(body,{avatar_id:POCKETGUIDE_AVATAR_ID,type:'DEFAULT',max_session_duration:300,default_language:'fr',is_sandbox:true,orientation:'vertical',voice_id:'voice-fr'});assert.equal(calls[1].options.headers['X-API-KEY'],'test-only-key');assert.doesNotMatch(JSON.stringify(res.body),/test-only-key|voice-fr/);
  }finally{globalThis.fetch=previousFetch;}
}));

test('Embedded refuse un avatar qui n’est pas encore ACTIVE',async()=>withLiveAvatarEnv(async()=>{
  const previousFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls+=1;return{ok:true,status:200,json:async()=>({data:{id:POCKETGUIDE_AVATAR_ID,name:'Pocket Guide',status:'DEPLOYING',is_expired:false}})}};
  try{const res=responseRecorder();await handler(request,res);assert.equal(res.statusCode,409);assert.equal(res.body.error,'Identité LiveAvatar pas encore active');assert.equal(calls,1);}finally{globalThis.fetch=previousFetch;}
}));

test('Embedded refuse une origine extérieure avant tout appel fournisseur',async()=>withLiveAvatarEnv(async()=>{
  const previousFetch=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;throw new Error('ne doit pas être appelé');};
  try{const res=responseRecorder();await handler({method:'POST',headers:{origin:'https://example.com'}},res);assert.equal(res.statusCode,403);assert.equal(called,false);}finally{globalThis.fetch=previousFetch;}
}));

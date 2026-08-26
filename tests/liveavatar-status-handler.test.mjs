import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/liveavatar-status.js';

function responseRecorder(){
  return {
    statusCode:200,
    headers:{},
    body:null,
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return this;},
    end(){return this;}
  };
}

const request={method:'POST',headers:{origin:'https://didier2a.github.io'}};

test('diagnostic: une clé valide et un PocketGuide ACTIVE donnent ready',async()=>{
  const previousKey=process.env.LIVEAVATAR_API_KEY;
  const previousFetch=globalThis.fetch;
  process.env.LIVEAVATAR_API_KEY='test-only';
  globalThis.fetch=async()=>({
    ok:true,
    status:200,
    json:async()=>({data:{count:2,results:[
      {id:'secret-id',name:'PocketGuide V2.4',type:'IMAGE',status:'ACTIVE',is_expired:false,preview_url:'secret-preview'},
      {id:'other-id',name:'Autre',type:'VIDEO',status:'DEPLOYING',is_expired:false}
    ]}})
  });
  try{
    const res=responseRecorder();
    await handler(request,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.authenticated,true);
    assert.equal(res.body.customAvatarCount,2);
    assert.deepEqual(res.body.statusCounts,{ACTIVE:1,INIT:0,DEPLOYING:1,FAILED:0,OTHER:0});
    assert.deepEqual(res.body.pocketGuide,{found:true,ready:true,activeCount:1,failed:false});
    assert.doesNotMatch(JSON.stringify(res.body),/secret-id|secret-preview/);
  }finally{
    globalThis.fetch=previousFetch;
    if(previousKey===undefined)delete process.env.LIVEAVATAR_API_KEY;
    else process.env.LIVEAVATAR_API_KEY=previousKey;
  }
});

test('diagnostic: une clé refusée est signalée sans message fournisseur',async()=>{
  const previousKey=process.env.LIVEAVATAR_API_KEY;
  const previousFetch=globalThis.fetch;
  process.env.LIVEAVATAR_API_KEY='test-only';
  globalThis.fetch=async()=>({
    ok:false,
    status:403,
    json:async()=>({message:'provider secret detail'})
  });
  try{
    const res=responseRecorder();
    await handler(request,res);
    assert.equal(res.statusCode,502);
    assert.equal(res.body.authenticated,false);
    assert.equal(res.body.providerStatus,403);
    assert.doesNotMatch(JSON.stringify(res.body),/provider secret detail/);
  }finally{
    globalThis.fetch=previousFetch;
    if(previousKey===undefined)delete process.env.LIVEAVATAR_API_KEY;
    else process.env.LIVEAVATAR_API_KEY=previousKey;
  }
});

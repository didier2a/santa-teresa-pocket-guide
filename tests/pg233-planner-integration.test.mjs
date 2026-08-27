import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PlannerClient,usesSameOriginPlanner} from '../js/pg16/planner/planner-client.js';

const pack=JSON.parse(await readFile(new URL('../data/routepacks/bonifacio-demo.json',import.meta.url),'utf8'));
const response=(status,payload)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});

test('la production et les aperçus Vercel utilisent le Planner même origine',()=>{
  assert.equal(usesSameOriginPlanner({hostname:'santa-teresa-pocket-guide.vercel.app'}),true);
  assert.equal(usesSameOriginPlanner({hostname:'santa-teresa-pocket-guide-git-fix.vercel.app'}),true);
  assert.equal(usesSameOriginPlanner({hostname:'didier2a.github.io'}),false);
});

test('la 2.3.3 démarre puis attend réellement le Planner Vercel',async()=>{
  const calls=[];let statusCalls=0;
  const client=new PlannerClient({locationLike:{hostname:'santa-teresa-pocket-guide.vercel.app'},waitImpl:async()=>{},fetchImpl:async(url,options={})=>{
    calls.push({url,options});
    if(url==='./data/v2-config.json')return response(200,{apiBase:'https://pocketguide-v2.infoserv2a.workers.dev',plannerModel:'fallback'});
    if(url==='/api/plan')return response(202,{taskId:'resp_pg233planner01',model:'gpt-test'});
    if(String(url).startsWith('/api/plan-status'))return ++statusCalls===1?response(202,{status:'in_progress'}):response(200,{status:'completed',pack,model:'gpt-test'});
    throw new Error(`URL inattendue ${url}`);
  }});
  const result=await client.plan({prompt:'Prépare une promenade à Bonifacio',destination:'Bonifacio'});
  assert.equal(result.transport,'vercel-background');assert.equal(result.pack.id,pack.id);assert.equal(result.report.valid,true);assert.equal(statusCalls,2);
  assert.ok(calls.some(call=>call.url==='/api/plan'));assert.ok(calls.some(call=>String(call.url).startsWith('/api/plan-status?id=resp_pg233planner01')));
  assert.equal(calls.some(call=>String(call.url).includes('workers.dev/v1/plan')),false);
});

test('GitHub Pages conserve le Worker comme repli explicite',async()=>{
  const calls=[];const client=new PlannerClient({locationLike:{hostname:'didier2a.github.io'},fetchImpl:async(url,options={})=>{
    calls.push({url,options});if(url==='./data/v2-config.json')return response(200,{apiBase:'https://pocketguide-v2.infoserv2a.workers.dev'});return response(200,{pack,plannerModel:'worker-test',verificationSources:[]});
  }});
  const result=await client.plan({prompt:'Prépare une promenade à Bonifacio'});
  assert.equal(result.transport,'worker');assert.equal(calls.at(-1).url,'https://pocketguide-v2.infoserv2a.workers.dev/v1/plan');
});

test('une réponse Vercel invalide est refusée avant toute proposition',async()=>{
  const client=new PlannerClient({locationLike:{hostname:'preview.vercel.app'},waitImpl:async()=>{},fetchImpl:async url=>{
    if(url==='./data/v2-config.json')return response(200,{});if(url==='/api/plan')return response(202,{taskId:'resp_pg233planner02'});return response(200,{status:'completed',pack:{id:'incomplet'}});
  }});
  await assert.rejects(()=>client.plan({prompt:'Prépare une promenade vérifiée'}),/RoutePack Planner rejeté/);
});

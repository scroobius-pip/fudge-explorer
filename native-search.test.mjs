import assert from "node:assert/strict";
import test from "node:test";
import worker from "./worker.js";

const intent = {version:1,filter:{all:[{kind:"term",id:"interaction.overlay_state.modal_open"}]},ranking:{kind:"text",query:"pricing"},pageSize:100};
const item = {captureId:4731,distance:.2,title:"Pricing",origin:"https://example.com",path:"/pricing",imageWidth:1440,imageHeight:900};
const page = {version:1,observedGeneration:77,total:1,unrankedTotal:0,items:[item],nextCursor:null};
const request = (body=intent,headers={}) => new Request("https://proxy.test/v1/search",{
  method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body),
});
const env = fetch => ({FUDGE_SERVICE:{fetch},SEMANTIC_TEXT_RATE_LIMITER:{limit:async()=>({success:true})}});

test("forwards full bounded intent without account credentials or capture membership",async()=>{
  let forwarded;
  const response = await worker.fetch(request(intent,{authorization:"Bearer private",cookie:"account=private"}),env(async req=>{
    forwarded={url:req.url,headers:[...req.headers.keys()],body:await req.json()};return Response.json(page);
  }));
  assert.equal(response.status,200);
  assert.equal(forwarded.url,"https://fudge.internal/v1/internal/corpus/search");
  assert.deepEqual(forwarded.body,intent);
  assert.deepEqual(forwarded.headers.sort(),["accept","content-type"]);
  assert.deepEqual(await response.json(),page);
  assert.equal(response.headers.get("cache-control"),"no-store");
});

test("keeps native total and unknown similarity coverage, including successful zero",async()=>{
  for(const value of [{...page,total:0,items:[]},{...page,unrankedTotal:1,items:[{...item,distance:null}]}]){
    const response=await worker.fetch(request(),env(async()=>Response.json(value)));
    assert.equal(response.status,200);assert.deepEqual(await response.json(),value);
  }
});

test("transports cursor and generation without evaluating filters",async()=>{
  const next={...intent,cursor:"cXVlcnk",generation:77};let body;
  const response=await worker.fetch(request(next),env(async r=>{body=await r.json();return Response.json(page);}));
  assert.equal(response.status,200);assert.deepEqual(body,next);
});

test("rejects raw source, candidate sets, and oversized envelopes before service execution",async()=>{
  let calls=0;
  for(const value of [{...intent,script:"?[x] <- [[1]]"},{...intent,captureIds:[4731]},{...intent,scope:{captureIds:[4731],generation:77}}, {...intent,ranking:{kind:"text",query:"x".repeat(33000)}}]){
    const response=await worker.fetch(request(value),env(async()=>{calls++;return Response.json(page);}));
    assert([400,413].includes(response.status));
  }
  assert.equal(calls,0);
});

test("preserves conflicts, unsupported conditions and native execution budgets",async()=>{
  for(const [status,code] of [[409,"corpus_generation_changed"],[400,"unknown_search_filter"],[504,"corpus_search_timeout"]]){
    const response=await worker.fetch(request(),env(async()=>Response.json({code},{status})));
    assert.equal(response.status,status);assert.deepEqual(await response.json(),{error:code});
  }
});

test("rejects malformed or partial pages rather than presenting an empty result",async()=>{
  for(const value of [{...page,truncated:true},{...page,items:[item,item]}, {...page,unrankedTotal:2}, {...page,items:[{...item,distance:"near"}]}, {...page,total:101}, {...page,observedGeneration:0}]){
    const response=await worker.fetch(request(),env(async()=>Response.json(value)));
    assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:"invalid_search_response"});
  }
});

test("retains rate limit and method boundaries",async()=>{
  let calls=0;const bindings=env(async()=>{calls++;return Response.json(page);});
  bindings.SEMANTIC_TEXT_RATE_LIMITER.limit=async()=>({success:false});
  assert.equal((await worker.fetch(request(),bindings)).status,429);
  assert.equal((await worker.fetch(new Request("https://proxy.test/v1/search"),bindings)).status,405);
  assert.equal(calls,0);
});

test("cancels an oversized streamed search body before calling the corpus", async () => {
  let calls = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(16 * 1024)); },
    cancel() { cancelled = true; },
  });
  const response = await worker.fetch(new Request("https://proxy.test/v1/search", {
    method: "POST", headers: { "content-type": "application/json", "content-length": "1" },
    body: stream, duplex: "half",
  }), env(async () => { calls++; return Response.json(page); }));
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});

test("loads an exact focus descriptor under the requested native generation",async()=>{
  let query;
  const response=await worker.fetch(new Request("https://proxy.test/v1/capture?captureId=4731&generation=77"),env(async req=>{
    query=await req.json();return Response.json({observedGeneration:77,truncated:false,result:{headers:["capture_id","title","origin","path","image_width","image_height"],rows:[[4731,item.title,item.origin,item.path,1440,900]]}});
  }));
  assert.equal(response.status,200);assert.equal(query.expectedGeneration,77);assert.deepEqual(query.parameters,{capture_id:4731});
  assert.deepEqual(await response.json(),{observedGeneration:77,capture:{...item,distance:null}});
});

test("focus descriptor never substitutes a different capture or ignores generation failures",async()=>{
  const conflict=await worker.fetch(new Request("https://proxy.test/v1/capture?captureId=4731&generation=77"),env(async()=>Response.json({code:"corpus_generation_changed"},{status:409})));
  assert.equal(conflict.status,409);
  assert.equal((await worker.fetch(new Request("https://proxy.test/v1/capture?captureId=4731"),env(async()=>{throw Error();}))).status,400);
});

test('scoped suggestions transport complete native scope and reject malformed groups',async()=>{
 const intent={version:1,filter:{all:[{kind:'motion'},{kind:'domain',origin:'https://inside.test'}]},query:'pricing',generation:77};
 const request=body=>new Request('https://proxy.test/v1/suggestions',{method:'POST',headers:{'content-type':'application/json',cookie:'private',authorization:'Bearer private'},body:JSON.stringify(body)});
 const result={version:1,observedGeneration:77,captures:[{captureId:150,title:'Pricing',origin:'https://inside.test',path:'/pricing'}],terms:[{id:'page.pricing',facetId:'page_role',label:'Pricing',count:12}],fonts:[],domains:[]};
 let forwarded;
 const response=await worker.fetch(request(intent),env(async r=>{forwarded={url:r.url,headers:[...r.headers.keys()],body:await r.json()};return Response.json(result);}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),result);assert.equal(forwarded.url,'https://fudge.internal/v1/internal/corpus/suggestions');assert.deepEqual(forwarded.body,intent);assert.deepEqual(forwarded.headers.sort(),['accept','content-type']);
 let calls=0;assert.equal((await worker.fetch(request({...intent,captureIds:[1]}),env(async()=>{calls++;return Response.json({});}))).status,400);assert.equal(calls,0);
 for(const [status,code]of[[400,'unknown_search_filter'],[409,'corpus_generation_changed'],[504,'corpus_search_timeout']]){const r=await worker.fetch(request(intent),env(async()=>Response.json({code},{status})));assert.equal(r.status,status);assert.deepEqual(await r.json(),{error:code});}
 assert.equal((await worker.fetch(request(intent),env(async()=>Response.json({...result,fonts:Array.from({length:7},(_,i)=>({family:'f'+i,count:1}))})))).status,502);
 assert.equal((await worker.fetch(new Request('https://proxy.test/v1/suggestions'),env(async()=>Response.json({})))).status,405);
});
test('preserves the retrieval-specific fallback error',async()=>{const r=await worker.fetch(request(),env(async()=>Response.json({code:'corpus_retrieval_unavailable'},{status:503})));assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'corpus_retrieval_unavailable'});});

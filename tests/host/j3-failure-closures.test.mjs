import test from 'node:test';import assert from 'node:assert/strict';import inspector from 'node:inspector';
import {collectJ3FailureClosures} from './j3-failure-closures.mjs';
test('post-failure collector reads real closure state without owner calls or sensitive output',async()=>{
 const session=new inspector.Session();session.connect();let calls=0,detached=false,released=false;
 const adapter={send:(method,params)=>new Promise((resolve,reject)=>{if(method==='Runtime.releaseObjectGroup')released=true;session.post(method,params,(error,result)=>error?reject(error):resolve(result));}),detach:async()=>{detached=true;session.disconnect();}};
 globalThis.__j3ClosureTest=(()=>{const active=false,enabled=false,contextResumeAllowed=true,current={ready:false,scopeKey:'SECRET_SCOPE'};const documents=new Map([['SECRET_DOCUMENT',{receipt:{contextId:'SECRET_CONTEXT'},reason:'context-selection-pending'}]]),requests=new Map([['SECRET_REQUEST',{accepted:true,conflicted:false,reason:'SECRET_REASON'}]]),closedRequests=new Map();const associatePage=()=>{calls++;};
  return {contextReady:function contextReady(){calls++;return contextResumeAllowed&&enabled&&current;},verify:async function verify(){calls++;const receipt=documents;if(active)associatePage();return {receipt,requests,closedRequests};}};
 })();
 try{const result=await collectJ3FailureClosures(adapter);assert.equal(result.error,undefined);assert(result.functions.some(r=>r.enabled===false&&r.contextResumeAllowed===true&&r.currentHasScope===true));assert(result.functions.some(r=>r.documents?.size===1&&r.requests?.rows[0].accepted===true&&r.active===false));assert(!JSON.stringify(result).includes('SECRET'));assert.equal(calls,0);assert(released&&detached);}finally{delete globalThis.__j3ClosureTest;if(!detached)session.disconnect();}
});
test('bounded timeout still releases object group and detaches',async()=>{const methods=[];let detached=false;const result=await collectJ3FailureClosures({send:async(method)=>{methods.push(method);if(method==='Runtime.enable')return new Promise(()=>{});return {};},detach:async()=>{detached=true;}},{timeoutMs:5});assert.equal(result.error,'timeout');assert(methods.includes('Runtime.releaseObjectGroup'));assert(detached);});
test('invalid limit fails closed before heap inspection and still cleans up',async()=>{const methods=[];let detached=false;const result=await collectJ3FailureClosures({send:async method=>{methods.push(method);return {};},detach:async()=>{detached=true;}},{maxFunctions:20001});assert.equal(result.error,'inspection-unavailable');assert.deepEqual(methods,['Runtime.releaseObjectGroup']);assert(detached);});

test('receipt presence is separated from route epoch and age, bridge pending state is projected without calls',async()=>{
 const session=new inspector.Session();session.connect();let called=0,detached=false;
 const adapter={send:(method,params)=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result))),detach:async()=>{detached=true;session.disconnect();}};
 const expectedURL='http://127.0.0.1:3210/c/11111111-1111-4111-8111-111111111111';
 globalThis.__j3ReceiptTest=(()=>{
  const active=true,ttl=60000,associatePage=()=>{called++;};
  const live={tabId:7,documentId:'PRIVATE_DOC',contextId:'PRIVATE_CONTEXT',epoch:3};
  live.receipt={...live,selectionEpoch:3,actualURL:expectedURL,wall:Date.now(),elapsed:performance.now()};
  const stale={...live,epoch:4,receipt:{...live.receipt,actualURL:expectedURL+'?old',wall:Date.now()-70000,elapsed:performance.now()-70000}};
  const trap={};Object.defineProperty(trap,'receipt',{get(){called++;throw Error('PRIVATE_GETTER');}});
  const documents=new Map([['PRIVATE_CURRENT',live],['PRIVATE_STALE',stale],['PRIVATE_TRAP',trap],['PRIVATE_UNKNOWN_ROUTE',{...live,receipt:Object.defineProperty({...live.receipt},'actualURL',{get(){called++;throw Error('PRIVATE_URL');}})}]]);
  const pending={message:{actualURL:expectedURL,conversationId:'PRIVATE_C',challenge:'PRIVATE_CHALLENGE'},until:Date.now()+6000,started:performance.now(),budget:6000},onPending=()=>{called++;};
  return {verify:async function verify(){called++;const receipt=documents;associatePage();return {receipt,ttl};},listener:function listener(m){called++;if(active&&pending&&m.type==='HOST_CONTEXT_ASSOCIATE')onPending();if(m.type==='HOST_CONTEXT_PENDING')onPending();}};
 })();
 try{
  const result=await collectJ3FailureClosures(adapter,{expectedURL});assert.equal(result.error,undefined);
  const owner=result.functions.find(r=>r.documents?.rows.length===4),rows=owner.documents.rows;
  assert.equal(owner.contextTtlMs,60000);assert.equal(rows[0].receiptPresent,true);
  for(const key of ['epochMatches','documentMatches','tabMatches','contextMatches','routeMatches'])assert.equal(rows[0].receipt[key],true,key);
  assert(rows[0].receipt.wallAgeMs>=0&&rows[0].receipt.elapsedAgeMs>=0);
  assert.equal(rows[1].receiptPresent,true);assert.equal(rows[1].receipt.epochMatches,false);assert.equal(rows[1].receipt.routeMatches,false);assert(rows[1].receipt.wallAgeMs>=70000&&rows[1].receipt.elapsedAgeMs>=70000);
  assert.equal(rows[2].receiptPresent,null);assert(!Object.hasOwn(rows[2],'receipt'));assert.equal(rows[3].receiptPresent,true);assert.equal(rows[3].receipt.routeMatches,null);
  const bridge=result.functions.find(r=>r.associationPending===true);assert.equal(bridge.active,true);assert.deepEqual(bridge.association,{routeMatches:true,deadlineValid:true,project:false,conversation:true});
  assert.equal(called,0);assert(!JSON.stringify(result).includes('PRIVATE'));assert(!JSON.stringify(result).includes(expectedURL));assert(detached);
 }finally{delete globalThis.__j3ReceiptTest;if(!detached)session.disconnect();}
});
test('non-loopback expected route rejects before closure inspection',async()=>{const methods=[];const result=await collectJ3FailureClosures({send:async method=>{methods.push(method);return {};},detach:async()=>{}},{expectedURL:'https://chatgpt.com/c/private'});assert.equal(result.error,'inspection-unavailable');assert.deepEqual(methods,['Runtime.releaseObjectGroup']);});

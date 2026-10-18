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

import {summarizeContextOwnerMap} from './j3-failure-closures.mjs';
test('document projection separates historical reason, receipt epoch and exact identity without exposing IDs',()=>{
 const docs=new Map([['primary',{documentId:'PRIVATE_PRIMARY',epoch:3,reason:'context-selection-pending',receipt:{documentId:'PRIVATE_PRIMARY',selectionEpoch:3,contextId:'PRIVATE_CONTEXT'}}],['peer',{documentId:'PRIVATE_PEER',epoch:4,receipt:{documentId:'PRIVATE_PEER',selectionEpoch:2}}]]);
 const result=summarizeContextOwnerMap(docs,'documents','PRIVATE_PEER');
 assert.equal(result.schema,'DOCUMENT_NOT_REQUEST');assert.equal(result.rows[0].receiptPresent,true);assert.equal(result.rows[0].lastInvalidationReason,'context-selection-pending');
 assert(!Object.hasOwn(result.rows[0],'accepted'));assert(!Object.hasOwn(result.rows[0],'reason'));
 assert.deepEqual(result.rows.map(row=>row.documentIdMatchesTarget),[false,true]);assert.deepEqual(result.rows.map(row=>row.receiptEpochMatchesDocument),[true,false]);
 assert(!JSON.stringify(result).includes('PRIVATE'));assert.equal(summarizeContextOwnerMap(docs,'documents').rows[0].documentIdMatchesTarget,null);
});
test('request projection relates preparation to its own document and does not classify closed requests as success',()=>{
 const document={documentId:'PRIVATE_PEER',epoch:4,receipt:{documentId:'PRIVATE_PEER',selectionEpoch:4}},requests=new Map([['a',{documentId:'PRIVATE_PEER',epoch:3,accepted:true,document}],['b',{documentId:'OTHER',epoch:4,accepted:false,historyRetained:true,reprepareUsed:true,document}]]);
 const result=summarizeContextOwnerMap(requests,'closedRequests','PRIVATE_PEER');assert.equal(result.schema,'REQUEST_PREPARATION_NOT_SUCCESS');assert.deepEqual(result.rows.map(row=>row.requestEpochMatchesDocument),[false,true]);assert.deepEqual(result.rows.map(row=>row.requestDocumentMatchesOwner),[true,false]);assert.deepEqual(result.rows.map(row=>row.requestDocumentIdMatchesTarget),[true,false]);assert(!JSON.stringify(result).includes('PRIVATE'));assert(!result.rows.some(row=>Object.hasOwn(row,'success')));
});
test('projection never invokes data accessors or custom Map size and discloses row truncation',()=>{
 let calls=0;const value={};for(const key of ['receipt','documentId','epoch','reason','accepted','conflicted','document'])Object.defineProperty(value,key,{get(){calls++;throw Error('must-not-run');}});
 const map=new Map(Array.from({length:129},(_,i)=>[i,value]));Object.defineProperty(map,'size',{get(){calls++;throw Error('must-not-run');}});
 for(const kind of ['documents','requests','closedRequests']){const result=summarizeContextOwnerMap(map,kind,'PRIVATE_TARGET');assert.equal(result.size,129);assert.equal(result.rows.length,128);assert.equal(result.truncated,true);}
 assert.equal(calls,0);assert.throws(()=>summarizeContextOwnerMap(map,'other'),/invalid-context-map-kind/);
});
test('real closure identity is supplied only in memory for a unique current owner',async()=>{
 const session=new inspector.Session();session.connect();let identity=null,calls=0;
 const adapter={send:(method,params)=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result))),detach:async()=>session.disconnect()};
 globalThis.__j3IdentityTest=(()=>{const contextResumeAllowed=true,current={ready:false,binding:{browserDocumentId:'PRIVATE_PEER_DOCUMENT'}};return function contextReady(){calls++;return contextResumeAllowed&&current;};})();
 try{const result=await collectJ3FailureClosures(adapter,{onDocumentIdentity:value=>{identity=value;}});assert.equal(result.error,undefined);assert.equal(identity,'PRIVATE_PEER_DOCUMENT');assert(!JSON.stringify(result).includes('PRIVATE'));assert.equal(calls,0);}finally{delete globalThis.__j3IdentityTest;}
});
test('nearest null current cannot be replaced by an outer same-name binding',async()=>{
 const raw=new inspector.Session();raw.connect();let identity=null;
 const adapter={send:(method,params)=>new Promise((resolve,reject)=>raw.post(method,params,(error,result)=>error?reject(error):resolve(result))),detach:async()=>raw.disconnect()};
 globalThis.__j3ShadowingTest=(()=>{const current={binding:{browserDocumentId:'PRIVATE_WRONG_OUTER'}},outerMarker=true;const sibling=()=>current;const owner=(()=>{const current=null,contextResumeAllowed=true;return function contextReady(){return contextResumeAllowed&&current&&outerMarker;};})();return {owner,sibling};})();
 try{const result=await collectJ3FailureClosures(adapter,{onDocumentIdentity:value=>{identity=value;}});assert.equal(identity,null);assert(result.functions.some(row=>row.currentPresent===false));assert(!result.functions.some(row=>row.currentPresent===true));assert(!JSON.stringify(result).includes('PRIVATE'));}finally{delete globalThis.__j3ShadowingTest;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {summarizeAccountsStructure} from '../../tools/native-me-probe/accounts-structure.mjs';

const source=readFileSync(new URL('../../tools/native-me-probe/popup.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
const key='vaiwl-credential-control-20261021-consumed',prefix='VAIWL_CREDENTIAL_CONTROL';
const ready={receiverVersion:5,ready:true,spent:false,statusDocumentBound:true,documentKey:'document-one'};
const result={state:'finished',stage:'meInclude',requests:1,meInclude:null,meOmit:null,meRelation:'not-compared',accountsInclude:null,accountsOmit:null,accountsRelation:'not-compared',credentialDependence:'not-established',identityEnabled:false,reason:'session-challenged'};
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function fixture({storage=new Map(),send=async m=>m.type.endsWith('_READY')?ready:result,locks,storageFailed=false,writeFailed=()=>false}={}){
 let time=0,serial=0;const timers=new Map(),messages=[],handlers={};
 const elements={run:{addEventListener:(_k,f)=>handlers.run=f},read:{addEventListener:(_k,f)=>handlers.read=f},result:{textContent:''}};
 const context=vm.createContext({TARGET_TAB_ID:999,PROBE_KEY:key,PROBE_PREFIX:prefix,AbortController,
  performance:{now:()=>time},setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),
  document:{getElementById:k=>elements[k]},localStorage:{getItem:k=>{if(storageFailed)throw Error('PRIVATE');return storage.get(k)??null;},setItem:(k,v)=>{if(writeFailed(v))throw Error('PRIVATE');storage.set(k,v);}},
  navigator:{locks:locks??{request:async(_k,options,fn)=>(fn??options)()}},
  chrome:{tabs:{query:async()=>[{id:7,url:'https://chatgpt.com/'}],get:async()=>({url:'https://chatgpt.com/'}),sendMessage:async(id,m)=>{messages.push({id,...m});return send(m);}}}});
 vm.runInContext(source,context);
 return {storage,handlers,elements,messages,timers,output:()=>JSON.parse(elements.result.textContent),advance:async(ms,fire=true)=>{time+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}await flush();}};
}

test('received fixed result survives popup reopen and loss of the original document',async()=>{
 const h=fixture();await h.handlers.run();assert.deepEqual(h.output(),result);
 assert.deepEqual(JSON.parse(h.storage.get(key)).result,result,'persist only the fixed terminal result in the existing consumed record');
 const reopened=fixture({storage:h.storage,send:()=>assert.fail('saved result must not contact any document')});
 await reopened.handlers.read();assert.deepEqual(reopened.output(),result);assert.equal(reopened.elements.run.disabled,true);
 assert.equal(h.messages.filter(m=>m.type.endsWith('_ONCE')).length,1);assert.equal(h.storage.size,1);
});

test('READY timeout releases the UI without consuming; a late reply cannot send ONCE',async()=>{
 let reply;const h=fixture({send:()=>new Promise(r=>reply=r)}),pending=h.handlers.run();await flush();
 assert(h.timers.size>0,'preflight must have a finite local deadline');await h.advance(3000);await pending;
 assert.equal(h.output().state,'preflight-timeout-no-request');assert.equal(h.elements.run.disabled,false);assert.equal(h.storage.size,0);
 reply(ready);await flush();assert.equal(h.messages.length,1);assert.equal(h.storage.size,0);
});

test('same-version old receiver without document-bound status is rejected before consumption',async()=>{
 const {statusDocumentBound,...oldReady}=ready;
 const h=fixture({send:async()=>oldReady});await h.handlers.run();
 assert.equal(h.output().state,'receiver-protocol-reload-required-no-request');assert.equal(h.storage.size,0);assert.equal(h.messages.length,1);assert.equal(h.elements.run.disabled,false);
});

test('ONCE delivery timeout keeps permission consumed and never retries or saves a late reply',async()=>{
 let reply;const h=fixture({send:m=>m.type.endsWith('_READY')?ready:new Promise(r=>reply=r)}),pending=h.handlers.run();await flush();
 assert(h.timers.size>0);await h.advance(8000);await pending;
 assert.equal(h.output().state,'consumed-delivery-unconfirmed-no-retry');assert.equal(h.elements.run.disabled,true);
 reply(result);await flush();assert.equal(JSON.parse(h.storage.get(key)).result,undefined);assert.equal(h.messages.filter(m=>m.type.endsWith('_ONCE')).length,1);
});

test('pending result reads are document-bound; legacy unbound records never query a replacement page',async()=>{
 const storage=new Map([[key,JSON.stringify({tabId:7,documentKey:'document-one'})]]);
 const h=fixture({storage,send:m=>{assert.equal(m.documentKey,'document-one');return {state:'document-changed-no-retry'};}});
 await h.handlers.read();assert.equal(h.output().state,'document-changed-no-retry');assert.equal(h.messages.length,1);
 for(const marker of ['consumed','{broken',JSON.stringify({tabId:7})]){
  const old=fixture({storage:new Map([[key,marker]]),send:()=>assert.fail('legacy receipt has no document binding')});
  await old.handlers.read();assert.equal(old.output().state,'result-unavailable-no-retry');assert.equal(old.elements.run.disabled,true);
 }
});

test('STATUS timeout is bounded and read-only',async()=>{
 const h=fixture({storage:new Map([[key,JSON.stringify({tabId:7,documentKey:'document-one'})]]),send:()=>new Promise(()=>{})});
 const pending=h.handlers.read();await flush();assert(h.timers.size>0);await h.advance(2000);await pending;
 assert.equal(h.output().state,'result-unavailable-no-retry');assert.equal(h.messages.length,1);assert(h.messages[0].type.endsWith('_STATUS'));
});

test('private or unexpected fields cannot be shown or persisted as a result',async()=>{
 for(const invalid of [{...result,token:'PRIVATE'}, {...result,reason:'PRIVATE'}, {...result,identityEnabled:true}, {...result,requests:5}]){
  const h=fixture({send:m=>m.type.endsWith('_READY')?ready:invalid});await h.handlers.run();
  assert.equal(h.output().state,'result-rejected-no-retry');assert(!JSON.stringify([...h.storage]).includes('PRIVATE'));assert(!h.elements.result.textContent.includes('PRIVATE'));
  assert.equal(h.elements.run.disabled,true);
 }
});

test('unreadable durable state fails closed without asking for a new request',async()=>{
 const h=fixture({storageFailed:true});assert.equal(h.output().state,'local-state-unavailable-no-request');assert.equal(h.elements.run.disabled,true);
 await h.handlers.run();await h.handlers.read();assert.equal(h.messages.length,0);assert(!h.elements.result.textContent.includes('PRIVATE'));
});

test('storage failure before consumption prevents ONCE; failure after receipt keeps the known result visible',async()=>{
 const pre=fixture({writeFailed:()=>true});await pre.handlers.run();assert.equal(pre.output().state,'local-state-unavailable-no-request');assert.equal(pre.messages.filter(m=>m.type.endsWith('_ONCE')).length,0);
 const post=fixture({writeFailed:raw=>Object.hasOwn(JSON.parse(raw),'result')});await post.handlers.run();
 assert.equal(post.output().state,'result-received-storage-unavailable-no-retry');assert.deepEqual(post.output().result,result);assert.equal(post.elements.run.disabled,true);assert.equal(post.messages.filter(m=>m.type.endsWith('_ONCE')).length,1);
});

test('nested structure keys are fixed categories, never source-provided IDs or names',async()=>{
 const structure=JSON.parse(JSON.stringify(summarizeAccountsStructure({accounts:{default:{account:{account_id:null,structure:'personal',is_deactivated:false},can_access_with_session:true}}})));
 const valid={...result,stage:'accountsInclude',requests:3,accountsInclude:{status:200,jsonMime:true,challenge:false,redirected:false,structure,selectedFieldSchemaValid:false,schemaIssue:'default-null-context-id'}};
 const accepted=fixture({send:m=>m.type.endsWith('_READY')?ready:valid});await accepted.handlers.run();assert.deepEqual(accepted.output(),valid);
 structure.groups.ordinary.keyFormat.PRIVATE_SOURCE_ID=1;
 const rejected=fixture({send:m=>m.type.endsWith('_READY')?ready:valid});await rejected.handlers.run();assert.equal(rejected.output().state,'result-rejected-no-retry');assert(!JSON.stringify([...rejected.storage]).includes('PRIVATE_SOURCE_ID'));
});

test('a queued lock has a deadline and a delayed callback cannot consume or send',async()=>{
 let enter;const h=fixture({locks:{request:(_key,options,fn)=>{enter=()=>fn();return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}}});
 const pending=h.handlers.run();await flush();assert(h.timers.size>0);await h.advance(2000);await pending;
 assert.equal(h.output().state,'diagnostic-busy-no-request');await enter();assert.equal(h.messages.length,0);assert.equal(h.storage.size,0);
});

test('elapsed lock expiry still rejects when its timer has not been delivered',async()=>{
 let enter;const h=fixture({locks:{request:(_key,_options,fn)=>new Promise((resolve,reject)=>{enter=()=>Promise.resolve().then(fn).then(resolve,reject);})}});
 const pending=h.handlers.run();await flush();await h.advance(2000,false);await enter();await pending;
 assert.equal(h.output().state,'diagnostic-busy-no-request');assert.equal(h.messages.length,0);assert.equal(h.storage.size,0);
});

test('late empty STATUS cannot erase an already received terminal result',async()=>{
 const storage=new Map([[key,JSON.stringify({tabId:7,documentKey:'document-one'})]]);let finish;
 const h=fixture({storage,send:()=>new Promise(r=>finish=r)}),pending=h.handlers.read();await flush();
 storage.set(key,JSON.stringify({tabId:7,documentKey:'document-one',result}));finish({state:'no-result'});await pending;
 assert.deepEqual(h.output(),result);assert.deepEqual(JSON.parse(storage.get(key)).result,result);
});

test('read retires a pending preflight and no late READY may consume permission',async()=>{
 let finish;const h=fixture({send:()=>new Promise(r=>finish=r)}),pending=h.handlers.run();await flush();await h.handlers.read();
 assert.equal(h.output().state,'no-request-issued');finish(ready);await pending;
 assert.equal(h.storage.size,0);assert.equal(h.messages.length,1);assert.equal(h.output().state,'no-request-issued');
});

test('result writeback cannot replace a different consumed document or oversized marker',async()=>{
 const storage=new Map([[key,JSON.stringify({tabId:7,documentKey:'document-one'})]]);let finish;
 const h=fixture({storage,send:()=>new Promise(r=>finish=r)}),pending=h.handlers.read();await flush();
 const next=JSON.stringify({tabId:7,documentKey:'document-two'});storage.set(key,next);finish(result);await pending;
 assert.equal(storage.get(key),next);assert.equal(h.output().state,'result-unavailable-no-retry');
 const oversized=fixture({storage:new Map([[key,'x'.repeat(32769)]]),send:()=>assert.fail('unbound marker')});await oversized.handlers.read();
 assert.equal(oversized.output().state,'result-unavailable-no-retry');assert.equal(oversized.elements.run.disabled,true);
});

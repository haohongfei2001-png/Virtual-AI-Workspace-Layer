import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeMeCandidate} from '../../tools/native-me-probe/candidate.mjs';
const me='https://chatgpt.com/backend-api/me',accounts='https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27';
const roster={accounts:{'private-space':{account:{account_id:'private-space',structure:'personal'}}}};
function response(url,body,options={}){
 const r=new Response(JSON.stringify(body),{status:options.status??200,headers:{'content-type':'application/json',...options.headers}});
 Object.defineProperties(r,{url:{value:options.url??url},redirected:{value:options.redirected??false}});return r;
}
function fixture({alter=()=>{},clock=()=>0,isCurrent,signal}={}){
 const calls=[];const probe=createNativeMeCandidate({now:clock,isCurrent,signal,fetch:async(url,options)=>{
  calls.push({url,options});const n=calls.length;
  const next={body:n===2?roster:{id:'private-subject',email:'never-export'},options:{}};
  alter(n,next);return response(url,next.body,next.options);
 }});return {probe,calls};
}
test('one candidate chain uses fixed ordinary requests, parses roster and exposes no identity',async()=>{
 const {probe,calls}=fixture(),r=await probe.run();
 assert.deepEqual(calls.map(c=>c.url),[me,accounts,me]);
 for(const {options}of calls){assert.deepEqual({...options,signal:null},{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:null});assert(options.signal.aborted);}
 assert.equal(r.reason,'candidate-consistent-not-authorized');assert.equal(r.contextCount,1);assert.equal(r.samePrincipal,true);assert.equal(r.sourceExpiryKnown,false);assert.equal(r.localFreshnessMaxMs,60000);assert.equal(r.identityEnabled,false);
 assert(!('expiresAt'in r));assert(!('principalId'in r));assert(!('contexts'in r));assert(!/private|never-export/.test(JSON.stringify(r)));
 assert.deepEqual(await probe.run(),{state:'already-consumed'});assert.equal(calls.length,3);assert(Object.isFrozen(probe.peek()));
});
for(const stage of [1,2,3])for(const fault of ['challenge','schema','size','redirect','mime'])test(`stop at stage ${stage}: ${fault}`,async()=>{
 const {probe,calls}=fixture({alter(n,next){if(n!==stage)return;
  if(fault==='challenge')next.options={status:403,headers:{'cf-mitigated':'challenge'}};
  if(fault==='schema')next.body=stage===2?{accounts:{broken:{}}}:{id:' '};
  if(fault==='size')next.options={headers:{'content-length':String(stage===2?1048577:262145)}};
  if(fault==='redirect')next.options={redirected:true};
  if(fault==='mime')next.options={headers:{'content-type':'text/html'}};
 }});const r=await probe.run();assert.equal(calls.length,stage);assert.equal(r.samePrincipal,false);assert.notEqual(r.reason,'candidate-consistent-not-authorized');
});
test('shared elapsed budget is not restarted for accounts or final me',async()=>{
 let time=0;const {probe,calls}=fixture({clock:()=>time,alter(n){time+=n===1?3500:2500;}});
 const r=await probe.run();assert.equal(r.reason,'request-timeout');assert.equal(calls.length,2);assert.equal(r.samePrincipal,false);
});
test('principal change rejects candidate without exposing either ID',async()=>{
 const {probe}=fixture({alter(n,next){if(n===3)next.body={id:'different-private'};}});const r=await probe.run();assert.equal(r.reason,'principal-changed');assert.equal(r.samePrincipal,false);assert(!JSON.stringify(r).includes('private'));
});
test('route or epoch guard loss prevents next request',async()=>{
 let current=true;const {probe,calls}=fixture({isCurrent:()=>current,alter(n){if(n===2)current=false;}});
 const r=await probe.run();assert.equal(r.reason,'document-changed');assert.equal(calls.length,2);assert.equal(r.samePrincipal,false);
});
test('abort settles hung transport; late private response cannot change summary or dispatch next stage',async()=>{
 let finish,calls=0;const c=new AbortController();const probe=createNativeMeCandidate({signal:c.signal,fetch:()=>{calls++;return new Promise(r=>finish=r);}});
 const pending=probe.run();assert.deepEqual(await probe.run(),{state:'already-consumed'});c.abort();const r=await pending;const snapshot=JSON.stringify(r);
 finish(response(me,{id:'private'}));await new Promise(r=>setTimeout(r,0));assert.equal(JSON.stringify(r),snapshot);assert.equal(r.reason,'document-changed');assert.equal(calls,1);
});
test('streamed roster limit cancels instead of parsing partial IDs',async()=>{
 let calls=0,cancelled=false;const p=createNativeMeCandidate({fetch:async url=>{
  calls++;if(calls===1)return response(me,{id:'private'});
  return {url,status:200,redirected:false,headers:new Headers({'content-type':'application/json'}),body:new ReadableStream({pull(c){c.enqueue(new Uint8Array(1048577));},cancel(){cancelled=true;}})};
 }});const r=await p.run();assert.equal(r.reason,'session-response-too-large');assert.equal(calls,2);assert.equal(r.rosterValid,false);assert(cancelled);
});

import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {buildProbe} from '../../tools/native-me-probe/build.mjs';
test('packaged chain is explicit, old permission cannot invoke it, visibility loss cancels, normal product unchanged',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'vaiwl-candidate-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const base=join(dir,'base'),out=join(dir,'candidate');buildHost(base,{observedChatGPTContext:true,temporaryReadOnly:true});
 const receipt=buildProbe(base,out,123,{candidateChain:true});assert.equal(receipt.candidateChain,true);assert.deepEqual(receipt.maxBodyBytes,[262144,1048576,262144]);verifyHost(base);assert.throws(()=>verifyHost(out));
 const original=JSON.parse(readFileSync(join(base,'manifest.json'))),manifest=JSON.parse(readFileSync(join(out,'manifest.json')));
 assert.deepEqual(manifest.permissions,original.permissions);assert.deepEqual(manifest.host_permissions,original.host_permissions);assert.deepEqual(manifest.web_accessible_resources,original.web_accessible_resources);
 assert.deepEqual(readFileSync(join(base,'content.js')),readFileSync(join(out,'content.js')));assert.deepEqual(readFileSync(join(base,'extension/worker.mjs')),readFileSync(join(out,'extension/worker.mjs')));
 const config=readFileSync(join(out,'native-me-probe-config.mjs'),'utf8');assert(config.includes('vaiwl-native-me-candidate-20261019-consumed'));assert(!config.includes('vaiwl-native-me-probe-20261019-consumed'));
 let listener,calls=0;const events=new Map(),window={addEventListener:(k,v)=>events.set(k,v)},document={visibilityState:'visible',addEventListener:(k,v)=>events.set(k,v)};window.top=window;
 const context=vm.createContext({window,document,location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},crypto:{randomUUID:()=> 'fresh'},AbortController,AbortSignal,TextDecoder,TextEncoder,Uint8Array,performance,setTimeout,clearTimeout,chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn}}},fetch:async url=>{calls++;return response(url,calls===2?roster:{id:'private'});}});
 vm.runInContext(readFileSync(join(out,'native-me-probe.js'),'utf8'),context);
 const sender={id:'test',url:'chrome-extension://test/native-me-probe.html'};
 listener({type:'VAIWL_ME_PROBE_ONCE',documentKey:'fresh'},sender,()=>assert.fail('old permission'));assert.equal(calls,0);
 listener({type:'VAIWL_ME_CANDIDATE_ONCE',documentKey:'fresh'},{...sender,tab:{id:123}},()=>assert.fail('page sender'));
 const ready=await new Promise(r=>listener({type:'VAIWL_ME_CANDIDATE_READY'},sender,r));assert.equal(ready.ready,true);
 document.visibilityState='hidden';events.get('visibilitychange')();const result=await new Promise(r=>listener({type:'VAIWL_ME_CANDIDATE_ONCE',documentKey:'fresh'},sender,r));assert.equal(result.reason,'document-changed');assert.equal(calls,0);
});
test('new chain permission preserves old marker and serializes one chain across popup pages',async()=>{
 const old='vaiwl-native-me-probe-20261019-consumed',key='vaiwl-native-me-candidate-20261019-consumed',storage=new Map([[old,'consumed']]),handlers=[],messages=[];let lock=Promise.resolve();
 const locks={request:(k,fn)=>{assert.equal(k,key);const p=lock.then(fn);lock=p.catch(()=>{});return p;}};
 function page(){const elements={run:{addEventListener:(_k,fn)=>handlers.push(fn)},read:{addEventListener(){}},result:{textContent:''}};
  vm.runInNewContext(readFileSync(new URL('../../tools/native-me-probe/popup.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/,''),{TARGET_TAB_ID:123,PROBE_KEY:key,PROBE_PREFIX:'VAIWL_ME_CANDIDATE',document:{getElementById:k=>elements[k]},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},navigator:{locks},chrome:{tabs:{query:async()=>[{id:123,url:'https://chatgpt.com/'}],get:async()=>({url:'https://chatgpt.com/'}),sendMessage:async(_id,m)=>{messages.push(m.type);if(m.type.endsWith('_READY'))return {ready:true,spent:false,documentKey:'fresh'};assert(storage.has(key));throw Error('lost');}}}});return elements;
 }
 assert.equal(page().run.disabled,false);page();await Promise.all(handlers.map(fn=>fn()));assert.equal(messages.filter(x=>x.endsWith('_ONCE')).length,1);assert.equal(page().run.disabled,true);assert.equal(storage.get(old),'consumed');assert.equal(storage.size,2);
});

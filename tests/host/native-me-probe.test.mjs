import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeMeProbe} from '../../tools/native-me-probe/reader.mjs';
const url='https://chatgpt.com/backend-api/me';
function response(body,{status=200,headers={},redirected=false,target=url}={}){
 const r=new Response(body,{status,headers:{'content-type':'application/json',...headers}});
 Object.defineProperties(r,{url:{value:target},redirected:{value:redirected}});return r;
}
test('fixed cookie-only GET once; output never includes private fields',async()=>{
 let calls=0,signal;
 const p=createNativeMeProbe({fetch:async(target,options)=>{calls++;assert.equal(target,url);assert.deepEqual(Object.keys(options).sort(),['cache','credentials','headers','method','redirect','signal']);assert.deepEqual({...options,signal:undefined},{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:undefined});signal=options.signal;return response(JSON.stringify({id:'private-subject',token:'secret',name:'private-name'}));}});
 const result=await p.run();assert.equal(result.idValid,true);assert.equal(result.reason,'valid-id-structure');assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(JSON.stringify(result).includes('secret'),false);assert(signal.aborted);
 assert.deepEqual(await p.run(),{state:'already-consumed'});assert.equal(calls,1);assert.deepEqual(p.peek(),result);
});
for(const id of ['',null,1,'x y','__proto__','x'.repeat(257)])test('reject unsafe ID '+JSON.stringify(id).slice(0,30),async()=>{
 const p=createNativeMeProbe({fetch:async()=>response(JSON.stringify({id}))});assert.equal((await p.run()).idValid,false);
});
for(const [name,options,reason]of [
 ['challenge',{status:403,headers:{'cf-mitigated':'challenge'}},'session-challenged'],
 ['401',{status:401},'session-unauthorized'],['403',{status:403},'session-unauthorized'],
 ['mime',{headers:{'content-type':'text/html'}},'invalid-session-mime'],
 ['redirect',{redirected:true},'invalid-session-response'],['target',{target:url+'?x'},'invalid-session-response'],
 ['size',{headers:{'content-length':'262145'}},'session-response-too-large']
])test('reject without reading '+name,async()=>{
 let reads=0;const r=response('{"id":"not-output"}',options);Object.defineProperty(r,'body',{get(){reads++;throw Error('must-not-read');}});
 const p=createNativeMeProbe({fetch:async()=>r});assert.equal((await p.run()).reason,reason);assert.equal(reads,0);
});
test('stream over limit is cancelled without exporting partial fields',async()=>{
 let cancelled=false;const r={url,status:200,redirected:false,headers:new Headers({'content-type':'application/json'}),body:new ReadableStream({pull(c){c.enqueue(new Uint8Array(262145));},cancel(){cancelled=true;}})};
 const result=await createNativeMeProbe({fetch:async()=>r}).run();assert.equal(result.reason,'session-response-too-large');assert(cancelled);assert.equal(result.idValid,false);
});
test('elapsed deadline cannot be extended by delayed timer',async()=>{
 let time=0;const result=await createNativeMeProbe({now:()=>time,fetch:async()=>{time=6000;return response('{"id":"private"}');}}).run();assert.equal(result.reason,'request-timeout');assert.equal(result.idValid,false);
});
test('concurrent invocation cannot send twice',async()=>{
 let resolve,calls=0;const p=createNativeMeProbe({fetch:()=>{calls++;return new Promise(r=>resolve=r);}});const first=p.run();assert.deepEqual(await p.run(),{state:'already-consumed'});resolve(response('{"id":"private"}'));await first;assert.equal(calls,1);
});
test('document changes reject late response and cannot mutate returned result',async()=>{
 let resolve;const controller=new AbortController();const p=createNativeMeProbe({signal:controller.signal,fetch:()=>new Promise(r=>resolve=r)});const pending=p.run();controller.abort();const result=await pending;assert.equal(result.reason,'document-changed');resolve(response('{"id":"private"}'));await new Promise(r=>setTimeout(r,0));assert.equal(result.status,null);assert.equal(result.idValid,false);
});
test('same-document route change is checked before accepting body',async()=>{
 let current=true;const p=createNativeMeProbe({isCurrent:()=>current,fetch:async()=>{current=false;return response('{"id":"private"}');}});assert.equal((await p.run()).reason,'document-changed');
});

import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {buildProbe} from '../../tools/native-me-probe/build.mjs';
test('explicit overlay keeps normal source/permissions unchanged and packaged receiver rejects wrong sender/document',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'vaiwl-me-probe-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const base=join(dir,'base'),out=join(dir,'overlay');buildHost(base,{observedChatGPTContext:true,temporaryReadOnly:true});const receipt=buildProbe(base,out,123);
 assert.equal(receipt.identityEnabled,false);assert.deepEqual(receipt.permissionsAdded,[]);verifyHost(base);assert.throws(()=>verifyHost(out));
 const oldManifest=JSON.parse(readFileSync(join(base,'manifest.json'))),manifest=JSON.parse(readFileSync(join(out,'manifest.json')));
 assert.deepEqual(manifest.permissions,oldManifest.permissions);assert.deepEqual(manifest.host_permissions,oldManifest.host_permissions);assert.deepEqual(manifest.web_accessible_resources,oldManifest.web_accessible_resources);assert.equal(manifest.content_scripts.at(-1).world,'ISOLATED');assert.equal(manifest.content_scripts.at(-1).all_frames,false);
 assert.deepEqual(readFileSync(join(base,'content.js')),readFileSync(join(out,'content.js')));assert.deepEqual(readFileSync(join(base,'extension/worker.mjs')),readFileSync(join(out,'extension/worker.mjs')));
 let listener,calls=0;const events=new Map(),window={addEventListener:(key,fn)=>events.set(key,fn)};window.top=window;
 const context=vm.createContext({window,location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},crypto:{randomUUID:()=> 'fresh-document'},AbortController,AbortSignal,TextDecoder,TextEncoder,Uint8Array,performance,setTimeout,clearTimeout,chrome:{runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>listener=fn}}},fetch:async()=>{calls++;return response('{"id":"private"}');}});
 vm.runInContext(readFileSync(join(out,'native-me-probe.js'),'utf8'),context);
 const sender={id:'test',url:'chrome-extension://test/native-me-probe.html'};
 const ready=await new Promise(resolve=>listener({type:'VAIWL_ME_PROBE_READY'},sender,resolve));assert.equal(ready.ready,true);assert.equal(calls,0);
 listener({type:'VAIWL_ME_PROBE_ONCE',documentKey:ready.documentKey},{...sender,tab:{id:123}},()=>assert.fail('untrusted sender'));listener({type:'VAIWL_ME_PROBE_ONCE',documentKey:'old'},sender,()=>assert.fail('old document'));assert.equal(calls,0);
 const result=await new Promise(resolve=>listener({type:'VAIWL_ME_PROBE_ONCE',documentKey:ready.documentKey},sender,resolve));assert.equal(result.idValid,true);assert.equal(calls,1);
 await new Promise(resolve=>listener({type:'VAIWL_ME_PROBE_ONCE',documentKey:ready.documentKey},sender,resolve));assert.equal(calls,1);
});
test('private UI serializes concurrent pages and consumes before uncertain delivery',async()=>{
 const storage=new Map(),handlers=[],outputs=[],messages=[];let lock=Promise.resolve();
 const locks={request:(_key,fn)=>{const next=lock.then(fn);lock=next.catch(()=>{});return next;}};
 function page(){
  const elements={run:{addEventListener:(_type,fn)=>handlers.push(fn)},read:{addEventListener(){}},result:{set textContent(v){outputs.push(v);}}};
  const context=vm.createContext({TARGET_TAB_ID:123,document:{getElementById:id=>elements[id]},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},navigator:{locks},chrome:{tabs:{get:async()=>({url:'https://chatgpt.com/'}),sendMessage:async(id,message,options)=>{assert.equal(id,123);assert.equal(options.frameId,0);messages.push(message.type);if(message.type==='VAIWL_ME_PROBE_READY')return {ready:true,spent:false,documentKey:'current'};assert.equal(storage.size,1);throw Error('delivery lost');}}}});
  vm.runInContext(readFileSync(new URL('../../tools/native-me-probe/popup.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/,''),context);return elements;
 }
 page();page();await Promise.all(handlers.map(fn=>fn()));assert.equal(messages.filter(m=>m==='VAIWL_ME_PROBE_ONCE').length,1);assert.equal(messages.filter(m=>m==='VAIWL_ME_PROBE_READY').length,1);assert(outputs.some(v=>v.includes('consumed-delivery-unconfirmed-no-retry')));assert.equal(page().run.disabled,true);
});

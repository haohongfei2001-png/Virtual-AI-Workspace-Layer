import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {readLocalBoot} from '../../src/host/local-status.mjs';

test('failed entry import retains only the private startup responder and removes it on document exit',async()=>{
 const listeners=new Set(),handlers=new Map(),document={documentElement:{dataset:{}}};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l)}};
 const source=readFileSync(new URL('../../extension/content-bootstrap.js',import.meta.url),'utf8');
 runInNewContext(source,{chrome:{runtime},document,window:{addEventListener:(k,f)=>handlers.set(k,f)},Object,Reflect},{importModuleDynamically:async()=>{throw Error('private fixture failure');}});
 await new Promise(r=>setImmediate(r));assert.equal(document.documentElement.dataset.vaiwlBoot,'module-load-failed');assert.equal(listeners.size,1);
 const listener=[...listeners][0],message={v:1,type:'HOST_LOCAL_BOOT'},sender={id:'extension',url:runtime.getURL('status.html')};let reply;
 listener(message,{...sender,url:'https://chatgpt.com/'},()=>assert.fail('public sender'));
 listener({...message,title:'private'},sender,()=>assert.fail('extra field'));
 listener(message,sender,r=>reply=r);assert.deepEqual(JSON.parse(JSON.stringify(reply)),{v:1,stage:'module-load-failed',build:'source'});
 handlers.get('pagehide')({persisted:true});assert.equal(listeners.size,1);
 handlers.get('pagehide')({persisted:false});assert.equal(listeners.size,0);
});

test('startup probe never mixes a previous document or route with the current status',async()=>{
 const target={tabId:1,documentId:'d',url:'https://chatgpt.com/'},reply={v:1,stage:'module-loaded',build:'a'.repeat(64)};
 for(const changed of [false,true]){
  let reads=0;const webNavigation={getFrame:async()=>({documentId:'d',documentLifecycle:'active',url:changed&&reads++?target.url+'c/fixture':target.url})};
  const actual=await readLocalBoot({target,webNavigation,tabs:{sendMessage:async(id,m,binding)=>{assert.equal(id,1);assert.deepEqual(binding,{documentId:'d'});return reply;}}});
  assert.deepEqual(actual,changed?null:reply);
 }
});

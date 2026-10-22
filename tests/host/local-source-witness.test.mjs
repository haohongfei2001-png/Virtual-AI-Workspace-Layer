import test from 'node:test';
import assert from 'node:assert/strict';
import {runWitness} from '../../tools/native-source-witness/runner.mjs';
import {buildLocalWitness,verifyLocalWitness} from '../../tools/native-source-witness/build.mjs';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
const c='12345678-1234-1234-1234-123456789abc',d='22345678-1234-1234-1234-123456789abc',p='g-p-'+'a'.repeat(32);
const frame={tabId:1,frameId:0,documentId:'doc-one',actualURL:'https://chatgpt.com/c/'+c,incognito:false,documentLifecycle:'active'};
const session=()=>({user:{id:'SECRET_PRINCIPAL',email:'PRIVATE_EMAIL'},expires:new Date(Date.now()+3600000).toISOString(),accessToken:'SECRET_TOKEN'});
const accounts=()=>({accounts:{SECRET_CONTEXT:{account:{account_id:'SECRET_CONTEXT',structure:'personal'},can_access_with_session:true}}});
const rows=(ids,{offset=0,total=2,cursor}={})=>({items:ids.map(id=>({id,title:'PRIVATE_TITLE',body:'PRIVATE_BODY',gizmo_id:null,update_time:123})),offset,limit:100,total,has_missing_conversations:false,...(cursor!==undefined?{cursor}:{})});
function harness(overrides={}){
 const calls=[],receipt={id:'receipt-one',contextId:'SECRET_CONTEXT',selectionEpoch:1,wall:Date.now()};let current=true,live=frame,active=0;
 const values=[session(),accounts(),session(),accounts(),rows([c]),rows([d],{offset:1}),rows([c],{total:1,cursor:null}),{items:[{gizmo:{gizmo:{id:p,gizmo_type:'snorlax',display:{name:'PRIVATE_PROJECT'}}}}],cursor:null},{items:[{id:c,title:'PRIVATE_TITLE',gizmo_id:p}],cursor:'next-private-cursor'},{items:[{id:d,title:'PRIVATE_TITLE',gizmo_id:p}],cursor:null},session(),accounts()];
 const contextObserver={verify:async()=>current?receipt:null,isCurrent:()=>current};
 const fetch=async(url,options)=>{assert.equal(active++,0);try{calls.push({url,options});if(overrides.fetch)return await overrides.fetch(url,options,calls.length);const body=values[calls.length-1];assert(body,'unexpected request');const r=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;}finally{active--;}};
 return {calls,values,run:()=>runWitness({frame,contextObserver,getFrame:async()=>live,fetch,...overrides.runner}),revoke:()=>current=false,changeDocument:()=>live={...frame,documentId:'doc-two'}};
}
test('one private composition traverses actual authority and parsers in 12 serial GETs, retains only anonymous report',async()=>{
 const h=harness(),result=await h.run();assert.equal(result.state,'PARTIAL',JSON.stringify(result));assert.equal(result.requests,12);assert.equal(result.decision,'CONDITIONAL GO');
 for(const stage of Object.values(result.stages))assert.equal(stage.state,'PASS');
 assert.equal(result.stages.ordinary.pages[1].newRelativeToFirstPage,1);assert.equal(result.stages.ordinary.pages[1].terminalObserved,false);assert.equal(result.fullHistory,'NOT_ESTABLISHED');
 for(const {url,options}of h.calls){assert.equal(new URL(url).origin,'https://chatgpt.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'include');if(url.includes('/backend-api/')&&!url.includes('/accounts/'))assert.equal(options.headers['ChatGPT-Account-ID'],'SECRET_CONTEXT');}
 assert.equal(h.calls.filter(c=>c.url.endsWith('/api/auth/session')).length,3);assert.equal(h.calls.filter(c=>c.url.includes('accounts/check')).length,3);
 assert.equal(h.calls[6].url,'https://chatgpt.com/backend-api/conversations?offset=0&limit=100&is_archived=true&order=updated');
 for(const value of ['SECRET','PRIVATE',p,c,d,'next-private-cursor','principal_','context_'])assert(!JSON.stringify(result).includes(value),value);
});
test('challenge stops on first GET, does not read body or switch transport',async()=>{
 let reads=0;const h=harness({fetch:async url=>({url,status:403,redirected:false,headers:new Headers({'content-type':'text/html','cf-mitigated':'challenge'}),get body(){reads++;return null;}})});
 const result=await h.run();assert.equal(result.requests,1);assert.equal(result.state,'BLOCKED');assert.equal(result.reason,'session-challenged');assert.equal(result.stages.ordinary.state,'NOT_RUN');assert.equal(reads,0);
});
for(const [index,stage]of [[1,'identity'],[3,'ordinary'],[11,'finalIdentity']])test(`default/null roster retains fixed schema reason at ${stage} without manufacturing a context`,async()=>{
 const h=harness();h.values[index]={accounts:{default:{account:{account_id:null,structure:'personal',is_deactivated:false,name:'PRIVATE_NAME'},can_access_with_session:true}}};
 const r=await h.run();assert.equal(r.requests,index+1);assert.equal(r.reason,'invalid-accounts-schema');assert.equal(r.schemaIssue,'default-null-context-id');assert.equal(r.stages[stage].state,'BLOCKED');
 assert.equal(r.stages.currentSpace.state,index===1?'NOT_RUN':'PASS');assert.equal(r.decision,'BLOCKED');assert.equal(r.productionEnabled,false);assert(!/PRIVATE|SECRET/.test(JSON.stringify(r)));
});
test('valid principal and roster cannot replace missing C2',async()=>{
 const h=harness();h.revoke();const r=await h.run();assert.equal(r.requests,2);assert.equal(r.stages.identity.state,'PASS');assert.equal(r.stages.currentSpace.state,'BLOCKED');assert.equal(r.stages.ordinary.state,'NOT_RUN');
});
test('reauth identity change ends before directory, no final retry',async()=>{
 const h=harness();h.values[2].user.id='OTHER_PRIVATE_PRINCIPAL';const r=await h.run();assert.equal(r.requests,3);assert.equal(r.reason,'identity-changed');assert.equal(r.stages.finalIdentity.state,'NOT_RUN');
});
test('partial first ordinary page cannot authorize continuation; unused slot is not transferred',async()=>{
 const h=harness();delete h.values[4].has_missing_conversations;h.values.splice(5,1);const r=await h.run();assert.equal(r.requests,11);assert.equal(r.stages.ordinary.state,'PARTIAL');assert.equal(r.stages.ordinary.pages.length,1);assert.equal(r.stages.members.pages.length,2);
});
test('empty Project index never invents a member target',async()=>{
 const h=harness();h.values[7]={items:[],cursor:null};h.values.splice(8,2);const r=await h.run();assert.equal(r.requests,10);assert.equal(r.stages.members.state,'NOT_RUN');
});
test('aggregate stream limit includes authentication bytes',async()=>{
 const h=harness();for(const i of [0,2,10])h.values[i].padding='x'.repeat(200000);for(const i of [1,3,4,5,6])h.values[i].padding='x'.repeat(900000);
 const r=await h.run();assert.equal(r.state,'BLOCKED');assert(r.decodedBytes>4194304);assert(r.requests<12);assert.equal(r.stages.finalIdentity.state,'NOT_RUN');
});
test('scope revocation after pending fetch cannot advance, and late response cannot change returned report',async()=>{
 let release;const control=new AbortController();const h=harness({runner:{signal:control.signal},fetch:url=>new Promise(resolve=>{release=()=>{const r=new Response(JSON.stringify(session()),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});resolve(r);};})});
 const pending=h.run();while(!release)await new Promise(r=>setTimeout(r,0));control.abort();const result=await pending,before=JSON.stringify(result);release();await new Promise(r=>setTimeout(r,10));assert.equal(JSON.stringify(result),before);assert.equal(h.calls.length,1);assert.equal(result.state,'BLOCKED');
});
test('elapsed time is checked even when timer is delayed',async()=>{
 let time=0;const h=harness({runner:{elapsedNow:()=>time},fetch:async url=>{time=6000;const r=new Response('{}',{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;}});const r=await h.run();assert.equal(r.requests,1);assert.equal(r.reason,'request-timeout');
});
test('initial C2 preparation consumes the same six-second identity window',async()=>{
 let time=5500;const h=harness({runner:{elapsedNow:()=>time,startedAt:0},fetch:async url=>{time=6001;const response=new Response('{}',{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;}});
 const result=await h.run();assert.equal(result.reason,'request-timeout');assert.equal(result.requests,1);assert.equal(result.elapsedMs,6001);
});
test('developer overlay preserves normal navigation, adds only storage, private code stays out of WAR',t=>{
 const dir=mkdtempSync(join(tmpdir(),'vaiwl-local-witness-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const output=join(dir,'extension');const info=buildLocalWitness(output),manifest=JSON.parse(readFileSync(join(output,'manifest.json')));
 assert.equal(verifyLocalWitness(output).realChatGPT,'NOT_RUN');assert.deepEqual(manifest.permissions,['webNavigation','webRequest','storage']);assert.deepEqual(manifest.host_permissions,['https://chatgpt.com/*']);assert.equal(manifest.action.default_popup,'status.html');
 assert.match(readFileSync(join(output,'source-witness-entry.mjs'),'utf8'),/extension\/temporary-navigation.mjs/);assert.match(readFileSync(join(output,'status.html'),'utf8'),/source-witness-entry.mjs/);
 assert(manifest.web_accessible_resources.every(r=>r.resources.every(p=>!p.includes('witness'))));
 assert.equal(info.maxGETs,12);assert.equal(info.retries,0);assert.equal(info.maxBytes,4194304);assert.equal(info.realChatGPT,'NOT_RUN');
 assert.throws(()=>buildLocalWitness(output),/output-must-be-new/);
 // A modified permission plus a recomputed self-reported hash is not proof.
 manifest.permissions.push('debugger');const bytes=JSON.stringify(manifest,null,2)+'\n';writeFileSync(join(output,'manifest.json'),bytes);
 const receipt=JSON.parse(readFileSync(join(output,'local-witness-manifest.json')));receipt.files['manifest.json']=createHash('sha256').update(bytes).digest('hex');writeFileSync(join(output,'local-witness-manifest.json'),JSON.stringify(receipt));
 assert.throws(()=>verifyLocalWitness(output),/witness-overlay-mismatch/);
});

import {installWitnessWorker} from '../../tools/native-source-witness/worker.mjs';
import {BATCH} from '../../tools/native-source-witness/runner.mjs';
function mockChrome(stored={}){
 const event=()=>{const listeners=new Set();return {listeners,addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:x=>{for(const f of listeners)f(x);}};};
 const runtime={id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,getManifest:()=>({version:'0.3.0'}),onMessage:event()};
 const chrome={runtime,storage:{local:{get:async key=>({[key]:stored[key]}),set:async value=>Object.assign(stored,value)}},tabs:{get:async id=>({id,url:'https://chatgpt.com/',incognito:false}),sendMessage:async()=>({ready:true}),onRemoved:event()},webNavigation:{getFrame:async()=>({documentId:'doc-one',url:'https://chatgpt.com/',documentLifecycle:'active',frameType:'outermost_frame'}),onCommitted:event(),onHistoryStateUpdated:event()},webRequest:Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>[k,event()]))};
 installWitnessWorker(chrome);
 const sender={id:runtime.id,url:runtime.getURL('source-witness.html')+'#1'};
 const message=(value,source=sender)=>new Promise(resolve=>{let accepted=false;for(const fn of runtime.onMessage.listeners)if(fn(value,source,resolve)===true)accepted=true;if(!accepted)resolve('ignored');});
 return {chrome,message,stored};
}
test('worker loss preserves spent ledger and reports unknown count, never zero or a retry',async()=>{
 const {message}=mockChrome({[BATCH]:{state:'reserved',result:null}});const report=await message({type:'SOURCE_WITNESS_READ'});assert.equal(report.requests,null);assert.equal(report.requestCountKnown,false);assert.equal(report.unspent,false);assert.equal(report.stages.identity.state,'PARTIAL');
 const repeat=await message({type:'SOURCE_WITNESS_ARM',tabId:1});assert.deepEqual(repeat,report);
});
test('content scripts and other extension pages cannot arm; single-tab listener filters before processing',async()=>{
 const {chrome,message,stored}=mockChrome();assert.equal(await message({type:'SOURCE_WITNESS_ARM',tabId:1},{id:chrome.runtime.id,url:'https://chatgpt.com/',tab:{id:1}}),'ignored');assert.equal(await message({type:'SOURCE_WITNESS_ARM',tabId:1},{id:chrome.runtime.id,url:chrome.runtime.getURL('status.html')}),'ignored');
 assert.equal((await message({type:'SOURCE_WITNESS_ARM',tabId:1})).state,'WAITING_NATIVE');assert(stored[BATCH]);
 for(let i=0;i<1001;i++)chrome.webRequest.onSendHeaders.emit({tabId:99});assert.equal((await message({type:'SOURCE_WITNESS_READ'})).state,'WAITING_NATIVE');
 chrome.tabs.onRemoved.emit(1);await new Promise(r=>setTimeout(r,0));assert.equal((await message({type:'SOURCE_WITNESS_READ'})).reason,'target-closed');for(const e of Object.values(chrome.webRequest))assert.equal(e.listeners.size,0);
});
test('preparation permits one conversation navigation, not arbitrary scope/page changes',async()=>{
 const {chrome,message}=mockChrome();await message({type:'SOURCE_WITNESS_ARM',tabId:1});
 const detail={tabId:1,frameId:0,documentId:'doc-one',documentLifecycle:'active',frameType:'outermost_frame',url:frame.actualURL};
 chrome.webNavigation.onHistoryStateUpdated.emit(detail);chrome.webNavigation.onHistoryStateUpdated.emit(detail);assert.equal((await message({type:'SOURCE_WITNESS_READ'})).state,'WAITING_NATIVE');
 chrome.webNavigation.onHistoryStateUpdated.emit({...detail,url:'https://chatgpt.com/c/'+d});await new Promise(r=>setTimeout(r,0));assert.equal((await message({type:'SOURCE_WITNESS_READ'})).reason,'single-navigation-boundary');
});
test('missing packaged receiver does not consume authorization or issue network requests',async()=>{
 const {chrome,message,stored}=mockChrome();chrome.tabs.sendMessage=async()=>null;const r=await message({type:'SOURCE_WITNESS_ARM',tabId:1});assert.equal(r.unspent,true);assert.equal(stored[BATCH],undefined);
 chrome.tabs.sendMessage=async()=>{throw Error('Could not establish connection. Receiving end does not exist.');};const rejected=await message({type:'SOURCE_WITNESS_ARM',tabId:1});assert.equal(rejected.reason,'new-chatgpt-tab-required-no-request');assert.equal(rejected.requests,0);assert.equal(rejected.unspent,true);assert.equal(stored[BATCH],undefined);
});
test('native refusal during preparation stops immediately instead of waiting for another request',async()=>{
 const {chrome,message}=mockChrome();await message({type:'SOURCE_WITNESS_ARM',tabId:1});
 chrome.webRequest.onCompleted.emit({tabId:1,frameId:0,initiator:'https://chatgpt.com',method:'GET',type:'xmlhttprequest',statusCode:403});
 await new Promise(r=>setTimeout(r,0));const result=await message({type:'SOURCE_WITNESS_READ'});assert.equal(result.reason,'native-request-refused-or-failed');assert.equal(result.requests,0);assert.equal(chrome.webRequest.onCompleted.listeners.size,0);
});
test('result page serializes reads and a late ARM response cannot replace a final result',async()=>{
 const elements=new Map(),intervals=new Set();let completeArm,completeRead,reads=0;
 for(const id of ['result','run','confirm','download','environment','read'])elements.set(id,{disabled:false,checked:true,textContent:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
 const scope={location:{hash:'#1'},document:{getElementById:id=>elements.get(id)},window:{addEventListener(){}},setInterval:fn=>{intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn),chrome:{runtime:{sendMessage:message=>{
  if(message.type==='SOURCE_WITNESS_PREVIEW')return Promise.resolve({state:'READY'});
  if(message.type==='SOURCE_WITNESS_ARM')return new Promise(resolve=>{completeArm=resolve;});
  if(++reads===1)return Promise.resolve({state:'WAITING_NATIVE',unspent:false});
  return new Promise(resolve=>{completeRead=resolve;});
 }}}};
 await runInNewContext('(async()=>{'+readFileSync(new URL('../../tools/native-source-witness/page.mjs',import.meta.url),'utf8')+'})()',scope);
 const arm=elements.get('run').handlers.click({isTrusted:true}),read=elements.get('read').handlers.click();await elements.get('read').handlers.click();assert.equal(reads,2);
 const final={schema:BATCH,state:'PARTIAL',reason:'bounded-source-sample-only'};completeRead(final);await read;completeArm({state:'RUNNING',unspent:false});await arm;
 assert.deepEqual(JSON.parse(elements.get('result').textContent),final);assert.equal(intervals.size,0);assert.equal(elements.get('download').disabled,false);
});
test('content bridge stays ready across BFCache and removes liveness on final unload',()=>{
 const listeners=new Set(),events={};let stopped=0;const window={addEventListener:(name,fn)=>events[name]=fn};window.top=window;
 runInNewContext(readFileSync(new URL('../../tools/native-source-witness/content.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),{window,location:{origin:'https://chatgpt.com'},document:{},CHATGPT_OBSERVED_PROFILE:{},createContextAssociationBridge:()=>({stop:()=>stopped++}),chrome:{runtime:{id:'private',onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}}});
 events.pagehide({persisted:true});assert.equal(stopped,0);let response;for(const fn of listeners)fn({type:'SOURCE_WITNESS_READY'},{id:'private'},value=>response=value);assert.equal(response.ready,true);
 events.pagehide({persisted:false});assert.equal(stopped,1);assert.equal(listeners.size,0);
});

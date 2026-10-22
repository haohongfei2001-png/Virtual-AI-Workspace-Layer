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
 assert.equal(info.mode,'PASSIVE_C2_ONLY');assert.equal(info.batchId,PASSIVE_BATCH);assert.equal(info.previousBatchId,BATCH);assert.equal(info.previousPassiveBatchId,PREVIOUS_PASSIVE_BATCH);assert.equal(info.previousPassiveV2BatchId,PREVIOUS_PASSIVE_V2_BATCH);
 assert.equal(info.maxGETs,0);assert.equal(info.retries,0);assert.equal(info.maxBytes,0);assert.equal(info.maxConcurrent,0);assert.equal(info.realChatGPT,'NOT_RUN');
 assert.equal(info.maxPreparationMs,120000);assert.equal(info.maxChainMs,6000);assert.equal(info.maxElapsedMs,126000);
 assert.throws(()=>buildLocalWitness(output),/output-must-be-new/);
 // A modified permission plus a recomputed self-reported hash is not proof.
 manifest.permissions.push('debugger');const bytes=JSON.stringify(manifest,null,2)+'\n';writeFileSync(join(output,'manifest.json'),bytes);
 const receipt=JSON.parse(readFileSync(join(output,'local-witness-manifest.json')));receipt.files['manifest.json']=createHash('sha256').update(bytes).digest('hex');writeFileSync(join(output,'local-witness-manifest.json'),JSON.stringify(receipt));
 assert.throws(()=>verifyLocalWitness(output),/witness-overlay-mismatch/);
});

import {installWitnessWorker,PASSIVE_BATCH,PREVIOUS_PASSIVE_BATCH,PREVIOUS_PASSIVE_V2_BATCH} from '../../tools/native-source-witness/worker.mjs';
import {BATCH} from '../../tools/native-source-witness/runner.mjs';
function mockChrome(stored={},options={passiveOnly:false}){
 const event=()=>{const listeners=new Set();return {listeners,addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:x=>{for(const f of listeners)f(x);}};};
 const runtime={id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,getManifest:()=>({version:'0.3.0'}),onMessage:event()};
 const chrome={runtime,storage:{local:{get:async key=>Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,stored[k]])),set:async value=>Object.assign(stored,value)}},tabs:{get:async id=>({id,url:'https://chatgpt.com/',incognito:false}),sendMessage:async()=>({ready:true}),onRemoved:event()},webNavigation:{getFrame:async()=>({documentId:'doc-one',url:'https://chatgpt.com/',documentLifecycle:'active',frameType:'outermost_frame'}),onCommitted:event(),onHistoryStateUpdated:event()},webRequest:Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>[k,event()]))};
 installWitnessWorker(chrome,options);
 const sender={id:runtime.id,url:runtime.getURL('source-witness.html')+'#1'};
 const message=(value,source=sender)=>new Promise(resolve=>{let accepted=false;for(const fn of runtime.onMessage.listeners)if(fn(value,source,resolve)===true)accepted=true;if(!accepted)resolve('ignored');});
 return {chrome,message,stored};
}
test('worker loss preserves spent ledger and reports unknown count, never zero or a retry',async()=>{
 const {message}=mockChrome({[BATCH]:{state:'reserved',result:null}});const report=await message({type:'SOURCE_WITNESS_READ'});assert.equal(report.requests,null);assert.equal(report.requestCountKnown,false);assert.equal(report.unspent,false);assert.equal(report.stages.identity.state,'PARTIAL');
 const repeat=await message({type:'SOURCE_WITNESS_ARM',tabId:1});assert.deepEqual(repeat,report);
});
test('preparation timeout retains bounded rejection evidence and its spent state without any active GET',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let elapsed=0;t.mock.method(performance,'now',()=>elapsed);
 t.mock.method(globalThis,'fetch',()=>{assert.fail('preparation must never request identity or directories');});
 const {chrome,message,stored}=mockChrome();await message({type:'SOURCE_WITNESS_ARM',tabId:1});
 const d={tabId:1,frameId:0,documentId:'doc-one',documentLifecycle:'active',initiator:'https://chatgpt.com',type:'xmlhttprequest',method:'GET',requestId:'PRIVATE_REQUEST',url:'https://chatgpt.com/backend-api/conversations/'+c,requestHeaders:[{name:'Authorization',value:'PRIVATE_TOKEN'}]};
 chrome.webRequest.onSendHeaders.emit(d);chrome.webRequest.onCompleted.emit({...d,statusCode:200,fromCache:true});
 elapsed=120000;t.mock.timers.tick(120000);const result=await message({type:'SOURCE_WITNESS_READ'});
 assert.equal(result.reason,'no-native-context-observed');assert.equal(result.requests,0);assert.equal(result.unspent,false);
 assert.equal(result.nativeObservation.preparationMs,120000);assert.equal(result.nativeObservation.events,2);
 assert.equal(result.nativeObservation.counts['context-header-missing'],1);assert.equal(result.nativeObservation.counts['completion-cached'],1);
 assert.equal(result.nativeObservation.counts['receipt-created'],0);assert.equal(result.nativeObservation.counts['association-started'],0);
 assert.equal(result.nativeObservation.memoryCache,'NOT_DETERMINABLE');assert.equal(result.nativeObservation.unmatchedTraffic,'NOT_OBSERVED');
 assert(!/PRIVATE|12345678|documentId|requestId|requestHeaders/.test(JSON.stringify(result)));
 const frozen=JSON.stringify(stored[BATCH]);chrome.webRequest.onSendHeaders.emit(d);
 assert.deepEqual(await message({type:'SOURCE_WITNESS_ARM',tabId:1}),result);assert.equal(JSON.stringify(stored[BATCH]),frozen);
 // A worker reinstalled against this same ledger can only read the final data.
 const reopened=mockChrome(stored);assert.deepEqual(await reopened.message({type:'SOURCE_WITNESS_ARM',tabId:1}),result);
});
test('legacy consumed timeout is read unchanged, never reconstructed from new diagnostic code',async()=>{
 const result={schema:BATCH,state:'BLOCKED',reason:'no-native-context-observed',requests:0,unspent:false};
 const {message,stored}=mockChrome({[BATCH]:{state:'finished',result}});assert.deepEqual(await message({type:'SOURCE_WITNESS_READ'}),result);
 assert.deepEqual(await message({type:'SOURCE_WITNESS_ARM',tabId:1}),result);assert.equal(stored[BATCH].result.nativeObservation,undefined);
});
const passiveArm={type:'SOURCE_WITNESS_ARM',tabId:1,batch:PASSIVE_BATCH};
const oldConsumed=()=>({state:'finished',result:{schema:BATCH,state:'BLOCKED',reason:'no-native-context-observed',requests:0,unspent:false}});
const oldPassiveConsumed=()=>({state:'finished',result:{schema:PREVIOUS_PASSIVE_BATCH,state:'BLOCKED',reason:'no-native-context-observed',mode:'PASSIVE_C2_ONLY',requests:0,unspent:false,nativeObservation:{events:0,navigations:0}}});
const oldPassiveV2Consumed=()=>({state:'finished',result:{schema:PREVIOUS_PASSIVE_V2_BATCH,state:'BLOCKED',reason:'no-native-context-observed',mode:'PASSIVE_C2_ONLY',requests:0,unspent:false,nativeObservation:{events:2,navigations:2,counts:{'request-prepared':1,'history-dropped-pending':1,'completion-untracked':1}}}});
const passiveRead={type:'SOURCE_WITNESS_READ',batch:PASSIVE_BATCH},passiveReturn={type:'SOURCE_WITNESS_RETURN',batch:PASSIVE_BATCH};
const priorLedgers=(active=oldConsumed())=>({[BATCH]:active,[PREVIOUS_PASSIVE_BATCH]:oldPassiveConsumed(),[PREVIOUS_PASSIVE_V2_BATCH]:oldPassiveV2Consumed()});
test('v3 accepts the finished 4f35c12b legacy active result without rewriting its missing unspent field',async t=>{
 // 90a006ac/4f35c12b unbound() saved this terminal record without unspent.
 // The outer finished marker was durable before read-back; absence is not true.
 const legacy=oldConsumed();delete legacy.result.unspent;
 const h=mockChrome(priorLedgers(legacy),{});t.after(()=>h.chrome.tabs.onRemoved.emit(1));
 const before=JSON.stringify(h.stored);assert.equal((await h.message(passiveRead)).reason,'not-started');
 assert.equal((await h.message(passiveArm)).state,'WAITING_NATIVE');
 assert.equal(Object.hasOwn(h.stored[BATCH].result,'unspent'),false);
 assert.equal(JSON.stringify({[BATCH]:h.stored[BATCH],[PREVIOUS_PASSIVE_BATCH]:h.stored[PREVIOUS_PASSIVE_BATCH],[PREVIOUS_PASSIVE_V2_BATCH]:h.stored[PREVIOUS_PASSIVE_V2_BATCH]}),before);
});
test('legacy compatibility rejects missing, unfinished and contradictory active records before target or reservation',async()=>{
 const legacy=oldConsumed();delete legacy.result.unspent;
 const cases=[undefined,{state:'reserved',result:legacy.result},... [true,null,0,undefined].map(unspent=>({state:'finished',result:{...legacy.result,unspent}})),{state:'finished',result:{...legacy.result,requests:null}},{state:'finished',result:{...legacy.result,schema:PREVIOUS_PASSIVE_BATCH}}];
 for(const active of cases){
  const h=mockChrome({...priorLedgers(),[BATCH]:active},{}),before=structuredClone(h.stored);
  h.chrome.tabs.get=async()=>assert.fail('incompatible history must stop before target access');
  for(const message of [passiveRead,passiveArm,passiveRead]){
   const result=await h.message(message);assert.equal(result.reason,'previous-consumed-context-result-required');assert.equal(result.unspent,true);assert.equal(result.requests,0);
  }
  assert.deepEqual(h.stored,before);assert.equal(h.stored[PASSIVE_BATCH],undefined);
  for(const e of Object.values(h.chrome.webRequest))assert.equal(e.listeners.size,0);
 }
});
test('v3 retains the old v1 prerequisite and never consumes or repairs a missing or uncertain v1',async()=>{
 for(const prior of [undefined,{state:'reserved',result:null},{...oldPassiveConsumed(),result:{...oldPassiveConsumed().result,unspent:true}}]){
  const records={[BATCH]:oldConsumed(),...(prior?{[PREVIOUS_PASSIVE_BATCH]:prior}:{})},before=structuredClone(records),h=mockChrome(records,{});
  h.chrome.tabs.get=async()=>assert.fail('invalid prior batch must stop before tab access');
  assert.equal((await h.message(passiveArm)).reason,'previous-consumed-passive-result-required');
  assert.deepEqual(records,before);assert.equal(records[PASSIVE_BATCH],undefined);
  for(const e of Object.values(h.chrome.webRequest))assert.equal(e.listeners.size,0);
 }
});
test('v3 requires a spent final v2 without rebuilding records or treating diagnostic counts as authority',async t=>{
 const v2=oldPassiveV2Consumed();
 for(const previous of [undefined,{state:'reserved',result:null},...['unspent','schema','requests','reason','mode'].map(field=>({state:'finished',result:{...v2.result,[field]:null}}))]){
  const h=mockChrome({...priorLedgers(),[PREVIOUS_PASSIVE_V2_BATCH]:previous},{}),before=structuredClone(h.stored);
  h.chrome.tabs.get=async()=>assert.fail('uncertain v2 must stop before target access');
  for(const message of [passiveRead,passiveArm])assert.equal((await h.message(message)).reason,'previous-consumed-v2-result-required');
  assert.deepEqual(h.stored,before);assert.equal(h.stored[PASSIVE_BATCH],undefined);
  for(const event of Object.values(h.chrome.webRequest))assert.equal(event.listeners.size,0);
 }
 // The consumed terminal is required; its event counts do not grant scope or
 // justify guessing the original event order.
 delete v2.result.nativeObservation;
 const h=mockChrome({...priorLedgers(),[PREVIOUS_PASSIVE_V2_BATCH]:v2},{});t.after(()=>h.chrome.tabs.onRemoved.emit(1));
 assert.equal((await h.message(passiveArm)).state,'WAITING_NATIVE');assert.deepEqual(h.stored[PREVIOUS_PASSIVE_V2_BATCH],v2);
});
test('old passive page messages cannot read, arm or return the v3 operation',async t=>{
 const h=mockChrome(priorLedgers(),{});t.after(()=>h.chrome.tabs.onRemoved.emit(1));
 const fresh=await h.message(passiveArm);assert.equal(fresh.state,'WAITING_NATIVE');assert.equal(fresh.startedHere,true);const before=JSON.stringify(h.stored);
 const anotherPage={id:h.chrome.runtime.id,url:h.chrome.runtime.getURL('source-witness.html')+'#99'};
 assert.equal((await h.message({...passiveArm,tabId:99},anotherPage)).startedHere,undefined);
 assert.equal((await h.message(passiveRead)).startedHere,undefined);assert(!before.includes('startedHere'));
 h.chrome.tabs.update=async()=>assert.fail('old page cannot focus the new observation');
 for(const type of ['SOURCE_WITNESS_ARM','SOURCE_WITNESS_READ','SOURCE_WITNESS_RETURN']){
  for(const batch of [undefined,PREVIOUS_PASSIVE_BATCH,PREVIOUS_PASSIVE_V2_BATCH,BATCH])assert.equal(await h.message({type,...(type==='SOURCE_WITNESS_ARM'?{tabId:1}:{}),...(batch?{batch}:{})}),'ignored');
 }
 assert.equal((await h.message(passiveRead)).state,'WAITING_NATIVE');assert.equal(JSON.stringify(h.stored),before);
});
test('return control selects the owner bound tab, never another result page hash or a new navigation',async t=>{
 t.mock.method(globalThis,'fetch',()=>assert.fail('return control must not fetch'));
 const h=mockChrome(priorLedgers(),{}),actions=[];
 h.chrome.tabs.get=async id=>({id,windowId:4,url:'https://chatgpt.com/',incognito:false,discarded:false});
 h.chrome.tabs.update=async(id,options)=>{actions.push(['tab',id,options]);return {id,windowId:4};};
 h.chrome.windows={update:async(id,options)=>actions.push(['window',id,options])};
 assert.equal((await h.message(passiveReturn)).state,'UNAVAILABLE');
 await h.message(passiveArm);const before=JSON.stringify(h.stored);
 const sender={id:h.chrome.runtime.id,url:h.chrome.runtime.getURL('source-witness.html')+'#99'};
 assert.equal(await h.message({...passiveReturn,tabId:99},sender),'ignored');
 assert.equal((await h.message(passiveReturn,sender)).state,'TARGET_SHOWN');
 assert.deepEqual(actions,[['tab',1,{active:true}],['window',4,{focused:true}]]);
 assert.equal(JSON.stringify(h.stored),before);
 let finishFocus;h.chrome.windows.update=async(id,options)=>{actions.push(['window',id,options]);return new Promise(resolve=>{finishFocus=resolve;});};
 const lateReturn=h.message(passiveReturn,sender);await new Promise(r=>setImmediate(r));assert(finishFocus);
 h.chrome.tabs.onRemoved.emit(1);await new Promise(r=>setImmediate(r));
 finishFocus();assert.equal((await lateReturn).state,'UNAVAILABLE');
 const final=JSON.stringify(h.stored);
 assert.equal((await h.message(passiveReturn,sender)).state,'UNAVAILABLE');
 assert.equal(actions.length,4);assert.equal(JSON.stringify(h.stored),final);
});
test('return control refuses discarded targets, elapsed deadlines and retirement during lookup',async t=>{
 let elapsed=0;t.mock.method(performance,'now',()=>elapsed);
 const h=mockChrome(priorLedgers(),{});await h.message(passiveArm);
 h.chrome.tabs.update=async()=>assert.fail('must not activate or reload a rejected target');
 h.chrome.windows={update:async()=>assert.fail('must not focus a rejected target')};
 h.chrome.tabs.get=async id=>({id,windowId:4,url:'https://chatgpt.com/',incognito:false,discarded:true});
 assert.equal((await h.message(passiveReturn)).state,'UNAVAILABLE');
 elapsed=120000;
 assert.equal((await h.message(passiveReturn)).state,'UNAVAILABLE');
 elapsed=0;let finishLookup;h.chrome.tabs.get=()=>new Promise(resolve=>{finishLookup=resolve;});
 const pending=h.message(passiveReturn);assert(finishLookup);
 h.chrome.tabs.onRemoved.emit(1);
 finishLookup({id:1,windowId:4,url:'https://chatgpt.com/',incognito:false,discarded:false});
 assert.equal((await pending).state,'UNAVAILABLE');
});
test('passive default requires the original consumed installation and a home target; RPC cannot select active mode',async()=>{
 const absent=mockChrome({},{});
 assert.equal((await absent.message(passiveArm)).reason,'previous-consumed-context-result-required');
 assert.equal(absent.stored[PASSIVE_BATCH],undefined);
 const previous=oldConsumed(),h=mockChrome(priorLedgers(previous),{});
 assert.deepEqual(await h.message({type:'SOURCE_WITNESS_PREVIOUS'}),{active:previous.result,passive:oldPassiveConsumed().result,passiveV2:oldPassiveV2Consumed().result});
 assert.equal(await h.message({type:'SOURCE_WITNESS_ARM',tabId:1}),'ignored');
 assert.equal(await h.message({...passiveArm,batch:BATCH}),'ignored');
 assert.equal(await h.message({type:'SOURCE_WITNESS_ARM',tabId:1,passiveOnly:false}),'ignored');
 const oldWorker=mockChrome();assert.equal(await oldWorker.message(passiveArm),'ignored');assert.deepEqual(oldWorker.stored,{});
 h.chrome.tabs.get=async id=>({id,url:frame.actualURL,incognito:false});
 assert.equal((await h.message(passiveArm)).reason,'select-chatgpt-home-no-request');
 assert.equal(h.stored[PASSIVE_BATCH],undefined);assert.deepEqual(h.stored[BATCH],previous);assert.deepEqual(h.stored[PREVIOUS_PASSIVE_BATCH],oldPassiveConsumed());assert.deepEqual(h.stored[PREVIOUS_PASSIVE_V2_BATCH],oldPassiveV2Consumed());
 for(const event of Object.values(h.chrome.webRequest))assert.equal(event.listeners.size,0);
});
test('passive association success or mismatch never enters identity, preserves the prior ledger, and consumes only the new batch',async t=>{
 const fetch=t.mock.method(globalThis,'fetch',()=>{assert.fail('the approved passive batch must never perform any GET');});
 for(const [matching,lateHistory]of [[true,false],[false,false],[true,true],[false,true]]){
  const previous=oldConsumed(),h=mockChrome(priorLedgers(structuredClone(previous)),{});
  t.after(()=>h.chrome.tabs.onRemoved.emit(1));
  assert.equal((await h.message(passiveArm)).state,'WAITING_NATIVE');
  const current={documentId:'doc-one',url:frame.actualURL,documentLifecycle:'active',frameType:'outermost_frame'};
  h.chrome.tabs.get=async id=>({id,url:current.url,incognito:false});h.chrome.webNavigation.getFrame=async()=>current;
  h.chrome.tabs.sendMessage=async(_id,query)=>({challenge:query.challenge,actualURL:query.actualURL,conversationId:matching?query.conversationId:d,association:'explicit-body-id'});
  h.chrome.webNavigation.onHistoryStateUpdated.emit({tabId:1,frameId:0,...current});
  const details={tabId:1,frameId:0,documentId:'doc-one',documentLifecycle:'active',initiator:'https://chatgpt.com',type:'xmlhttprequest',method:'GET',requestId:'PRIVATE_REQUEST',url:'https://chatgpt.com/backend-api/conversations/'+c,requestHeaders:[{name:'Chatgpt-Account-Id',value:'PRIVATE_CONTEXT'},{name:'Cookie',value:'PRIVATE_COOKIE'}]};
  h.chrome.webRequest.onSendHeaders.emit(details);await new Promise(r=>setImmediate(r));
  // Real report reached preparation before losing its pending request on
  // history. Exercise that order through the unchanged worker, not a new batch.
  if(lateHistory)h.chrome.webNavigation.onHistoryStateUpdated.emit({tabId:1,frameId:0,...current});
  h.chrome.webRequest.onCompleted.emit({...details,statusCode:200,fromCache:false,requestHeaders:undefined});await new Promise(r=>setImmediate(r));
  const result=await h.message(passiveRead);
  assert.equal(result.schema,PASSIVE_BATCH);assert.equal(result.mode,'PASSIVE_C2_ONLY');assert.equal(result.requests,0);assert.equal(result.decodedBytes,0);assert.equal(result.unspent,false);
  assert.equal(result.state,matching?'PARTIAL':'BLOCKED');assert.equal(result.stages.nativeAssociation.state,matching?'PASS':'BLOCKED');
  assert.equal(result.nativeObservation.counts['receipt-created'],1);assert.equal(result.nativeObservation.counts[matching?'association-passed':'association-rejected'],1);
  assert.equal(result.nativeObservation.counts['history-retained-pending'],lateHistory?1:0);assert.equal(result.nativeObservation.counts['completion-untracked'],0);
  for(const name of ['identity','currentSpace','ordinary','archived','projects','members','finalIdentity'])assert.equal(result.stages[name].state,'NOT_RUN');
  assert.equal(result.productionEnabled,false);assert.equal(result.decision,'BLOCKED');
  assert(!/PRIVATE|12345678|doc-one|worker-fixed-fetch/.test(JSON.stringify(result)));
  assert.deepEqual(h.stored[BATCH],previous);assert.deepEqual(h.stored[PREVIOUS_PASSIVE_BATCH],oldPassiveConsumed());assert.deepEqual(h.stored[PREVIOUS_PASSIVE_V2_BATCH],oldPassiveV2Consumed());assert.deepEqual(await h.message({type:'SOURCE_WITNESS_PREVIOUS'}),{active:previous.result,passive:oldPassiveConsumed().result,passiveV2:oldPassiveV2Consumed().result});
  assert.deepEqual(await h.message(passiveArm),result);
  assert.deepEqual(await mockChrome(h.stored,{}).message(passiveArm),result);
  for(const event of Object.values(h.chrome.webRequest))assert.equal(event.listeners.size,0);
 }
 assert.equal(fetch.mock.callCount(),0);
});
test('a late DOM answer after native document replacement cannot pass or mutate either ledger',async t=>{
 const fetch=t.mock.method(globalThis,'fetch',()=>{assert.fail('passive observation must never fetch');});
 const previous=oldConsumed(),h=mockChrome(priorLedgers(structuredClone(previous)),{});t.after(()=>h.chrome.tabs.onRemoved.emit(1));
 await h.message(passiveArm);
 const current={documentId:'doc-one',url:frame.actualURL,documentLifecycle:'active',frameType:'outermost_frame'};
 h.chrome.tabs.get=async id=>({id,url:current.url,incognito:false});h.chrome.webNavigation.getFrame=async()=>current;
 let release;
 h.chrome.tabs.sendMessage=async(_id,query)=>new Promise(resolve=>{release=()=>resolve({challenge:query.challenge,actualURL:query.actualURL,conversationId:query.conversationId,association:'explicit-body-id'});});
 h.chrome.webNavigation.onHistoryStateUpdated.emit({tabId:1,frameId:0,...current});
 const details={tabId:1,frameId:0,documentId:'doc-one',documentLifecycle:'active',initiator:'https://chatgpt.com',type:'xmlhttprequest',method:'GET',requestId:'private-request',url:'https://chatgpt.com/backend-api/conversations/'+c,requestHeaders:[{name:'Chatgpt-Account-Id',value:'private-context'}]};
 h.chrome.webRequest.onSendHeaders.emit(details);await new Promise(r=>setImmediate(r));
 h.chrome.webRequest.onCompleted.emit({...details,statusCode:200,fromCache:false});await new Promise(r=>setImmediate(r));assert(release,'DOM association should be pending');
 h.chrome.webNavigation.onCommitted.emit({tabId:1,frameId:0,...current,documentId:'doc-two'});await new Promise(r=>setImmediate(r));
 const result=await h.message(passiveRead);assert.equal(result.state,'BLOCKED');assert.equal(result.stages.nativeAssociation.state,'BLOCKED');assert.equal(result.requests,0);
 const saved=JSON.stringify(h.stored);release();h.chrome.webRequest.onCompleted.emit({...details,statusCode:200,fromCache:false});await new Promise(r=>setImmediate(r));
 assert.equal(JSON.stringify(h.stored),saved);assert.deepEqual(h.stored[BATCH],previous);assert.deepEqual(h.stored[PREVIOUS_PASSIVE_BATCH],oldPassiveConsumed());assert.deepEqual(h.stored[PREVIOUS_PASSIVE_V2_BATCH],oldPassiveV2Consumed());assert.equal(fetch.mock.callCount(),0);
});
test('late native events cannot extend passive preparation when the timer is delayed',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let elapsed=0;t.mock.method(performance,'now',()=>elapsed);
 t.mock.method(globalThis,'fetch',()=>{assert.fail('passive timeout must never fetch');});
 const previous=oldConsumed(),h=mockChrome(priorLedgers(structuredClone(previous)),{});
 await h.message(passiveArm);elapsed=120000;
 // No timer tick: the event callback must enforce the same elapsed deadline.
 h.chrome.webRequest.onSendHeaders.emit({tabId:1});
 const result=await h.message(passiveRead);
 assert.equal(result.reason,'no-native-context-observed');assert.equal(result.requests,0);assert.equal(result.unspent,false);
 assert.equal(result.nativeObservation.events,0);assert.equal(result.nativeObservation.preparationMs,120000);
 assert.deepEqual(h.stored[BATCH],previous);assert.deepEqual(h.stored[PREVIOUS_PASSIVE_BATCH],oldPassiveConsumed());assert.deepEqual(h.stored[PREVIOUS_PASSIVE_V2_BATCH],oldPassiveV2Consumed());assert(h.stored[PASSIVE_BATCH]);
});
test('passive worker loss cannot retry; only passive association outcome is unknown, active requests remain zero',async()=>{
 const previous=oldConsumed(),h=mockChrome({...priorLedgers(previous),[PASSIVE_BATCH]:{state:'reserved',result:null}},{});
 const result=await h.message(passiveRead);
 assert.equal(result.requests,0);assert.equal(result.requestUpperBound,0);assert.equal(result.requestCountKnown,true);assert.equal(result.unspent,false);
 assert.equal(result.stages.nativeAssociation.state,'PARTIAL');assert.equal(result.stages.identity.state,'NOT_RUN');
 assert.deepEqual(await h.message(passiveArm),result);assert.deepEqual(h.stored[BATCH],previous);assert.deepEqual(h.stored[PREVIOUS_PASSIVE_BATCH],oldPassiveConsumed());assert.deepEqual(h.stored[PREVIOUS_PASSIVE_V2_BATCH],oldPassiveV2Consumed());
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
 for(const id of ['result','run','download','environment','read','next-step','return-target','previous-batches'])elements.set(id,{disabled:false,checked:true,textContent:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
 const scope={location:{hash:'#1'},document:{getElementById:id=>elements.get(id)},window:{addEventListener(){}},setInterval:fn=>{intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn),chrome:{runtime:{sendMessage:message=>{
  if(message.type==='SOURCE_WITNESS_PREVIEW')return Promise.resolve({state:'READY',mode:'PASSIVE_C2_ONLY',batch:PASSIVE_BATCH,route:'home'});
  if(message.type==='SOURCE_WITNESS_ARM'){assert.equal(message.batch,PASSIVE_BATCH);return new Promise(resolve=>{completeArm=resolve;});}
  if(++reads===1)return Promise.resolve({state:'NOT_RUN',unspent:true});
  return new Promise(resolve=>{completeRead=resolve;});
 }}}};
 await runInNewContext('(async()=>{'+readFileSync(new URL('../../tools/native-source-witness/page.mjs',import.meta.url),'utf8')+'})()',scope);
 const arm=elements.get('run').handlers.click({isTrusted:true}),read=elements.get('read').handlers.click();await elements.get('read').handlers.click();assert.equal(reads,2);
 const final={schema:PASSIVE_BATCH,state:'PARTIAL',reason:'native-association-observed-identity-not-run'};completeRead(final);await read;completeArm({state:'RUNNING',unspent:false});await arm;
 assert.deepEqual(JSON.parse(elements.get('result').textContent),final);assert.equal(intervals.size,0);assert.equal(elements.get('download').disabled,false);
});
test('new page refuses an old worker and does not label its old report as the new batch',async()=>{
 for(const oldResult of [{state:'NOT_RUN',unspent:true},oldConsumed().result,oldPassiveConsumed().result,oldPassiveV2Consumed().result]){
 const elements=new Map(),sent=[];
 for(const id of ['result','run','download','environment','read','next-step','return-target','previous-batches'])elements.set(id,{disabled:false,checked:true,textContent:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
 const scope={location:{hash:'#1'},document:{getElementById:id=>elements.get(id)},window:{addEventListener(){}},setInterval:()=>assert.fail('no polling before preparation'),clearInterval(){},chrome:{runtime:{sendMessage:async message=>{
  sent.push(message);return message.type==='SOURCE_WITNESS_PREVIEW'?{state:'READY',mode:'PASSIVE_C2_ONLY',batch:oldResult.schema,route:'home'}:oldResult;
 }}}};
 await runInNewContext('(async()=>{'+readFileSync(new URL('../../tools/native-source-witness/page.mjs',import.meta.url),'utf8')+'})()',scope);
 assert.equal(elements.get('run').disabled,true);await elements.get('run').handlers.click({isTrusted:true});
 assert.equal(sent.some(m=>m.type==='SOURCE_WITNESS_ARM'),false);assert.match(elements.get('environment').textContent,/尚未加载被动观察版本/);
 assert.equal(JSON.parse(elements.get('result').textContent).state,'NOT_RUN');
 }
});
test('worker version change after passive preparation stops polling without claiming the batch unspent',async()=>{
 const elements=new Map(),polls=new Set();let reads=0;
 for(const id of ['result','run','download','environment','read','next-step','return-target','previous-batches'])elements.set(id,{disabled:false,checked:true,textContent:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
 const scope={location:{hash:'#1'},document:{getElementById:id=>elements.get(id)},window:{addEventListener(){}},setInterval:fn=>{polls.add(fn);return fn;},clearInterval:fn=>polls.delete(fn),chrome:{runtime:{sendMessage:async message=>{
  if(message.type==='SOURCE_WITNESS_PREVIEW')return {state:'READY',mode:'PASSIVE_C2_ONLY',batch:PASSIVE_BATCH,route:'home'};
  assert.equal(message.type,'SOURCE_WITNESS_READ');assert.equal(message.batch,PASSIVE_BATCH);return ++reads===1?{state:'WAITING_NATIVE',unspent:false}:oldConsumed().result;
 }}}};
 await runInNewContext('(async()=>{'+readFileSync(new URL('../../tools/native-source-witness/page.mjs',import.meta.url),'utf8')+'})()',scope);
 assert.equal(polls.size,1);await elements.get('read').handlers.click();assert.equal(polls.size,0);
 const result=JSON.parse(elements.get('result').textContent);assert.equal(result.state,'BLOCKED');assert.equal(result.unspent,false);assert.equal(result.reason,'passive-worker-version-changed-no-retry');
});
async function pageFlow({initial={state:'NOT_RUN',unspent:true},active={id:1,windowId:4},focused=true,startedHere=true,own=()=>({id:10,windowId:4}),readResult=value=>value}={}){
 const elements=new Map(),sent=[],updates=[],events={},polls=new Set();let current=initial;
 for(const id of ['result','run','download','environment','read','next-step','return-target','previous-batches'])elements.set(id,{disabled:true,textContent:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
 const scope={location:{hash:'#1'},document:{getElementById:id=>elements.get(id)},window:{addEventListener:(name,fn)=>{events[name]=fn;}},setInterval:fn=>{polls.add(fn);return fn;},clearInterval:fn=>polls.delete(fn),chrome:{windows:{getCurrent:async()=>({id:4,focused})},tabs:{getCurrent:own,query:async()=>[active],update:async(id,changes)=>{updates.push({id,...changes});}},runtime:{sendMessage:async message=>{
  sent.push(message);
  if(message.type==='SOURCE_WITNESS_PREVIEW')return {state:'READY',mode:'PASSIVE_C2_ONLY',batch:PASSIVE_BATCH,route:'home'};
  if(message.type==='SOURCE_WITNESS_ARM'){current={state:'WAITING_NATIVE',unspent:false};return {...current,...(startedHere?{startedHere:true}:{})};}
  if(message.type==='SOURCE_WITNESS_RETURN'){assert.equal(current.state,'WAITING_NATIVE');return {state:'TARGET_SHOWN'};}
  if(message.type==='SOURCE_WITNESS_READ')return readResult(current);
  assert.fail('unexpected message');
 }}}};
 await runInNewContext('(async()=>{'+readFileSync(new URL('../../tools/native-source-witness/page.mjs',import.meta.url),'utf8')+'})()',scope);
 return {elements,sent,updates,events,polls,setResult:value=>{current=value;},click:(id,isTrusted=true)=>elements.get(id).handlers.click({isTrusted})};
}
const pageFinal={schema:PASSIVE_BATCH,state:'BLOCKED',reason:'no-native-context-observed',unspent:false};
test('one trusted start prepares then returns once; final result is automatic without re-arming',async()=>{
 const h=await pageFlow();assert.equal(h.elements.get('run').disabled,false);assert.deepEqual(h.sent.map(m=>m.type),['SOURCE_WITNESS_PREVIEW','SOURCE_WITNESS_READ']);
 await h.click('run',false);assert.equal(h.sent.length,2);
 const start=h.click('run');await h.click('run');await start;
 assert.deepEqual(h.sent.slice(2).map(m=>m.type),['SOURCE_WITNESS_ARM','SOURCE_WITNESS_RETURN']);
 assert.equal(h.elements.get('run').disabled,true);assert.equal(h.polls.size,1);
 h.setResult(pageFinal);await [...h.polls][0]();await new Promise(r=>setImmediate(r));
 assert.deepEqual(h.updates,[{id:10,active:true}]);assert.equal(h.polls.size,0);
 await h.click('read');await h.click('run');await new Promise(r=>setImmediate(r));
 assert.equal(h.updates.length,1);assert.equal(h.sent.filter(m=>m.type==='SOURCE_WITNESS_ARM').length,1);
 assert.deepEqual(JSON.parse(h.elements.get('result').textContent),pageFinal);
});
test('automatic result display does not steal another tab/window or run on reopening a spent result',async()=>{
 for(const options of [{active:{id:99,windowId:4}},{active:{id:1,windowId:8}},{focused:false}]){
  const h=await pageFlow(options);await h.click('run');h.setResult(pageFinal);await h.click('read');await new Promise(r=>setImmediate(r));
  assert.deepEqual(h.updates,[]);assert.equal(h.elements.get('download').disabled,false);
 }
 const contender=await pageFlow({startedHere:false});await contender.click('run');contender.setResult(pageFinal);await contender.click('read');await new Promise(r=>setImmediate(r));
 assert.deepEqual(contender.updates,[]);assert.equal(contender.sent.some(m=>m.type==='SOURCE_WITNESS_RETURN'),false);
 const reopened=await pageFlow({initial:pageFinal});await reopened.click('run');await reopened.click('read');await new Promise(r=>setImmediate(r));
 assert.deepEqual(reopened.updates,[]);assert.equal(reopened.sent.some(m=>['SOURCE_WITNESS_ARM','SOURCE_WITNESS_RETURN'].includes(m.type)),false);
});
test('uncertain initial result cannot start and unloading suppresses a late completion focus',async()=>{
 const unknown=await pageFlow({initial:{state:'BLOCKED',reason:'extension-connection-lost-do-not-repeat'}});await unknown.click('run');assert.equal(unknown.elements.get('run').disabled,true);assert.equal(unknown.sent.some(m=>m.type==='SOURCE_WITNESS_ARM'),false);
 let resolveOwn;
 const h=await pageFlow({own:()=>new Promise(resolve=>{resolveOwn=resolve;})});await h.click('run');h.setResult(pageFinal);await h.click('read');
 h.events.pagehide();resolveOwn({id:10,windowId:4});await new Promise(r=>setImmediate(r));assert.deepEqual(h.updates,[]);
});
test('incompatible prior history is explained before clicking and cannot invite repeated starts',async()=>{
 for(const reason of ['previous-consumed-context-result-required','previous-consumed-passive-result-required','previous-consumed-v2-result-required']){
  const h=await pageFlow({initial:{state:'NOT_RUN',reason,requests:0,unspent:true}});
  assert.equal(h.elements.get('run').disabled,true);assert.equal(h.elements.get('previous-batches').open,true);
  assert.match(h.elements.get('next-step').textContent,/旧批次记录不匹配/);assert.match(h.elements.get('next-step').textContent,/无需打开聊天/);
  await h.click('run');await h.click('read');await h.click('run');assert.equal(h.sent.some(m=>m.type==='SOURCE_WITNESS_ARM'),false);assert.equal(h.elements.get('run').disabled,true);
 }
});
test('a preflight read finishing after ARM cannot erase waiting state or stop automatic result reads',async()=>{
 let reads=0,release;
 const h=await pageFlow({readResult:value=>++reads===2?new Promise(resolve=>{release=()=>resolve(value);}):value});
 const beforeStart=h.click('read');await h.click('run');assert.equal(h.polls.size,1);
 release();await beforeStart;
 assert.equal(JSON.parse(h.elements.get('result').textContent).state,'WAITING_NATIVE');assert.equal(h.polls.size,1);assert.equal(h.elements.get('run').disabled,true);
 h.setResult(pageFinal);await [...h.polls][0]();await new Promise(r=>setImmediate(r));
 assert.deepEqual(JSON.parse(h.elements.get('result').textContent),pageFinal);assert.equal(h.polls.size,0);
});
test('content bridge stays ready across BFCache and removes liveness on final unload',()=>{
 const listeners=new Set(),events={};let stopped=0;const window={addEventListener:(name,fn)=>events[name]=fn};window.top=window;
 runInNewContext(readFileSync(new URL('../../tools/native-source-witness/content.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),{window,location:{origin:'https://chatgpt.com'},document:{},CHATGPT_OBSERVED_PROFILE:{},createContextAssociationBridge:()=>({stop:()=>stopped++}),chrome:{runtime:{id:'private',onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}}});
 events.pagehide({persisted:true});assert.equal(stopped,0);let response;for(const fn of listeners)fn({type:'SOURCE_WITNESS_READY'},{id:'private'},value=>response=value);assert.equal(response.ready,true);
 events.pagehide({persisted:false});assert.equal(stopped,1);assert.equal(listeners.size,0);
});

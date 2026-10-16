import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {assertJ4EvidenceRevoked,assertJ4CurrentHistory,assertJ4RecoveryView,assertJ4ReadBudget,observeJ4RecoveryViews,pollJ4EvidenceRecovery} from './j4-evidence-recovery.mjs';
import {J4_SEND_C} from './fixtures/j4-interruption.mjs';
import {contextScope} from './j4-package-journey.mjs';

// Synthetic values here test only the independent runner oracle. They are never
// inserted into a browser, repository, grant, owner, fixture, or packaged build.
function sample(){
 const scopeKey='scope',oldEvent={id:'old_event',sourceId:'old_history',generation:'g',messageId:'m1',conversationId:J4_SEND_C,sentAt:'2026-10-01T00:00:00.000Z'},oldHint={id:'old_hint',sourceId:'old_ack',generation:'g',messageId:'old_ack_message',firstObservedAt:'2026-10-02T00:00:00.000Z',candidateInterval:{from:'2026-10-02T00:00:00.000Z',through:'2026-10-02T00:00:00.000Z'}};
 const before={scopeKey,revision:3,sources:{old_history:{id:'old_history',revoked:false,generation:'g',sourceRevision:1},old_ack:{id:'old_ack',revoked:false,generation:'g',sourceRevision:1}},events:{old_event:oldEvent},hints:{old_hint:oldHint},coverage:{}};
 const after=structuredClone(before);after.revision++;for(const source of Object.values(after.sources))source.revoked=true;
 return {before,after};
}
function historical(){
 const {before,after}=sample();after.sources.fresh={id:'fresh',generation:'new',revoked:false,channel:'host-evidence',codecVersion:2};
 after.events.fresh={id:'fresh',sourceId:'fresh',generation:'new',conversationId:J4_SEND_C,messageId:'m1',sentAt:before.events.old_event.sentAt,precision:'millisecond',role:'user',kind:'new-send',sendState:'committed',actorVerified:true,actorScopeKey:before.scopeKey};
 return {before,after,body:['m1'],rows:[{id:'m1',at:before.events.old_event.sentAt}]};
}
test('repair oracle allows only source revocation while old event, ACK and interval bytes remain immutable',()=>{
 const {before,after}=sample();assertJ4EvidenceRevoked(before,after);
 for(const mutate of [s=>s.sources.old_ack.revoked=false,s=>s.sources.old_ack.sourceRevision++,s=>s.events.old_event.sentAt='2026-10-15T00:00:00.000Z',s=>s.hints.old_hint.firstObservedAt='2026-10-15T00:00:00.000Z',s=>s.hints.old_hint.sourceId='fresh',s=>delete s.events.old_event,s=>s.scopeKey='team']){
  const changed=structuredClone(after);mutate(changed);assert.throws(()=>assertJ4EvidenceRevoked(before,changed));
 }
});
test('current-body oracle rejects out-of-body, invented time, predecessor reuse and old ACK duplication',()=>{
 const s=historical();assert.equal(assertJ4CurrentHistory(s.before,s.after,s.body,s.rows).length,1);
 const changes=[v=>v.events.fresh.messageId='outside',v=>v.events.fresh.sentAt='2026-10-15T00:00:00.000Z',v=>v.events.fresh.sourceId='old_history',v=>v.sources.fresh.revoked=true,v=>v.sources.fresh.codecVersion=1,v=>v.events.fresh.actorScopeKey='team',v=>v.events.fresh.generation='wrong',v=>v.hints.copy={...v.hints.old_hint,id:'copy',sourceId:'fresh'}];
 for(const change of changes){const after=structuredClone(s.after);change(after);assert.throws(()=>assertJ4CurrentHistory(s.before,after,s.body,s.rows));}
 assert.throws(()=>assertJ4CurrentHistory(s.before,s.after,['m1','not-observed'],s.rows));
 assert.throws(()=>assertJ4CurrentHistory(s.before,s.before,s.body,s.rows));
});
test('actual UI projection requires the same scope, current native ref, evidence revision and segment',()=>{
 const view={scope:'personal',currentRef:J4_SEND_C,currentRefRoute:J4_SEND_C,evidenceRevision:'8:4',currentSegment:null};
 const expected={scope:'personal',revision:4,segment:null};assert.equal(assertJ4RecoveryView(view,expected),view);
 for(const delta of [{scope:'team'},{currentRef:'other'},{currentRefRoute:'other'},{evidenceRevision:'8:3'},{currentSegment:0}])assert.throws(()=>assertJ4RecoveryView({...view,...delta},expected));
 assert.throws(()=>assertJ4RecoveryView(null,expected));
 assertJ4RecoveryView({...view,currentSegment:0,evidenceRevision:'8:5'},{...expected,revision:5,segment:0});
});
test('persisted budget oracle keeps the original 12 GET and 3 attempt limits',()=>{
 const budget={checksumValid:true,startedAt:1000,lastAt:1100,requests:12,attemptCounts:[3,3]};assert.equal(assertJ4ReadBudget(budget),budget);
 for(const delta of [{checksumValid:false},{requests:13},{requests:0},{attemptCounts:[4]},{attemptCounts:[0]},{lastAt:999},{startedAt:NaN}])assert.throws(()=>assertJ4ReadBudget({...budget,...delta}));
});
test('passive view witness returns the unchanged original promise and makes no extra RPC',async()=>{
 const saved=Object.fromEntries(['location','chrome','j4RecoveryViews'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const scope=fixtureScope;
 const reply={ok:true,state:'ready',page:{scope,evidenceRevision:'8:5',currentRef:{id:J4_SEND_C,segment:0},current:{refId:J4_SEND_C}}},promise=Promise.resolve(reply),calls=[];
 try{
  Object.defineProperty(globalThis,'location',{configurable:true,value:{protocol:'chrome-extension:'}});
  Object.defineProperty(globalThis,'chrome',{configurable:true,value:{runtime:{sendMessage(...args){calls.push(args);return promise;}}}});
  delete globalThis.j4RecoveryViews;observeJ4RecoveryViews();const message={type:'HOST_UI_VIEW'};
  assert.equal(chrome.runtime.sendMessage(message),promise);await promise;await Promise.resolve();
  assert.deepEqual(calls,[[message]]);assert.equal(globalThis.j4RecoveryViews.length,1);assert.equal(reply.page.currentRef.segment,0);
  assertJ4RecoveryView(globalThis.j4RecoveryViews[0],{scope,revision:5,segment:0});
  const wrapped=chrome.runtime.sendMessage;observeJ4RecoveryViews();assert.equal(chrome.runtime.sendMessage,wrapped);
 }finally{for(const [name,descriptor]of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
const actualScope=contextScope('account-host-personal'),fixtureScope=JSON.stringify([actualScope.provider,actualScope.accountId,actualScope.organizationId]);
const readyReply=segment=>({ok:true,state:'ready',page:{scope:fixtureScope,evidenceRevision:'8:5',currentRef:{id:J4_SEND_C,segment},current:{refId:J4_SEND_C}}});
function observerVM(send){
 const context=vm.createContext({location:{protocol:'chrome-extension:'},chrome:{runtime:{sendMessage:send}},Date});
 vm.runInContext('('+observeJ4RecoveryViews.toString()+')()',context);return context;
}
test('actual observer in VM rejects secret segment objects and million-byte strings without copying or altering the Promise',async()=>{
 for(const segment of [{secret:'S'.repeat(1000000)},'S'.repeat(1000000),undefined,NaN,Infinity,-1,1000001,0.5]){
  const reply=readyReply(segment),promise=Promise.resolve(reply);let calls=0;
  const context=observerVM(()=>{calls++;return promise;});assert.equal(context.chrome.runtime.sendMessage({type:'HOST_UI_VIEW'}),promise);
  await promise;await Promise.resolve();assert.equal(calls,1);assert.equal(context.j4RecoveryViews.length,0);assert.equal(JSON.stringify(context.j4RecoveryViews),'[]');
 }
 for(const segment of [null,0,1000000]){
  const reply=readyReply(segment),promise=Promise.resolve(reply),context=observerVM(()=>promise);
  assert.equal(context.chrome.runtime.sendMessage({type:'HOST_UI_VIEW'}),promise);await promise;await Promise.resolve();
  assert.equal(context.j4RecoveryViews.length,1);assert.equal(context.j4RecoveryViews[0].currentSegment,segment);assert(JSON.stringify(context.j4RecoveryViews).length<512);
 }
});
test('actual observer in VM accepts only scoped scalar fields and reads getter values once',async()=>{
 for(const mutate of [reply=>reply.page.scope={secret:'S'.repeat(1000000)},reply=>reply.page.scope='S'.repeat(1000000),reply=>reply.page.scope='personal',reply=>reply.page.scope=fixtureScope.replace('chatgpt','other'),reply=>reply.page.currentRef.id={toString:()=>J4_SEND_C,secret:'S'.repeat(1000000)},reply=>reply.page.current.refId={toString:()=>J4_SEND_C,secret:'S'.repeat(1000000)}]){
  const reply=readyReply(0);mutate(reply);const promise=Promise.resolve(reply),context=observerVM(()=>promise);
  assert.equal(context.chrome.runtime.sendMessage({type:'HOST_UI_VIEW'}),promise);await promise;await Promise.resolve();assert.equal(context.j4RecoveryViews.length,0);
 }
 const reply=readyReply(0);let scopeReads=0,segmentReads=0;
 Object.defineProperty(reply.page,'scope',{get(){return ++scopeReads===1?fixtureScope:{secret:'S'.repeat(1000000)};}});
 Object.defineProperty(reply.page.currentRef,'segment',{get(){return ++segmentReads===1?0:{secret:'S'.repeat(1000000)};}});
 const promise=Promise.resolve(reply),context=observerVM(()=>promise);context.chrome.runtime.sendMessage({type:'HOST_UI_VIEW'});await promise;await Promise.resolve();
 assert.equal(scopeReads,1);assert.equal(segmentReads,1);assert.equal(context.j4RecoveryViews.length,1);assert.equal(context.j4RecoveryViews[0].scope,fixtureScope);assert.equal(context.j4RecoveryViews[0].currentSegment,0);
});
test('actual observer in VM preserves synchronous throw, rejected Promise and callback failure isolation',async()=>{
 const failure=Error('original-send-failure');let calls=0;
 const throwing=observerVM(()=>{calls++;throw failure;});assert.throws(()=>throwing.chrome.runtime.sendMessage({type:'HOST_UI_VIEW'}),error=>error===failure);assert.equal(calls,1);
 const rejected=Promise.reject(failure),rejection=assert.rejects(rejected,error=>error===failure),context=observerVM(()=>rejected);
 assert.equal(context.chrome.runtime.sendMessage({type:'HOST_UI_VIEW'}),rejected);await rejection;assert.equal(context.j4RecoveryViews.length,0);
 const reply=readyReply(0);Object.defineProperty(reply.page.currentRef,'segment',{get(){throw Error('diagnostic-getter-failure');}});
 const success=Promise.resolve(reply),brokenCopy=observerVM(()=>success);assert.equal(brokenCopy.chrome.runtime.sendMessage({type:'HOST_UI_VIEW'}),success);assert.equal(await success,reply);await Promise.resolve();assert.equal(brokenCopy.j4RecoveryViews.length,0);
});
function pollClock(){
 let now=0,serial=0;const timers=new Map(),cancelled=[];
 return {timers,cancelled,options:{now:()=>now,schedule:(callback,ms)=>{const id=++serial;timers.set(id,{callback,ms,at:now+ms});return id;},cancel:id=>{cancelled.push(id);timers.delete(id);}},set:value=>{now=value;},fire:()=>{for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.callback();}}};
}
test('actual poll in VM bounds a hung read at the original absolute 15s and never polls after timeout',async()=>{
 const clock=pollClock(),context=vm.createContext({performance:{now:clock.options.now},setTimeout:clock.options.schedule,clearTimeout:clock.options.cancel});
 const actual=vm.runInContext('('+pollJ4EvidenceRecovery.toString()+')',context);let reads=0,complete;
 const pending=actual(()=>{reads++;return new Promise(resolve=>{complete=resolve;});},'hung-read'),failure=assert.rejects(pending,/J4-evidence-recovery-timeout:hung-read/);
 assert.equal([...clock.timers.values()][0].ms,15000);clock.set(15000);clock.fire();await failure;
 complete(true);await Promise.resolve();await Promise.resolve();assert.equal(reads,1);assert.equal(clock.timers.size,0);assert(clock.cancelled.length>0);
});
test('absolute poll rejects delayed timer success at and beyond 15s and cleans the deadline timer',async()=>{
 for(const at of [15000,20000]){
  const clock=pollClock();await assert.rejects(pollJ4EvidenceRecovery(async()=>{clock.set(at);return true;},'late-success',clock.options),/J4-evidence-recovery-timeout:late-success/);assert.equal(clock.timers.size,0);
 }
 const clock=pollClock(),samples=[0,0,14999,15000];clock.options.now=()=>samples.shift()??15000;
 await assert.rejects(pollJ4EvidenceRecovery(async()=>true,'late-final-check',clock.options),/J4-evidence-recovery-timeout:late-final-check/);assert.equal(clock.timers.size,0);
});
test('poll cleans timers on early success or read failure and keeps retries inside one window',async()=>{
 const immediate=pollClock();assert.equal(await pollJ4EvidenceRecovery(async()=>true,'early',immediate.options),true);assert.equal(immediate.timers.size,0);
 const failed=pollClock(),error=Error('read-failed');await assert.rejects(pollJ4EvidenceRecovery(()=>{throw error;},'read-error',failed.options),failure=>failure===error);assert.equal(failed.timers.size,0);
 const retried=pollClock();let reads=0;const result=pollJ4EvidenceRecovery(async()=>++reads===2,'retry',retried.options);await Promise.resolve();
 assert.deepEqual([...retried.timers.values()].map(timer=>timer.ms),[15000,50]);retried.set(50);retried.fire();assert.equal(await result,true);assert.equal(reads,2);assert.equal(retried.timers.size,0);
});
test('new slice faults only an existing valid Evidence root and repairs through real production UI',async()=>{
 const source=await readFile(new URL('./j4-evidence-recovery.mjs',import.meta.url),'utf8');
 assert.equal((source.match(/'readwrite'/g)??[]).length,1);
 for(const value of ["const damaged={...root,checksum:'0'.repeat(64)}","root.checksum!==digest(root.payload)",'root.payload.revision!==expectedRevision',"changedFields:['checksum']",'freeEvidenceKey(scopeKey)',"name:'修复活跃度记录'",'repaired.nativeDigest,before.nativeDigest','repaired.continuations,before.continuations','assertJ4EvidenceRevoked(before.evidence,repaired.evidence)','assert.deepEqual(repaired.evidence[table],before.evidence[table])',"assert.deepEqual(preRepairContinuationStates,['complete'])"])assert(source.includes(value),value);
 for(const forbidden of ['.recover(','.apply(','.mutate(','.start(',"type:'HOST_UI_VIEW'",'hostObservationGate','dispatchEvent(','TestScopeProvider','setPrincipal(','setSelectedContext(','releaseInterruption(','setTimeout(resolve,30000)','Date.now='])assert(!source.includes(forbidden),forbidden);
 assert(source.includes("db.transaction('b23_views','readonly')"));assert(source.includes('budget.startedAt+30001-Date.now()'));
 assert(source.includes('await a.reload()'));assert(source.includes('previousGrant:preRebindGrant'));assert(source.includes('completedReads().length>repeatReadStart'));
 assert(source.includes('assert.deepEqual(repeated.evidence,acknowledged.evidence)'));assert(source.includes('assert.deepEqual((await inspect(team)).evidence,teamBefore.evidence)'));
});
test('additive J4 wiring preserves original two sends and all old step names with exactly one new native send',async()=>{
 const source=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');
 const call=source.indexOf('report.evidenceRecovery=await runJ4EvidenceRecovery(');
 assert(call>source.indexOf('await runJ4JointInterruption('));assert(call<source.indexOf("mark(a,'J4_CONTINUOUS_NATIVE_DRAFT')"));
 assert(source.includes("assert.equal(server.snapshot().actions['send-intent']??0,2)"));assert(source.includes('assert.equal(server.snapshot().interruption.accepts,2)'));
 assert(source.includes("assert.equal(server.snapshot().actions['send-intent']??0,3)"));assert(source.includes('assert.equal(server.snapshot().interruption.accepts,3)'));assert(source.includes('assert.equal(report.evidenceRecovery.additionalNativeSends,1)'));
 assert(source.includes("'j4-evidence-recovery.mjs','j4-joint-interruption.mjs'"));
 assert(source.includes("return steps.some(s=>s.status==='FAIL')?'FAIL':'PARTIAL_J4_NOT_ACCEPTED'"));assert(source.includes("release:'NOT_RELEASE_READY'"));
});

import {modernExpectedWorld} from './expected/modern.mjs';
import {J4_REF} from './fixtures/j4-assets.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
async function actualRecoveryNavigation(page,server){
 const source=await readFile(new URL('./j4-evidence-recovery.mjs',import.meta.url),'utf8'),start=source.indexOf(' async function navigate(ref){'),end=source.indexOf('\n async function body()',start);
 assert(start>=0&&end>start,'actual-recovery-navigation-boundaries');
 return Function('a','native','server','modernExpectedWorld','J4_SEND_C','J4_REF','assert','return ('+source.slice(start,end).trim()+');')(page,async()=>page.calls.push('native-controls'),server,modernExpectedWorld,J4_SEND_C,J4_REF,assert);
}
async function navigationFixture(t){
 const server=await createVariantHostFixtureServer({profile:'MODERN',journey:'J4',interruption:true});t.after(()=>server.close());
 const visit=await fetch(server.url),headers={Cookie:visit.headers.get('set-cookie').split(';')[0]};
 const windowed=await(await fetch(server.origin+'/backend-api/conversations?offset=2&limit=25',{headers})).json();assert.equal(windowed.windowed,true);
 assert.deepEqual(windowed.items.map(row=>row.id),modernExpectedWorld.afterScrollIds);assert(!windowed.items.some(row=>[J4_REF,J4_SEND_C].includes(row.id)));
 // Exercise the unchanged native search input callback and its real local
 // server response; DOM/Playwright actions remain explicit Node test doubles.
 const nodes=[],results={replaceChildren(){nodes.length=0;},append(node){nodes.push(node);}},input={},dialog={close(){}};
 const native=await readFile(new URL('./fixtures/native.mjs',import.meta.url),'utf8'),start=native.indexOf("$('#search-dialog input').oninput = "),end=native.indexOf("\n$('#new-project')",start);assert(start>=0&&end>start);
 const $=selector=>({'#search-dialog input':input,'#search-dialog .results':results,'#search-dialog':dialog})[selector];
 Function('$','fetch','document',native.slice(start,end))($,path=>fetch(server.origin+path,{headers}),{createElement:()=>({})});
 const page={calls:[],url:null,locator(selector){return {
  async click(){page.calls.push(['click',selector]);if(selector==='#search-button')return;if(selector.startsWith('aside '))throw Error('native-history-target-unloaded');const path=/^#search-dialog a\[href="([^"]+)"\]$/.exec(selector)?.[1];assert(path,'only-native-search-link');const matches=nodes.filter(n=>n.href===path);assert.equal(matches.length,1,'unique-existing-native-search-href');matches[0].onclick();const response=await fetch(server.origin+'/native/route?path='+encodeURIComponent(path),{headers}),route=await response.json();assert.equal(route.conversationId,path.slice(3));page.url=server.origin+path;},
  async fill(value){assert.equal(selector,'#search-dialog input');page.calls.push(['fill',value]);await input.oninput({target:{value}});},
 };},async waitForURL(url){page.calls.push(['waitForURL',url]);assert.equal(page.url,url);}};
 return {server,page,headers,nodes};
}
test('actual Evidence recovery navigation uses existing native search links when MODERN has unloaded both history targets',async t=>{
 const h=await navigationFixture(t),navigate=await actualRecoveryNavigation(h.page,h.server);
 const response=await fetch(h.server.origin+'/native/j4/send',{method:'POST',headers:{...h.headers,'Content-Type':'application/json'},body:JSON.stringify({text:'Node fixture title change',rename:true})});assert.equal(response.status,200);const renamed=await response.json();assert.notEqual(renamed.title,modernExpectedWorld.conversations.find(row=>row.id===J4_SEND_C).title);
 await navigate(J4_REF);await navigate(J4_SEND_C);
 assert.deepEqual(h.page.calls.filter(row=>Array.isArray(row)&&row[0]==='fill').map(row=>row[1]),[modernExpectedWorld.conversations.find(row=>row.id===J4_REF).title,renamed.title]);
 assert.deepEqual(h.page.calls.filter(row=>Array.isArray(row)&&row[0]==='waitForURL').map(row=>row[1]),[h.server.origin+'/c/'+J4_REF,h.server.origin+'/c/'+J4_SEND_C]);
 assert.equal(h.server.snapshot().interruption.accepts,1,'navigation creates no extra native send');
});
test('actual Evidence recovery navigation rejects missing titles and unknown targets without falling back or creating links',async t=>{
 const h=await navigationFixture(t);
 for(const title of [undefined,null,'',' ',{},'x'.repeat(201)]){h.page.calls.length=0;const server={origin:h.server.origin,snapshot:()=>({interruption:{title}})},navigate=await actualRecoveryNavigation(h.page,server);await assert.rejects(navigate(J4_SEND_C),/native-search-title/);assert(!h.page.calls.some(row=>Array.isArray(row)));}
 const navigate=await actualRecoveryNavigation(h.page,h.server);await assert.rejects(navigate('unknown-ref'),/native-search-target/);
});
test('actual Evidence recovery navigation refuses an incorrect current title rather than using a stale expected name',async t=>{
 const h=await navigationFixture(t),server={origin:h.server.origin,snapshot:()=>({interruption:{title:'Wrong native title'}})},navigate=await actualRecoveryNavigation(h.page,server);
 await assert.rejects(navigate(J4_SEND_C),/unique-existing-native-search-href/);assert.equal(h.page.url,null);assert.equal(h.nodes.length,0);assert(!h.page.calls.some(row=>Array.isArray(row)&&row[0]==='waitForURL'));
});

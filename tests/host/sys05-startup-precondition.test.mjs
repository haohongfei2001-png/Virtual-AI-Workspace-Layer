import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createSys05StartupDeadline,inspectSys05Worker,waitForSys05Worker} from './sys05-startup-precondition.mjs';
const exact='chrome-extension://expected/extension/worker.mjs';
const ready={extensionId:'expected',expectedIdentity:true,message:true,connect:true,sendHeaders:true,completed:true,requestError:true,redirect:true};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 let at=0,id=0;const timers=new Map(),workers=[],waits=[],evaluations=[];
 const clock={now:()=>at,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:at+ms});return key;},cancel:key=>timers.delete(key)};
 const deadline=createSys05StartupDeadline(clock);
 const worker=(url=exact,state=ready)=>({url:()=>url,async evaluate(fn,arg){evaluations.push({fn,arg});return typeof state==='function'?state():state;}});
 const context={serviceWorkers:()=>workers,waitForEvent(name,{predicate,timeout}){assert.equal(name,'serviceworker');return new Promise((resolve,reject)=>{const pending={predicate,resolve,reject};pending.timer=clock.schedule(()=>{waits.splice(waits.indexOf(pending),1);reject(Error('fixture-event-timeout'));},timeout);waits.push(pending);});}};
 function emit(value){workers.push(value);for(const pending of [...waits])if(pending.predicate(value)){clock.cancel(pending.timer);waits.splice(waits.indexOf(pending),1);pending.resolve(value);}}
 async function advance(value){at+=value;for(const [key,timer] of [...timers].sort((a,b)=>a[1].at-b[1].at))if(timer.at<=at&&timers.has(key)){timers.delete(key);timer.fn();}await flush();}
 return {clock,deadline,context,workers,waits,evaluations,worker,emit,advance,setAt:value=>{at=value;}};
}
test('only the exact existing extension worker is read; all readiness listeners are required',async()=>{
 const f=fixture();f.workers.push(f.worker('chrome-extension://other/extension/worker.mjs'),f.worker('chrome-extension://expected/unrelated.mjs'),f.worker());
 const result=await waitForSys05Worker(f.context,'expected',f.deadline);
 assert.equal(result.kind,'EXACT_WORKER_IDENTITY_AND_REGISTERED_LISTENERS');assert.equal(result.exactScriptMatched,true);assert.equal(result.identityMatched,true);assert.equal(result.registeredHandlers.length,6);assert(!JSON.stringify(result).includes('chrome-extension:'));assert(!Object.hasOwn(result,'state'));assert.equal(f.evaluations.length,1);assert.equal(f.evaluations[0].fn,inspectSys05Worker);assert.equal(f.evaluations[0].arg,'expected');assert.equal(f.waits.length,0);
});
test('absent worker fails within the original absolute budget before any readiness evaluation',async()=>{
 const f=fixture(),pending=waitForSys05Worker(f.context,'expected',f.deadline),rejected=assert.rejects(pending,/sys05-timeout:exact-extension-worker/);await flush();await f.advance(30000);await rejected;assert.equal(f.evaluations.length,0);
});
test('wrong-extension and same-extension wrong-script events cannot satisfy discovery',async()=>{
 const f=fixture(),pending=waitForSys05Worker(f.context,'expected',f.deadline),rejected=assert.rejects(pending,/sys05-timeout:exact-extension-worker/);await flush();f.emit(f.worker('chrome-extension://other/extension/worker.mjs'));f.emit(f.worker('chrome-extension://expected/other.mjs'));await flush();assert.equal(f.waits.length,1);assert.equal(f.evaluations.length,0);await f.advance(30000);await rejected;
});
test('an exact worker arriving at the deadline is not accepted',async()=>{
 const f=fixture(),pending=waitForSys05Worker(f.context,'expected',f.deadline),rejected=assert.rejects(pending,/sys05-timeout:exact-extension-worker/);await flush();f.setAt(30000);f.emit(f.worker());await rejected;assert.equal(f.evaluations.length,0);
});
test('worker identity is independently checked and an event predicate cannot be bypassed',async()=>{
 const f=fixture();f.workers.push(f.worker(exact,{...ready,extensionId:'other'}));await assert.rejects(waitForSys05Worker(f.context,'expected',f.deadline),/wrong-worker-identity/);
 const g=fixture();g.context.waitForEvent=async()=>g.worker('chrome-extension://other/extension/worker.mjs');await assert.rejects(waitForSys05Worker(g.context,'expected',g.deadline),/wrong-worker/);assert.equal(g.evaluations.length,0);
});
for(const key of ['message','connect','sendHeaders','completed','requestError','redirect'])test('missing '+key+' listener is not worker-ready and receives no new window',async()=>{
 const f=fixture();f.workers.push(f.worker(exact,{...ready,[key]:false}));const pending=waitForSys05Worker(f.context,'expected',f.deadline),rejected=assert.rejects(pending,/sys05-timeout:extension-worker-ready/);await flush();assert.equal(f.evaluations.length,1);await f.advance(30000);await rejected;
});
test('report uses a fixed safe summary instead of exposing a raw worker response',async()=>{
 const f=fixture();f.workers.push(f.worker(exact,{...ready,extra:'UNEXPECTED_RAW_VALUE'}));const result=await waitForSys05Worker(f.context,'expected',f.deadline);assert(!JSON.stringify(result).includes('UNEXPECTED_RAW_VALUE'));assert.equal(result.browserNetworkListenerInstallation,'NOT_ESTABLISHED');assert.equal(result.immediateColdSupport,'NOT_ESTABLISHED');
});
test('a hanging read-only readiness call stays inside the original deadline',async()=>{
 const f=fixture();f.setAt(29000);f.workers.push(f.worker(exact,()=>new Promise(()=>{})));const pending=waitForSys05Worker(f.context,'expected',f.deadline),rejected=assert.rejects(pending,/sys05-timeout:extension-worker-ready/);await flush();await f.advance(1000);await rejected;
});
test('readiness that resolves at the absolute deadline is rejected',async()=>{
 const f=fixture();f.workers.push(f.worker(exact,()=>{f.setAt(30000);return ready;}));await assert.rejects(waitForSys05Worker(f.context,'expected',f.deadline),/sys05-timeout:extension-worker-ready/);
});
test('worker discovery, readiness, navigation and live UI share the same absolute deadline',async()=>{
 const f=fixture(),worker=waitForSys05Worker(f.context,'expected',f.deadline);await flush();f.setAt(25000);f.emit(f.worker());await worker;
 assert.equal(f.deadline.remaining(),5000);await f.deadline.run(async()=>{f.setAt(26000);},'initial-peer-page');
 await f.deadline.run(async()=>{assert.equal(f.deadline.remaining(),4000);f.setAt(29500);},'initial-native-navigation');
 assert.equal(f.deadline.remaining(),500);
 await assert.rejects(f.deadline.poll(async()=>{f.setAt(30001);return true;},'normal-native-context-and-live-UI'),/sys05-timeout:normal-native-context-and-live-UI/);
 assert.equal(f.deadline.deadlineAt,30000);
});
test('no operation starts after expiry and an on-time successful live UI is accepted',async()=>{
 const f=fixture();f.setAt(29999);assert.equal(await f.deadline.poll(async()=>true,'live'),true);f.setAt(30000);let called=false;await assert.rejects(f.deadline.run(()=>{called=true;},'late'),/sys05-timeout:late/);assert.equal(called,false);
});
test('default monotonic budget and elapsed ignore wall-clock jumps and reject late success',async t=>{
 let elapsed=1000,wall=100000;t.mock.method(performance,'now',()=>elapsed);t.mock.method(Date,'now',()=>wall);
 const deadline=createSys05StartupDeadline();elapsed+=20000;wall+=20000;
 assert.equal(deadline.remaining(),10000);assert.equal(deadline.elapsedMs(),20000);
 wall-=10000;assert.equal(deadline.remaining(),10000);assert.equal(deadline.elapsedMs(),20000);
 wall+=100000;assert.equal(deadline.remaining(),10000);assert.equal(deadline.elapsedMs(),20000);
 await assert.rejects(deadline.run(async()=>{elapsed+=10000;return true;},'late-default-clock'),/sys05-timeout:late-default-clock/);
 assert.equal(deadline.elapsedMs(),30000);assert.equal(deadline.deadlineAt,31000);
});
test('readiness evaluation reads browser identity/listener registration only, without state writes or messages',()=>{
 const reads=[],event=name=>Object.freeze({hasListeners(){reads.push(name);return true;}});
 const chrome=Object.freeze({runtime:Object.freeze({id:'expected',onMessage:event('message'),onConnect:event('connect')}),webRequest:Object.freeze({onSendHeaders:event('sendHeaders'),onCompleted:event('completed'),onErrorOccurred:event('requestError'),onBeforeRedirect:event('redirect')})});
 const value=vm.runInNewContext('('+inspectSys05Worker.toString()+')("expected")',{chrome});assert.deepEqual(JSON.parse(JSON.stringify(value)),ready);assert.deepEqual(reads,['message','connect','sendHeaders','completed','requestError','redirect']);
});
test('startup runner hashes its helper and spends one budget before the unchanged first native gate',async()=>{
 const source=await readFile(new URL('./sys05-stream-package-journey.mjs',import.meta.url),'utf8');
 assert(source.includes("'sys05-startup-precondition.mjs'"));assert(source.includes("coldStart:'NOT_TESTED'"));assert(source.includes("totalBudgetMs:startup.timeoutMs"));
 assert(source.indexOf('waitForSys05Worker(context,id,startup)')<source.indexOf("b.goto(server.origin+'/c/'+PEER"));
 assert(source.includes("startup.run(()=>b.goto(server.origin+'/c/'+PEER,{timeout:startup.remaining('initial-native-navigation')})"));assert(source.includes('await ready(b,team,PEER,startup)'));
 assert(source.includes('report.browserPrecondition.startup.elapsedMs=startup.elapsedMs()'));assert(!source.includes('Date.now()-startup.startedAt'));
 assert.equal(source.split('createSys05StartupDeadline()').length,2);assert.equal(source.split("b.goto(server.origin+'/c/'+PEER").length,2);
 assert(!source.includes('createColdTracePackage'));assert(!source.includes('HOST_REFRESH'));assert(!source.includes('HOST_CONTEXT_READY'));assert(!source.includes('.reload('));
});

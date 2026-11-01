import test from 'node:test';
import assert from 'node:assert/strict';
import {PROJECT_WRAPPER_DIAGNOSTIC_BATCH,WRAPPER_DETAILS,createProjectWrapperDiagnosticSlot,snapshotProjectWrapperRefusal,validProjectWrapperReport} from '../../src/host/project-wrapper-diagnostic.mjs';
import {installProjectWrapperDiagnosticChannel,runProjectWrapperDiagnosticOnce} from '../../src/host/project-wrapper-diagnostic-channel.mjs';
const url='https://chatgpt.com/g/g-p-11111111111111111111111111111111/project';
const nonce='11111111-2222-4333-8444-555555555555';
function baseline(detail='wrapper-seam',partial=false){return {schema:'main-mount-check-v1',outcome:'refused',reason:'native-flow-wrapper-paint',kind:'project',phase:'walk',detail,visited:41,coverage:partial?'partial':'complete',limit:partial?'depth':'none',elapsedMs:1,root:0,rejected:1,landmarks:[null,null,null],rows:[[-1,null,'MAIN','absent',3,[0,0,400,400]],[0,0,'DIV','absent',65,[0,0,400,400]]]};}
function fixture(){
 let time=0,wall=100000,privateReads=0,rectReads=0,parentReads=0,styleReads=0;
 const timers=new Map();let next=0;
 const window=new EventTarget();window.navigation=new EventTarget();window.performance={now:()=>time};
 const document={location:{href:url},defaultView:window};
 const node=parent=>{
  const n={nodeType:1,tagName:'DIV',ownerDocument:document,isConnected:true,getBoundingClientRect(){rectReads++;return {x:0,y:0,width:100,height:100};}};
  Object.defineProperty(n,'parentElement',{get(){parentReads++;return parent;}});
  for(const key of ['textContent','innerText','innerHTML','outerHTML','title','id','className','value','href','parentNode','childNodes','children','nextSibling','attributes'])Object.defineProperty(n,key,{get(){privateReads++;throw Error('PRIVATE_'+key);}});
  for(const key of ['querySelector','querySelectorAll','getAttribute','setAttribute','append','remove'])n[key]=()=>{privateReads++;throw Error('PRIVATE_'+key);};
  return n;
 };
 const root=node(null),parent=node(root),bad=node(parent),inspection={ok:true};
 const styles={display:'flex',visibility:'visible',opacity:'1',zoom:'1',overflowX:'visible',overflowY:'visible',position:'relative',transform:'none',translate:'none',rotate:'none',scale:'none',filter:'none',backdropFilter:'none',clipPath:'none',maskImage:'none',contain:'none',scrollSnapType:'none'};
 window.getComputedStyle=(n,pseudo)=>{assert([bad,parent,root].includes(n));styleReads++;return pseudo?{content:'url(PRIVATE_generated_content)'}:styles;};
 const context={document,inspection,root,node:bad,reason:'native-flow-wrapper-paint',detail:'wrapper-seam',phase:'walk',kind:'project',flowSeamShells:[parent],startedAt:0};
 const abort=new AbortController(),generation={};
 let live=true;
 const options={document,enabled:true,now:()=>wall,elapsedNow:()=>time,makeId:()=>nonce,schedule:(fn,ms)=>{timers.set(++next,{fn,at:time+ms});return next;},cancel:id=>timers.delete(id)};
 return {document,window,root,parent,bad,inspection,context,styles,abort,generation,options,wait:{generation,isCurrent:()=>live,abortSignal:abort.signal},setLive:v=>{live=v;},advance(ms){time+=ms;wall+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}},setTime:v=>{time=v;},get counts(){return {privateReads,rectReads,parentReads,styleReads};},get timers(){return timers.size;}};
}
test('collector reads three exact references, two parents, fixed style categories and zero private/scan/write fields',()=>{
 const f=fixture(),r=snapshotProjectWrapperRefusal(baseline(),f.context);
 assert(validProjectWrapperReport(r));assert.equal(r.state,'COMPLETE');assert.equal(r.nodes.length,3);assert.deepEqual(r.nodes.map(n=>[n[0],n[2],n[3]]),[[0,false,false],[1,false,true],[2,true,false]]);
 assert.deepEqual(f.counts,{privateReads:0,rectReads:3,parentReads:2,styleReads:9});assert(!JSON.stringify(r).includes('PRIVATE'));
 assert.equal(r.nodes[0][5].before,'present');assert.equal(r.nodes[0][5].after,'present');
});
for(const detail of WRAPPER_DETAILS)test('exact '+detail+' context survives a bounded PARTIAL baseline',()=>{
 const f=fixture();f.context.detail=detail;
 const r=snapshotProjectWrapperRefusal(baseline(detail,true),f.context);assert(validProjectWrapperReport(r));assert.equal(r.state,'PARTIAL');assert.equal(r.limit,'baseline');assert.equal(r.baseline.coverage,'partial');assert.equal(r.nodes.length,3);assert.equal(r.detail,detail);
});
test('null or invalid anonymous report never prevents bounded actual-node evidence or leaks injected strings',()=>{
 for(const report of [null,{...baseline(),title:'PRIVATE'}]){const f=fixture(),r=snapshotProjectWrapperRefusal(report,f.context);assert.equal(r.state,'PARTIAL');assert.equal(r.baseline,null);assert.equal(r.nodes.length,3);assert(!JSON.stringify(r).includes('PRIVATE'));}
});
test('shared 8ms budget, throwing style, invalid rect and detached node all preserve PARTIAL',()=>{
 for(const mode of ['time','style','rect','detached']){
  const f=fixture();if(mode==='time')f.setTime(8);if(mode==='style')f.window.getComputedStyle=()=>{throw Error('PRIVATE');};if(mode==='rect')f.bad.getBoundingClientRect=()=>({x:NaN,y:0,width:1,height:1});if(mode==='detached')f.bad.isConnected=false;
  const r=snapshotProjectWrapperRefusal(baseline(),f.context);assert(validProjectWrapperReport(r));assert.equal(r.state,'PARTIAL');assert.equal(r.nodes.length,0);assert.equal(f.counts.privateReads,0);
 }
});
test('other decisions and non-Project inspections do not read any native values',()=>{
 for(const patch of [{reason:'none'},{detail:'wrapper-text'},{kind:'home'},{inspection:{ok:false}},{phase:'exception'}]){
  const f=fixture(),r=snapshotProjectWrapperRefusal(null,{...f.context,...patch});assert.equal(r.state,'NO_MATCH');assert.deepEqual(f.counts,{privateReads:0,rectReads:0,parentReads:0,styleReads:0});
 }
});
test('strict JSON validator rejects accessors, extra fields, node objects and private styles without invoking getters',()=>{
 const f=fixture(),r=snapshotProjectWrapperRefusal(baseline(),f.context);
 for(const key of Object.keys(r)){let read=false;const bad={...r};Object.defineProperty(bad,key,{enumerable:true,get(){read=true;throw Error('PRIVATE');}});assert.equal(validProjectWrapperReport(bad),false);assert.equal(read,false);}
 for(const mutate of [r=>r.node=f.bad,r=>r.nodes[0][5].content='PRIVATE',r=>r.nodes[0][4][0]=Infinity,r=>r.nodes.secret='PRIVATE',r=>r.nodes[0][1]='PRIVATE',r=>r.baseline.title='PRIVATE',r=>r.nodes[0][5].filter='url(PRIVATE)']){const bad=structuredClone(r);mutate(bad);assert.equal(validProjectWrapperReport(bad),false);}
});
test('gate is default-off, requires explicit authorization, consumes before first result and returns copies',async()=>{
 const f=fixture(),off=createProjectWrapperDiagnosticSlot({...f.options,enabled:false});assert.equal(await off.wait(f.wait),false);assert.equal(off.ticket(),null);assert.equal(off.take(f.generation,f.inspection),null);
 const slot=createProjectWrapperDiagnosticSlot(f.options),waiting=slot.wait(f.wait);assert.deepEqual(slot.ticket(),{nonce});assert.equal(slot.take(f.generation,f.inspection),null);assert.equal(slot.authorize({nonce:'wrong'}),false);
 assert.equal(slot.authorize({nonce}),true);assert.equal(await waiting,true);assert.equal(slot.authorize({nonce}),false);
 const result=slot.result(),callback=slot.take(f.generation,f.inspection);assert.equal(typeof callback,'function');assert.equal(slot.take(f.generation,f.inspection),null);
 callback(baseline(),f.context);assert.equal((await result).state,'COMPLETE');const counts=f.counts;callback(baseline(),f.context);assert.deepEqual(f.counts,counts);slot.read().nodes.length=0;assert.equal(slot.read().nodes.length,3);assert.equal(await slot.wait(f.wait),false);
});
test('first accepted/other rejection terminates the permit; subsequent wrapper rejection is not collected',async()=>{
 for(const reason of ['none','native-flow-wrapper-text']){const f=fixture(),slot=createProjectWrapperDiagnosticSlot(f.options),waiting=slot.wait(f.wait);slot.authorize({nonce});await waiting;const write=slot.take(f.generation,f.inspection);write(null,{...f.context,reason});write(baseline(),f.context);assert.equal(slot.read().state,'NO_MATCH');assert.equal(slot.take(f.generation,f.inspection),null);assert.equal(f.counts.rectReads,0);}
});
test('waiting expiry, session abort, new generation, route A-B-A and pagehide irreversibly invalidate authorization',async()=>{
 for(const mode of ['expiry','abort','route','pagehide','generation']){
  const f=fixture(),slot=createProjectWrapperDiagnosticSlot(f.options),waiting=slot.wait(f.wait);
  if(mode==='expiry')f.advance(60000);if(mode==='abort')f.abort.abort();if(mode==='pagehide')f.window.dispatchEvent(new Event('pagehide'));
  if(mode==='route'){f.document.location.href='https://chatgpt.com/';f.window.navigation.dispatchEvent(new Event('navigate'));f.document.location.href=url;}
  if(mode==='generation'){f.setLive(false);slot.ticket();}
  assert.equal(await waiting,false);assert.equal(slot.authorize({nonce}),false);assert.equal(slot.ticket(),null);assert.equal(f.timers,0);
 }
});
test('armed expiry, late callback, foreign document/inspection and clock rollback cannot collect',async()=>{
 for(const mode of ['expiry','document','inspection','rollback','owner']){
  const f=fixture(),slot=createProjectWrapperDiagnosticSlot(f.options),waiting=slot.wait(f.wait);slot.authorize({nonce});await waiting;
  if(mode==='owner'){assert.equal(slot.take({},f.inspection),null);f.abort.abort();continue;}
  const callback=slot.take(f.generation,f.inspection);
  if(mode==='expiry')f.advance(30000);if(mode==='rollback')f.setTime(-1);
  callback(baseline(),{...f.context,...(mode==='document'?{document:{}}:{}),...(mode==='inspection'?{inspection:{ok:true}}:{})});
  assert.notEqual(slot.read().state,'COMPLETE');assert.equal(f.counts.rectReads,0);assert.equal(slot.take(f.generation,f.inspection),null);
 }
});
function channelFixture(){
 const f=fixture(),report=snapshotProjectWrapperRefusal(baseline(),f.context);let listener,authorizations=0,lifecycle=0,occupied=false,writes=0;
 const store={'old-home':{spent:true},'old-project':{spent:true}},messages=[];
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:fn=>{listener=fn;},removeListener(){}}};
 const sender={id:'extension',url:runtime.getURL('status.html')};
 const session={projectWrapperTicket:()=>({nonce}),authorizeProjectWrapper:()=>{authorizations++;return true;},projectWrapperResult:async()=>report,readProjectWrapper:()=>report};
 installProjectWrapperDiagnosticChannel({runtime,session,beforeAuthorize:()=>{lifecycle++;}});
 const target={tabId:3,documentId:'PRIVATE_DOCUMENT',url},frame={documentId:target.documentId,url,documentLifecycle:'active'};
 const chrome={storage:{local:{get:async key=>({[key]:store[key]}),set:async value=>{writes++;Object.assign(store,value);}}},webNavigation:{getFrame:async()=>frame},tabs:{sendMessage:async(id,message,options)=>{messages.push(message.action);assert.equal(id,3);assert.deepEqual(options,{documentId:target.documentId});if(message.action==='authorize')assert.deepEqual(store[PROJECT_WRAPPER_DIAGNOSTIC_BATCH],{spent:true});return new Promise(resolve=>listener(message,sender,resolve));}}};
 const locks={request:async(key,options,fn)=>{assert.equal(key,PROJECT_WRAPPER_DIAGNOSTIC_BATCH);assert.deepEqual(options,{ifAvailable:true});if(occupied)return fn(null);occupied=true;try{return await fn({});}finally{occupied=false;}}};
 return {chrome,locks,target,frame,store,sender,runtime,session,report,listener:(...args)=>listener(...args),messages,get counts(){return {authorizations,lifecycle,writes};}};
}
test('private channel rejects untrusted senders, extra keys and bad nonce before any lifecycle or collector',()=>{
 const f=channelFixture(),message={v:1,type:'HOST_PROJECT_WRAPPER_DIAGNOSTIC',action:'authorize',ticket:{nonce}};
 for(const sender of [{...f.sender,id:'other'},{...f.sender,url:f.runtime.getURL('workspace.html')},{...f.sender,tab:{id:3}},{url:url}])f.listener(message,sender,()=>assert.fail('untrusted reply'));
 f.listener({...message,secret:'PRIVATE'},f.sender,()=>assert.fail('extra key reply'));
 f.listener({...message,ticket:{nonce:'bad'}},f.sender,r=>assert.equal(r.report,null));assert.deepEqual(f.counts,{authorizations:0,lifecycle:0,writes:0});
});
test('independent durable permit is consumed first, never touches old budgets, and serializes concurrent UI attempts',async()=>{
 const f=channelFixture(),pair=await Promise.all([runProjectWrapperDiagnosticOnce(f),runProjectWrapperDiagnosticOnce(f)]);assert.equal(pair.filter(Boolean).length,1);assert.deepEqual(f.counts,{authorizations:1,lifecycle:1,writes:1});
 assert.deepEqual(f.store['old-home'],{spent:true});assert.deepEqual(f.store['old-project'],{spent:true});assert.equal(await runProjectWrapperDiagnosticOnce(f),null);assert.equal(f.counts.authorizations,1);assert(!JSON.stringify(pair).includes('PRIVATE'));
});
test('document replacement or route change before authorization denies collection and cannot erase the spent bit',async()=>{
 for(const mode of ['document','route']){const f=channelFixture(),set=f.chrome.storage.local.set;f.chrome.storage.local.set=async value=>{await set(value);if(mode==='document')f.frame.documentId='replacement';else f.frame.url='https://chatgpt.com/';};assert.equal(await runProjectWrapperDiagnosticOnce(f),null);assert.equal(f.counts.authorizations,0);assert.deepEqual(f.store[PROJECT_WRAPPER_DIAGNOSTIC_BATCH],{spent:true});}
});
test('storage reply arriving after timeout never authorizes, and a lost authorization reply cannot replay',async()=>{
 const f=channelFixture();let timeout,finish;const set=f.chrome.storage.local.set;f.chrome.storage.local.set=async v=>{await set(v);await new Promise(resolve=>{finish=resolve;});};
 const pending=runProjectWrapperDiagnosticOnce({...f,schedule:fn=>{timeout=fn;return 1;},cancel(){}});while(!finish)await Promise.resolve();timeout();assert.equal(await pending,null);finish();await Promise.resolve();assert.equal(f.counts.authorizations,0);assert.equal(await runProjectWrapperDiagnosticOnce(f),null);
 const lost=channelFixture(),send=lost.chrome.tabs.sendMessage;lost.chrome.tabs.sendMessage=async(...args)=>{const r=await send(...args);if(args[1].action==='authorize')throw Error('lost');return r;};assert.equal(await runProjectWrapperDiagnosticOnce(lost),null);assert.equal(await runProjectWrapperDiagnosticOnce(lost),null);assert.equal(lost.counts.authorizations,1);
});
test('a delayed successful authorization reply cannot rehabilitate an invalidated A-B-A session',async()=>{
 const f=channelFixture(),send=f.chrome.tabs.sendMessage;
 f.chrome.tabs.sendMessage=async(...args)=>{const r=await send(...args);if(args[1].action==='authorize')f.session.readProjectWrapper=()=>({schema:'project-wrapper-first-refusal-v1',state:'INVALIDATED',reason:'none',detail:'none',phase:'none',limit:'unavailable',baseline:null,nodes:[]});return r;};
 const result=await runProjectWrapperDiagnosticOnce(f);assert.equal(result.state,'INVALIDATED');assert.equal(f.counts.authorizations,1);assert.deepEqual(f.messages,['ticket','authorize','report']);
});

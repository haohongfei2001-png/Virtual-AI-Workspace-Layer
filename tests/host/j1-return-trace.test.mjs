import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
test('J1 trace observes original RPC result without changing request, return value or rejection',async()=>{
 const source=await readFile(new URL('./j1-package-journey.mjs',import.meta.url),'utf8'),start=source.indexOf('await context.addInitScript(')+'await context.addInitScript('.length,end=source.indexOf(');const cdp=',start),fn=source.slice(start,end),logs=[],calls=[];let pending;
 const world={location:{protocol:'chrome-extension:',href:'chrome-extension://fixture/workspace.html'},chrome:{runtime:{sendMessage(...args){calls.push(args);return pending;}}},crypto:{randomUUID:()=> 'frame-1'},console:{log:s=>logs.push(s)}};vm.runInNewContext('('+fn+')',world)();
 const request={type:'HOST_UI_VIEW',query:{offset:32}},reply={ok:true,state:'ready',page:{groups:{offset:32,items:[{id:'p2'}]}}};pending=Promise.resolve(reply);assert.equal(world.chrome.runtime.sendMessage(request),pending);await pending;await Promise.resolve();assert.equal(calls[0][0],request);assert.equal(world.j1ViewTrace[0].offset,32);assert.equal(logs.length,2);assert.equal(JSON.parse(logs[1].slice(16)).page.offset,32);
 pending=Promise.reject(Error('original-rejection'));const rejected=world.chrome.runtime.sendMessage({type:'HOST_UI_RESUME'});assert.equal(rejected,pending);await assert.rejects(rejected,/original-rejection/);assert.equal(JSON.parse(logs.at(-1).slice(16)).phase,'reject');
});

test('J1 dispatch and trusted link diagnostics preserve dispatch Promise and native event',async()=>{
 const source=await readFile(new URL('./j1-package-journey.mjs',import.meta.url),'utf8'),start=source.indexOf('await context.addInitScript(')+'await context.addInitScript('.length,end=source.indexOf(');const cdp=',start),logs=[],listeners={};const result=Promise.resolve({ok:true,state:'blocked',reason:'current-plan-unavailable'});
 const world={location:{protocol:'chrome-extension:',href:'chrome-extension://fixture/workspace.html'},chrome:{runtime:{sendMessage:()=>result}},crypto:{randomUUID:()=> 'frame'},console:{log:s=>logs.push(JSON.parse(s.slice(16)))},queueMicrotask,URL,document:{addEventListener(type,fn,capture){assert.equal(type,'click');listeners[capture?'capture':'bubble']=fn;}}};vm.runInNewContext('('+source.slice(start,end)+')',world)();
 const request={type:'HOST_UI_DISPATCH_NATIVE',actionId:'action',targetKey:'target',planRevision:7};assert.equal(world.chrome.runtime.sendMessage(request),result);await result;await Promise.resolve();assert.equal(logs[0].planRevision,7);assert.equal(logs[1].state,'blocked');assert.equal(logs[1].reason,'current-plan-unavailable');
 const link={tagName:'A',dataset:{focusKey:'project-create:p1'},isConnected:true,getAttribute:k=>({href:'http://127.0.0.1:1/g/p1/project',target:'_blank'}[k]??null),closest:()=>({getAttribute:()=> 'p1'})},event={isTrusted:true,button:0,defaultPrevented:false,composedPath:()=>[link],preventDefault(){assert.fail('observer prevented click');}};
 listeners.capture(event);await Promise.resolve();assert.equal(logs.at(-1).phase,'click');assert.equal(logs.at(-1).dispatchStage,'CAPTURE');assert.equal(logs.at(-1).defaultPrevented,false);
 event.defaultPrevented=true;listeners.bubble(event);assert.equal(logs.at(-1).phase,'click-bubble');assert.equal(logs.at(-1).dispatchStage,'AFTER_TARGET');assert.equal(logs.at(-1).defaultPrevented,true);assert.equal(logs.at(-1).projectId,'p1');assert.equal(logs.at(-1).target,'_blank');assert.equal(logs.at(-2).clickId,logs.at(-1).clickId);
 const bad={type:'HOST_UI_DISPATCH_NATIVE',actionId:'x'.repeat(1000000),targetKey:{secret:'NEVER_COPY'},planRevision:{secret:'NEVER_COPY'}};world.chrome.runtime.sendMessage(bad);await result;await Promise.resolve();const badRequest=logs.findLast(r=>r.phase==='request');assert.equal(badRequest.actionId,null);assert.equal(badRequest.targetKey,null);assert.equal(badRequest.planRevision,null);assert(!JSON.stringify(logs).includes('NEVER_COPY'));assert(JSON.stringify(logs).length<10000);
 assert(source.includes('report.failedPageURLs=(context?.pages()??[])'));assert(source.includes('timeout:15000'));assert(source.includes("context.pages().filter(p=>p.url().startsWith(server.origin)).length,1"));
});

const source=await readFile(new URL('./j1-package-journey.mjs',import.meta.url),'utf8'),marker='await context.addInitScript(',start=source.indexOf(marker)+marker.length,end=source.indexOf(');const cdp=',start);
function setup(){const logs=[];let calls=0;const result=Promise.resolve({ok:true,reason:{grant:'AUDIT_SECRET'}}),world={location:{protocol:'chrome-extension:',href:'chrome-extension://fixture/workspace.html'},chrome:{runtime:{sendMessage(){calls++;return result;}}},crypto:{randomUUID:()=> 'frame'},console:{log:s=>logs.push(s)},queueMicrotask,URL};vm.runInNewContext('('+source.slice(start,end)+')',world)();return {world,logs,result,calls:()=>calls};}
test('new dispatch watch cannot leak legacy raw fields',async()=>{const f=setup();f.world.chrome.runtime.sendMessage({type:'HOST_UI_DISPATCH_NATIVE',query:{token:'AUDIT_SECRET'},view:'x'.repeat(1000000)});await f.result;await Promise.resolve();assert(!f.logs.join('').includes('AUDIT_SECRET'));assert(f.logs.join('').length<10000);});
test('diagnostic serialization cannot prevent original dispatch',()=>{const f=setup(),query={};query.self=query;let actual;assert.doesNotThrow(()=>{actual=f.world.chrome.runtime.sendMessage({type:'HOST_UI_DISPATCH_CURRENT',query});});assert.equal(actual,f.result);assert.equal(f.calls(),1);});

test('J1 diagnostic click failures do not throw into the native event',()=>{
 const listeners={};let logCalls=0,pathCalls=0;const world={location:{protocol:'chrome-extension:',href:'chrome-extension://fixture/workspace.html'},chrome:{runtime:{sendMessage(){}}},crypto:{randomUUID:()=> 'frame'},console:{log(){logCalls++;throw Error('console unavailable');}},document:{addEventListener(t,fn,capture){listeners[capture?'capture':'bubble']=fn;}}};
 vm.runInNewContext('('+source.slice(start,end)+')',world)();assert.doesNotThrow(()=>listeners.capture({composedPath(){pathCalls++;throw Error('detached');}}));assert.equal(pathCalls,1);
 const event={composedPath:()=>[{tagName:'A',dataset:{focusKey:'project-create:p1'},getAttribute:()=>null,closest:()=>null}]};assert.doesNotThrow(()=>listeners.capture(event));assert.doesNotThrow(()=>listeners.bubble(event));assert.equal(logCalls,2);
});
test('J1 stopped propagation has no invented post-target outcome; click samples are bounded',()=>{
 const logs=[],listeners={};const world={location:{protocol:'chrome-extension:',href:'chrome-extension://fixture/workspace.html'},chrome:{runtime:{sendMessage(){}}},crypto:{randomUUID:()=> 'frame'},URL,console:{log:s=>logs.push(JSON.parse(s.slice(16)))},document:{addEventListener(type,fn,capture){listeners[capture?'capture':'bubble']=fn;}}};
 vm.runInNewContext('('+source.slice(start,end)+')',world)();const link={tagName:'A',dataset:{focusKey:'project-create:p1'},isConnected:true,getAttribute:()=>null,closest:()=>null};
 for(let i=0;i<150;i++){const event={isTrusted:true,button:0,defaultPrevented:false,composedPath:()=>[link]};listeners.capture(event);if(i!==0){event.defaultPrevented=true;listeners.bubble(event);}}
 assert.equal(logs.filter(r=>r.phase==='click').length,128);assert.equal(logs.filter(r=>r.phase==='click-bubble').length,127);assert.equal(logs.filter(r=>r.clickId===1).length,1);assert.equal(logs[0].dispatchStage,'CAPTURE');assert.equal(logs[0].defaultPrevented,false);assert(logs.filter(r=>r.phase==='click-bubble').every(r=>r.defaultPrevented===true));
});
test('J1 finalization attempts every check and report despite close failure',async()=>{
 const code=source.slice(source.lastIndexOf('finally{')+8,source.lastIndexOf('}console.log'));
 const stages=[],report={error:'original failure',status:'FAIL',sourceHashes:{}},world={upgradeTrace:null,report,context:{async close(){stages.push('browser');throw Error('close failed');}},server:{async close(){stages.push('server');throw Error('server failed');}},process:{argv:[],exitCode:1},manifest:{sourceHashes:{}},fixtureSourceHashes:{},hash:v=>v,readFile:async p=>{stages.push(p);throw Error('check failed');},script:'script',scriptHash:'original',manifestPath:'manifest',join:(...v)=>v.join('/'),tmpdir:()=>'/tmp',writeFile:async(p,body)=>{stages.push('report');assert.equal(JSON.parse(body).error,'original failure');}};
 await vm.runInNewContext('(async()=>{'+code.replaceAll('import.meta.url',"'file:///fixture/'")+'})()',world);
 assert.deepEqual(stages,['browser','server','script','manifest','report']);assert.equal(report.error,'original failure');assert.equal(report.status,'FAIL_FINALIZATION');assert.equal(report.finalizationErrors.length,4);
});

test('J1 port diagnostics preserve connection and callbacks and bound notification output',()=>{
 const logs=[],listeners=[],port={onMessage:{addListener:fn=>listeners.push(fn)}};let argument;
 const world={location:{protocol:'chrome-extension:',href:'chrome-extension://fixture/workspace.html'},chrome:{runtime:{sendMessage(){},connect(value){argument=value;return port;}}},crypto:{randomUUID:()=> 'frame'},console:{log:s=>logs.push(JSON.parse(s.slice(16)))}};
 vm.runInNewContext('('+source.slice(start,end)+')',world)();const request={name:'vaiwl-ui'};assert.equal(world.chrome.runtime.connect(request),port);assert.equal(argument,request);let delivered=0;port.onMessage.addListener(()=>delivered++);
 for(let i=0;i<150;i++)for(const listener of listeners)listener({type:'VAIWL_UI_WORKSPACE_ENTERED',private:'NEVER_RECORD'});
 assert.equal(delivered,150);assert.equal(logs.length,128);assert(logs.every(r=>r.phase==='port-message'&&r.type==='VAIWL_UI_WORKSPACE_ENTERED'));assert(!JSON.stringify(logs).includes('NEVER_RECORD'));
});

for(const failure of ['construct','observe','callback'])test('optional candidate diagnostic '+failure+' failure cannot prevent original RPC',async()=>{
 let callback,calls=0;const result=Promise.resolve({ok:true});
 const world={location:{protocol:'chrome-extension:',href:'chrome-extension://fixture/workspace.html'},chrome:{runtime:{sendMessage(){calls++;return result;}}},crypto:{randomUUID:()=> 'frame'},console:{log(){}},document:{addEventListener(){}},MutationObserver:class{constructor(fn){if(failure==='construct')throw Error('observer unavailable');callback=fn;}observe(){if(failure==='observe')throw Error('detached document');}}};
 assert.doesNotThrow(()=>vm.runInNewContext('('+source.slice(start,end)+')',world)());
 if(failure==='callback')assert.doesNotThrow(()=>callback([{get addedNodes(){throw Error('stale record');}}]));
 assert.equal(world.chrome.runtime.sendMessage({type:'HOST_UI_VIEW'}),result);assert.equal(calls,1);await result;
});

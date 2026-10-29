import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readIdleBootstrapFacts,idleEvaluationFailure,createIdleFrameBootstrap} from './natural-worker-idle-bootstrap.mjs';
import {idleBootstrapAction} from './natural-worker-idle-oracle.mjs';

function fixture(){return {location:{href:'http://127.0.0.1/'},document:{
 documentElement:null,activeElement:null,readyState:'loading',visibilityState:'visible',
 hasFocus:()=>true,querySelector:()=>null,querySelectorAll:()=>[],
}};}
const read=page=>runInNewContext(`(${readIdleBootstrapFacts.toString()})()`,page);
test('new parsing document without an HTML root remains pending instead of aborting bootstrap',()=>{
 const page=fixture(),facts=read(page);
 assert.equal(facts.rootPresent,false);assert.equal(facts.state,null);assert.equal(facts.reason,null);
 assert.equal(idleBootstrapAction(facts,'chrome-extension://fixture/'),'WAIT');
 page.document.documentElement={dataset:{vaiwlState:'waiting',vaiwlReason:'fresh-context-required'}};
 page.document.readyState='complete';const next=read(page);
 assert.equal(next.rootPresent,true);assert.equal(next.state,'waiting');
 assert.equal(next.reason,'fresh-context-required');assert.equal(idleBootstrapAction(next,'chrome-extension://fixture/'),'WAIT');
});
test('missing root never grants readiness even if other observer fields are complete',()=>{
 const facts={readyState:'complete',rootPresent:false,visibility:'visible',returnCount:0,open:2,
  frames:['workspace','sidebar'].map(role=>({src:'chrome-extension://fixture/'+role+'.html',connected:true}))};
 assert.equal(idleBootstrapAction(facts,'chrome-extension://fixture/'),'WAIT');
});
test('unexpected page query failures remain failures rather than being converted into waits',()=>{
 const page=fixture();page.document.documentElement={dataset:{}};
 page.document.querySelectorAll=()=>{throw Error('synthetic-selector-failure');};
 assert.throws(()=>read(page),/synthetic-selector-failure/);
});
test('page evaluation failure retains bounded original details without retrying or swallowing it',()=>{
 const error=idleEvaluationFailure({text:'Uncaught',exception:{description:'TypeError: missing root'},lineNumber:3,columnNumber:8});
 assert.match(error.message,/TypeError: missing root/);assert.match(error.message,/"line":3/);
 const bounded=idleEvaluationFailure({text:'x'.repeat(1000),exception:{description:'y'.repeat(2000)}});
 assert(bounded.message.length<1100);
});
test('flow visibility counts the actual iframe, never its empty exit popover',()=>{
 const page=fixture();let visible=false;
 const frame={src:'chrome-extension://fixture/workspace.html',isConnected:true,checkVisibility:()=>visible,getBoundingClientRect:()=>({width:700,height:500})};
 page.document.querySelectorAll=selector=>selector==='[data-va-owned] iframe'?[frame]:selector.includes(':popover-open')?[{}]:[];
 assert.equal(read(page).open,0);visible=true;assert.equal(read(page).open,1);
 frame.getBoundingClientRect=()=>({width:0,height:0});assert.equal(read(page).open,0);
});

function observerFixture(commandOverride=async()=>{}){
 const calls=[];
 const controller=createIdleFrameBootstrap({prefix:'chrome-extension://test/',roles:['workspace'],installObserver:function(){globalThis.installCount=(globalThis.installCount??0)+1;},command:async(method,params,session)=>{calls.push({method,params,session});return commandOverride(method,params,session);}});
 const attached=(type='iframe',parent='host')=>({sessionId:parent,method:'Target.attachedToTarget',params:{sessionId:'child',targetInfo:{targetId:'frame',type,url:'about:blank'}}});
 return {controller,calls,attached};
}
test('blank OOPIF is prepared before resume; script is exact-role scoped and idempotent',async()=>{
 const {controller,calls,attached}=observerFixture();await controller.arm('host');
 assert.deepEqual(calls[0],{method:'Target.setAutoAttach',params:{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'iframe'},{exclude:true}]},session:'host'});
 controller.handle(attached());assert.deepEqual(await controller.frame('frame'),{sessionId:'child'});
 assert.deepEqual(calls.slice(1).map(c=>[c.method,c.session]),[['Page.enable','child'],['Page.addScriptToEvaluateOnNewDocument','child'],['Runtime.runIfWaitingForDebugger','child']]);
 const source=calls[2].params.source,realm={location:{href:'about:blank'},chrome:{runtime:{sendMessage(){}}}};
 runInNewContext(source,realm);assert.equal(realm.idleObserverInstalled,undefined);
 realm.location.href='chrome-extension://other/workspace.html';runInNewContext(source,realm);assert.equal(realm.installCount,undefined);
 realm.location.href='chrome-extension://test/sidebar.html';runInNewContext(source,realm);assert.equal(realm.installCount,undefined);
 realm.location.href='chrome-extension://test/workspace.html';runInNewContext(source,realm);runInNewContext(source,realm);assert.equal(realm.installCount,1);
 await controller.stop();assert.deepEqual(calls.at(-1),{method:'Target.setAutoAttach',params:{autoAttach:false,waitForDebuggerOnStart:false,flatten:true},session:'host'});
 assert.deepEqual(controller.snapshot(),{armed:false,pending:0,attachments:1,completed:1,failed:false});
 controller.handle(attached());assert.equal(await controller.frame('frame'),null);
});
test('foreign host events do not attach or resume; any non-iframe breaks the probe without a worker command',async()=>{
 const {controller,calls,attached}=observerFixture();await controller.arm('host');
 controller.handle(attached('iframe','unrelated'));assert.equal(await controller.frame('frame'),null);assert.equal(calls.length,1);
 controller.handle(attached('service_worker'));await assert.rejects(controller.stop(),/non-iframe/);
 assert(calls.every(c=>c.session==='host'));assert.equal(controller.snapshot().armed,false);
});
test('instrumentation failure still resumes and disarms the iframe, without accepting a baseline',async()=>{
 const {controller,calls,attached}=observerFixture(async method=>{if(method==='Page.addScriptToEvaluateOnNewDocument')throw Error('synthetic-injection-refused');});
 await controller.arm('host');controller.handle(attached());await assert.rejects(controller.frame('frame'),/synthetic-injection-refused/);
 await assert.rejects(controller.stop(),/synthetic-injection-refused/);
 assert.equal(calls.some(c=>c.method==='Runtime.runIfWaitingForDebugger'&&c.session==='child'),true);
 assert.equal(controller.snapshot().armed,false);assert.equal(controller.snapshot().pending,0);
});
test('disarm waits for in-flight injection and resume; recovery can arm only after it finishes',async()=>{
 let release;const injected=new Promise(resolve=>{release=resolve;});
 const {controller,calls,attached}=observerFixture(async method=>{if(method==='Page.addScriptToEvaluateOnNewDocument')await injected;});
 await controller.arm('host');controller.handle(attached());const stopped=controller.stop();
 await assert.rejects(controller.arm('host'),/already-armed/);assert.equal(calls.some(c=>c.method==='Target.setAutoAttach'&&c.params.autoAttach===false),false);
 release();await stopped;assert.equal(calls.at(-2).method,'Runtime.runIfWaitingForDebugger');assert.equal(calls.at(-1).params.autoAttach,false);
 await controller.arm('recovery-host');controller.handle(attached('iframe','recovery-host'));await controller.frame('frame');await controller.stop();assert.equal(controller.snapshot().attachments,2);
});

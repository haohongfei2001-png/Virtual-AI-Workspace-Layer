import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {installCspObservation,cspObservationScript,installCspMountObservation,copyCspMessage,exactBlockedCandidatesReply,readCspGrantContinuity,scanCspPage,prepareCspNativeClose,cspDomStrings,cspLeaks,exactCspControlMessage} from './fault-csp-observer.mjs';
test('extension observer preserves original Promise, request and reply without authority fabrication',async()=>{
 const replies=[],events=[],calls=[];const sandbox={location:{protocol:'chrome-extension:',pathname:'/workspace.html'},chrome:{runtime:{sendMessage(...args){calls.push(args);return replies.shift();}}},__faultCspRecord:event=>{events.push(event);return Promise.resolve();}};
 vm.runInNewContext('('+installCspObservation.toString()+')()',sandbox);
 const grant={id:'actual-grant'},message={type:'HOST_UI_JOIN'},reply={ok:true,grant};const promise=Promise.resolve(reply);replies.push(promise);assert.equal(sandbox.chrome.runtime.sendMessage(message),promise);await promise;await Promise.resolve();assert.equal(calls[0][0],message);assert.equal(sandbox.__faultCspRuntime.grant,grant);assert.equal(sandbox.__faultCspRuntime.joins,1);
 const view={ok:true,state:'ready',page:{scope:'actual-scope'}},p=Promise.resolve(view);replies.push(p);assert.equal(sandbox.chrome.runtime.sendMessage({type:'HOST_UI_VIEW'}),p);await p;await Promise.resolve();assert.equal(sandbox.__faultCspRuntime.scope,'actual-scope');assert.equal(events.length,2);assert.deepEqual(events[1].kind,'private-view');
});
test('schema rejects missing, extra, unknown or invalid control fields',()=>{
 assert(exactCspControlMessage({type:'VAIWL_UI_JOIN',role:'workspace',nonce:'abc'}));
 assert(exactCspControlMessage({type:'VAIWL_UI_BOOT',role:'sidebar',stage:'module-ready'}));
 assert(exactCspControlMessage({type:'VAIWL_UI_SUSPEND',role:'sidebar',reason:'ui-renew-failed'}));
 for(const m of [{type:'VAIWL_UI_BOOT',role:'workspace',stage:'private title'},{type:'VAIWL_UI_SUSPEND',role:'sidebar',reason:'private value'},{type:'VAIWL_UI_BOOT',role:'workspace',stage:'entry-ready',grantId:'secret'}])assert.equal(exactCspControlMessage(m),false);
 for(const m of [{type:'VAIWL_UI_JOIN',role:'workspace'},{type:'VAIWL_UI_JOIN',role:'workspace',nonce:'abc',title:'private'},{type:'VAIWL_UI_JOIN',role:'other',nonce:'abc'},{type:'UNKNOWN',role:'workspace'},{type:'VAIWL_UI_IDLE_ACK',role:'sidebar',requestId:''}])assert.equal(exactCspControlMessage(m),false);
});
test('runner-side leak detector positive controls and empty markers',()=>{assert.equal(cspLeaks(['private grant id','normal'],['grant']),1);assert.equal(cspLeaks(['normal'],['grant']),0);assert.equal(cspLeaks(['normal'],['']),0);});

test('page-visible sidebar size hint admits only the bounded content-free protocol',()=>{
 const hint={type:'VAIWL_UI_INTRINSIC_SIZE',role:'sidebar',height:240};
 for(const height of [128,240,512,1024])assert(exactCspControlMessage({...hint,height}));
 for(const height of [127,1025,240.5,NaN,Infinity,'240',null])assert.equal(exactCspControlMessage({...hint,height}),false);
 for(const value of [{...hint,role:'workspace'},{...hint,title:'private'},{...hint,grantId:'private'},{type:hint.type,role:hint.role}])assert.equal(exactCspControlMessage(value),false);
});

test('recursive lossless capture rejects unsupported nested values instead of silently dropping them',()=>{
 for(const value of [new Map([['private','secret']]),new ArrayBuffer(8),{nested:undefined},{nested:new Uint8Array([1])},{get secret(){return 'secret';}},[undefined],new Date(),{nested:NaN}])assert.throws(()=>copyCspMessage(value));
 assert.deepEqual(copyCspMessage({ok:true,values:[1,null,'yes']}),{ok:true,values:[1,null,'yes']});
});
test('foreign candidate rejection is exactly blocked, never extra private fields',()=>{
 assert(exactBlockedCandidatesReply({ok:false,state:'blocked'}));
 for(const value of [{ok:false},{ok:false,state:'blocked',items:['private']},{ok:false,state:'blocked',page:{}},{ok:false,state:'other'}])assert.equal(exactBlockedCandidatesReply(value),false);
});
test('continuity checks actual owner authority independently of native candidate geometry',async()=>{
 const grant={id:'actual-grant',mountId:'actual-mount',expiresAt:new Date(Date.now()+60000).toISOString()},calls=[];
 for(const surface of [null,{revision:2,visible:true},{revision:3,visible:false},{revision:4,visible:null}]){
  const sandbox={__faultCspRuntime:{grant,joins:1},grant,chrome:{runtime:{async sendMessage(message){calls.push(message);return {ok:true,surface};}}}};
  const state=await vm.runInNewContext('('+readCspGrantContinuity.toString()+')(grant)',sandbox);
  assert.equal(state.sameGrant,true);assert.equal(state.grantUnexpired,true);assert.equal(state.ownRead,true);assert.equal(state.grantReadType,'HOST_UI_SURFACE_STATE_GET');
 }
 assert(calls.every(m=>m.type==='HOST_UI_SURFACE_STATE_GET'&&m.grantId===grant.id&&m.mountId===grant.mountId&&Object.keys(m).sort().join(',')==='grantId,mountId,type,v'));
 for(const reply of [{ok:false,reason:'ui-authorization-unavailable'},{ok:true},{ok:true,surface:{revision:0,visible:true}},{ok:true,surface:{revision:1,visible:'yes'}},{ok:true,surface:null,private:'unexpected'}]){
  const state=await vm.runInNewContext('('+readCspGrantContinuity.toString()+')(grant)',{__faultCspRuntime:{grant,joins:1},grant,chrome:{runtime:{async sendMessage(){return reply;}}}});assert.equal(state.ownRead,false);
 }
 const state=await vm.runInNewContext('('+readCspGrantContinuity.toString()+')(grant)',{__faultCspRuntime:{grant:{...grant,id:'replacement',expiresAt:'2000-01-01T00:00:00Z'},joins:2},grant,chrome:{runtime:{async sendMessage(){return {ok:true,surface:null};}}}});assert.equal(state.sameGrant,false);assert.equal(state.grantUnexpired,false);assert.equal(state.joins,2);
});
function pageSandbox(){const listeners={},observers=[];const sandbox={location:{protocol:'http:'},TextEncoder,Element:function(){},addEventListener:(name,fn)=>listeners[name]=fn,MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}},document:{childNodes:[]}};sandbox.Element.prototype.attachShadow=function(){return {childNodes:[]};};vm.createContext(sandbox);vm.runInContext(cspObservationScript(),sandbox);return {sandbox,listeners,observers};}
test('actual MAIN listener flags Map and ArrayBuffer; preserves allowed control messages',()=>{
 const {sandbox,listeners}=pageSandbox();sandbox.emit=value=>listeners.message({origin:'chrome-extension://own',data:value});
 vm.runInContext("emit(new Map([['secret','private']]));emit(new ArrayBuffer(4));emit({nested:undefined});emit({type:'VAIWL_UI_EXIT',role:'workspace'});",sandbox);
 assert.equal(sandbox.__faultCspPage.unsupported,3);assert.equal(sandbox.__faultCspPage.messages.length,1);
});
test('bounded historical DOM capture retains removed transient text and old attributes',()=>{
 const {sandbox,observers}=pageSandbox();const text={nodeType:3,nodeValue:'transient-private-title',childNodes:[]};const target={closest:()=>true,childNodes:[]};
 observers[0]([{type:'childList',target,addedNodes:[text],removedNodes:[]},{type:'childList',target,addedNodes:[],removedNodes:[text]},{type:'attributes',target,oldValue:'old-private-grant'}]);
 assert(sandbox.__faultCspPage.shell.includes('transient-private-title'));assert(sandbox.__faultCspPage.dom.includes('old-private-grant'));
});
test('mount witness rejects unrelated extension CSP event and tracks actual retry without network',()=>{
 const listeners={},callbacks=[];const sandbox={location:{protocol:'http:'},document:{childNodes:[]},addEventListener:(n,f)=>listeners[n]=f,MutationObserver:class{constructor(f){callbacks.push(f);}observe(){}}};vm.runInNewContext('('+installCspMountObservation.toString()+')({extensionId:"own"})',sandbox);
 listeners.securitypolicyviolation({effectiveDirective:'frame-src',blockedURI:'chrome-extension://other/workspace.html'});assert.equal(sandbox.__faultCspMounts.violations,0);
 listeners.securitypolicyviolation({effectiveDirective:'frame-src',blockedURI:'chrome-extension://own/workspace.html'});assert.equal(sandbox.__faultCspMounts.violations,1);
 for(let i=0;i<2;i++)callbacks[0]([{type:'childList',addedNodes:[{nodeType:1,tagName:'IFRAME',src:'chrome-extension://own/workspace.html',childNodes:[]}]}]);assert.equal(sandbox.__faultCspMounts.attempts,2);const reused={nodeType:1,tagName:'IFRAME',src:'chrome-extension://own/workspace.html',childNodes:[]};callbacks[0]([{type:'childList',addedNodes:[reused]},{type:'childList',addedNodes:[reused]},{type:'attributes',target:reused}]);assert.equal(sandbox.__faultCspMounts.attempts,5);
});

test('final scan detects historical removed private DOM and late message, not just final endpoint',async()=>{
 let capture={shell:[],dom:[],messages:[],dropped:0,unsupported:0};
 const page={evaluate:async(fn,arg)=>fn===cspDomStrings?{strings:['native'],dropped:0}:capture};
 assert.equal((await scanCspPage({page,extensionId:'own',privateMarkers:['secret-grant']})).pageProjectionLeaks,0);
 capture={...capture,dom:['removed secret-grant'],messages:[{origin:'chrome-extension://own',value:{type:'VAIWL_UI_EXIT',role:'workspace',data:'secret-grant'}}]};
 const final=await scanCspPage({page,extensionId:'own',privateMarkers:['secret-grant']});assert(final.pageProjectionLeaks>0);assert(final.pageMessageLeaks>0);assert.equal(final.exactControlMessageSchemas,false);
});

test('historical capture includes page-readable script/style and removed owned shadow text',()=>{
 const {sandbox,observers}=pageSandbox();const ownedHost={closest:()=>true};const shadow={host:ownedHost};const shadowTarget={getRootNode:()=>shadow};
 const text=value=>({nodeType:3,nodeValue:value,childNodes:[]});
 for(const tagName of ['SCRIPT','STYLE'])observers[0]([{type:'childList',target:{},addedNodes:[{nodeType:1,tagName,attributes:[],childNodes:[text('private-'+tagName)]}],removedNodes:[]}]);
 observers[0]([{type:'childList',target:shadowTarget,addedNodes:[],removedNodes:[text('shadow-transient-title')]}]);
 assert(sandbox.__faultCspPage.dom.includes('private-SCRIPT'));assert(sandbox.__faultCspPage.dom.includes('private-STYLE'));assert(sandbox.__faultCspPage.shell.includes('shadow-transient-title'));
});

function nativeClosePage({open=false,native=true,returnWorks=true,returnAvailable=true}={}){
 const clicks=[];return {clicks,getByRole(_,{name}){return {isVisible:async()=>open,waitFor:async()=>{if(name==='返回工作空间'&&!returnAvailable)throw Error('return-control-missing');if(name!=='返回工作空间'&&!open)throw Error('surface-not-open');},click:async()=>{clicks.push(name);if(name==='返回工作空间'&&returnWorks)open=true;}};},locator(){return {isVisible:async()=>native};}};
}
test('native-input-surrender uses real return control before both close controls',async()=>{const page=nativeClosePage();const r=await prepareCspNativeClose(page);assert.equal(r.returnedThroughNativeControl,true);assert.deepEqual(page.clicks,['返回工作空间']);assert.equal(r.bothCloseControlsVisible,true);});
test('already open surfaces need no simulated native return',async()=>{const page=nativeClosePage({open:true});const r=await prepareCspNativeClose(page);assert.equal(r.returnedThroughNativeControl,false);assert.deepEqual(page.clicks,[]);});
test('missing native fallback or failed return never skips close gate',async()=>{await assert.rejects(()=>prepareCspNativeClose(nativeClosePage({native:false})));await assert.rejects(()=>prepareCspNativeClose(nativeClosePage({returnWorks:false})));});

test('missing genuine return button fails instead of forcing popover',async()=>{const page=nativeClosePage({returnAvailable:false});await assert.rejects(()=>prepareCspNativeClose(page),/return-control-missing/);assert.deepEqual(page.clicks,[]);});

test('focus reveal exposes only bounded owned geometry and no focused content',()=>{
 assert(exactCspControlMessage({type:'VAIWL_UI_REVEAL_FOCUS',role:'sidebar',top:10,bottom:40}));
 for(const value of [{type:'VAIWL_UI_REVEAL_FOCUS',role:'workspace'},{type:'VAIWL_UI_REVEAL_FOCUS',role:'sidebar',title:'private'}])assert.equal(exactCspControlMessage(value),false);
});

test('page-visible sidebar wheel carries only bounded geometry, no content or authority',()=>{
 const hint={type:'VAIWL_UI_SIDEBAR_WHEEL',role:'sidebar',x:40,y:50,delta:-80};assert(exactCspControlMessage(hint));
 for(const patch of [{role:'workspace'},{x:-1},{y:1025},{delta:0},{delta:1025},{delta:NaN},{title:'private'},{grantId:'private'}])assert.equal(exactCspControlMessage({...hint,...patch}),false);
});

test('workspace-only native close preparation never waits for an unavailable sidebar control',async()=>{const page=nativeClosePage({open:true}),get=page.getByRole;page.getByRole=(...args)=>{assert.notEqual(args[1].name,'显示原生列表');return get(...args);};const r=await prepareCspNativeClose(page,{roles:['workspace']});assert.deepEqual(r.closeRolesVisible,['workspace']);assert.equal(r.bothCloseControlsVisible,false);});

import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {openNativeProjectEntry,observeNativeProjectFrameClick,detachedProbeParentProof,validNativeFrameDiagnostic} from './native-entry-project-navigation.mjs';
function fixture(mode='normal'){
 const projectURL='http://127.0.0.1:1234/g/g-p-11111111111111111111111111111111/project',actions=[],listeners=new Map(),disposed=[];let frameDetached=false,token;const pageListeners=new Map();let current='http://127.0.0.1:1234/g/g-p-22222222222222222222222222222222/project',release;
 const node={href:projectURL,isConnected:true,addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:(t,f)=>{assert.equal(listeners.get(t),f);listeners.delete(t);}};
 const handle={evaluateHandle:async fn=>{const value=fn(node);return {evaluate:async cb=>cb(value),dispose:async()=>disposed.push('witness')};},dispose:async()=>disposed.push('element')};
 const page={isClosed:()=>mode==='parent-closed',evaluate:async()=>{if(mode==='parent-unresponsive')throw Error('parent-gone');return true;},on:(n,f)=>pageListeners.set(n,f),off:(n,f)=>{assert.equal(pageListeners.get(n),f);pageListeners.delete(n);},url:()=>current,locator:selector=>{assert(selector.includes('aside section[aria-label="Projects"]'));return {elementHandle:async()=>handle};},waitForURL:async url=>{assert.equal(url,projectURL);if(mode==='route-timeout')throw Error('same-page-deadline');await new Promise(r=>release=r);}};const pages=[page],events=new Map(),context={browser:()=>({isConnected:()=>mode!=='browser-disconnected'}),pages:()=>[...pages],on:(name,fn)=>events.set(name,fn),off:(name,fn)=>{assert.equal(events.get(name),fn);events.delete(name);}};
 const sourceFrame={isDetached:()=>frameDetached,url:()=>`chrome-extension://${'a'.repeat(32)}/workspace.html`};const frameHandle={ownerFrame:async()=>sourceFrame,evaluateHandle:async(fn,args)=>{token=args.token;return {evaluate:async callback=>{if(frameDetached)throw Error('realm-gone');return callback({state:{before:{delegationMarker:true},events:[]},stop(){if(mode==='live-cleanup-error')throw Error('live-cleanup-failed');}});},dispose:async()=>{}};},dispose:async()=>{}};
 const link={elementHandle:async()=>frameHandle,click:async()=>{if(mode!=='no-native')listeners.get('click')({currentTarget:node});if(mode==='double')listeners.get('click')({currentTarget:node});actions.push({kind:'navigate',path:mode==='wrong-action'?'/':new URL(projectURL).pathname});if(mode==='popup'){const popup={url:()=>projectURL,isClosed:()=>false};pages.push(popup);events.get('page')(popup);}if(mode==='closed-popup')events.get('page')({url:()=>projectURL,isClosed:()=>true});const sample={href:projectURL,target:'_blank',rel:'noopener noreferrer',delegationMarker:true,ariaDisabled:null,navigationReason:null,connected:true,originalNode:true,visibility:'visible',documentFocused:true},state={sourceURL:sourceFrame.url(),before:sample,events:[{...sample,phase:'bubble',defaultPrevented:true,trusted:true,button:0,modifiers:{ctrl:false,meta:false,shift:false,alt:false}}]};if(mode==='no-source')delete state.sourceURL;pageListeners.get('console')?.({type:()=>'debug',page:()=>mode==='wrong-page'?{}:page,text:()=>(mode==='wrong-nonce'?'wrong':token)+JSON.stringify(state)});if(['frame-gone','parent-closed','browser-disconnected','parent-unresponsive'].includes(mode))frameDetached=true;current=projectURL;release?.();}};
 return {args:{page,context,link,projectURL,readActions:()=>actions},listeners,disposed};
}
test('actual native entry helper accepts same-page original anchor dispatch and removes probe',async()=>{const h=fixture(),result=await openNativeProjectEntry(h.args);assert.equal(result.mode,'SAME_PAGE_NATIVE_CONTROL');assert.equal(result.newPages,0);assert.equal(result.originalNativeAnchor.clicks,1);assert.equal(h.listeners.size,0);assert.deepEqual(h.disposed,['witness','element']);});
for(const mode of ['no-native','double','wrong-action','popup','closed-popup'])test('native entry does not accept '+mode,async()=>{const h=fixture(mode);await assert.rejects(openNativeProjectEntry(h.args));assert.equal(h.listeners.size,0);assert.deepEqual(h.disposed,['witness','element']);});
test('runner binds actual helper and hashes it instead of forcing a popup',async()=>{const s=await readFile(new URL('./native-entry-safety-package-browser.mjs',import.meta.url),'utf8');assert(s.includes('await openNativeProjectEntry({page,context,link,projectURL,readActions:()=>nativeRequests})'));assert(s.includes('const projectPage=page;'));assert(s.includes("'native-entry-project-navigation.mjs'"));assert(!s.includes("waitForEvent('page')"));});

test('actual production project plan uses original control for clear input, not static href fallback',async()=>{
 const {createNativeActions}=await import('../../src/host/native-actions.mjs'),{createURLPolicy}=await import('../../src/host/url-policy.mjs');
 const origin='https://chatgpt.com',projectId='g-p-11111111111111111111111111111111',handle={id:'project_handle',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'project'};let clicks=0;
 const node={isConnected:true,click(){clicks++;}},risk={state:'clear',flags:[]},actions=createNativeActions({discovery:{getNode:()=>node},urlPolicy:createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}),currentURL:()=>origin+'/',inputRisk:()=>risk,authorize:()=>true,now:()=>1});
 const plan=actions.planNavigation({kind:'resolved',entity:'project',nativeId:projectId,navigationURL:origin+'/g/'+projectId+'/project',liveHandle:handle});assert.equal(plan.mode,'native-control');
 const command={actionId:'project_action',uiGrantId:'grant',mountId:'mount',planRevision:plan.planRevision,targetKey:actions.planKey(plan)};assert.equal((await actions.dispatchNative(command)).state,'dispatched');assert.equal(clicks,1);assert.equal((await actions.dispatchNative(command)).reason,'action-already-used');assert.equal(clicks,1);
 // The same DOM node can exist while this proposal carries no usable handle.
 const fallback=actions.planNavigation({kind:'resolved',entity:'project',nativeId:projectId,navigationURL:origin+'/g/'+projectId+'/project',liveHandle:null});assert.equal(fallback.mode,'href');assert.equal((await actions.dispatchNative({...command,actionId:'fallback_action',planRevision:fallback.planRevision,targetKey:actions.planKey(fallback)})).reason,'renderer-default-required');assert.equal(clicks,1);

});

test('navigation failure retains bounded evidence before removing passive probes',async()=>{
 const h=fixture('closed-popup');let error;try{await openNativeProjectEntry(h.args);}catch(e){error=e;}
 assert(error);const d=error.nativeProjectEntryDiagnostic;assert.equal(d.status,'DIAGNOSTIC_ONLY');assert.equal(d.openedPageCount,1);assert.equal(d.openedPages[0].closed,true);assert.equal(d.nativeAnchor.clicks,1);assert.equal(d.frame.before.delegationMarker,true);assert.equal(d.actions.length,1);assert.equal(h.listeners.size,0);
});
test('frame probe records actual capture and bubble flags without preventing or repeating input',()=>{
 const callbacks=new Map(),doc={visibilityState:'visible',hasFocus:()=>true,addEventListener:(t,f,c)=>callbacks.set(c,f),removeEventListener:(t,f,c)=>{assert.equal(callbacks.get(c),f);callbacks.delete(c);}};
 const root={},attrs={target:'_blank',rel:'noopener noreferrer','data-native-plan-control':''},node={nodeType:1,tagName:'A',getRootNode:()=>root,href:'http://127.0.0.1:1234/g/g-p-1/project',isConnected:true,ownerDocument:doc,getAttribute:k=>attrs[k]??null,hasAttribute:k=>Object.hasOwn(attrs,k),closest:()=>node};
 const probe=observeNativeProjectFrameClick(node),event={target:{closest:()=>null},composedPath:()=>[node,root,doc],defaultPrevented:false,isTrusted:true,button:0,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false};
 callbacks.get(true)(event);event.defaultPrevented=true;callbacks.get(false)(event);
 assert.deepEqual(probe.state.events.map(e=>[e.phase,e.defaultPrevented,e.delegationMarker]),[['capture',false,true],['bubble',true,true]]);
 // Document target is shadow-retargeted; only the composed original root path counts.
 const foreign={...node,getRootNode:()=>({})};event.composedPath=()=>[foreign,doc];callbacks.get(false)(event);assert.equal(probe.state.events.length,2);
 event.composedPath=()=>[doc];callbacks.get(false)(event);assert.equal(probe.state.events.length,2);
 event.composedPath=()=>[{nodeType:1,tagName:'SPAN'},node,root,doc];
 delete attrs['data-native-plan-control'];event.defaultPrevented=false;callbacks.get(false)(event);assert.equal(probe.state.events[2].delegationMarker,false);assert.equal(probe.state.events[2].defaultPrevented,false);
 for(let i=0;i<20;i++)callbacks.get(false)(event);assert.equal(probe.state.events.length,8);probe.stop();assert.equal(callbacks.size,0);
});
test('both actual callers persist diagnostic failure without altering acceptance branches',async()=>{
 for(const file of ['native-entry-safety-package-browser.mjs','evidence-order-package-browser.mjs']){const s=await readFile(new URL(file,import.meta.url),'utf8');assert(s.includes('if(error.nativeProjectEntryDiagnostic)report.nativeProjectEntryDiagnostic=error.nativeProjectEntryDiagnostic'));}
 const helper=await readFile(new URL('./native-entry-project-navigation.mjs',import.meta.url),'utf8');assert(helper.includes('page.waitForURL(projectURL,{timeout:15000})'));assert.equal(helper.split('link.click()').length,2);
});

test('same-page timeout preserves original failure and diagnostic facts, never becomes fallback PASS',async()=>{
 const h=fixture('route-timeout');await assert.rejects(openNativeProjectEntry(h.args),error=>{assert.equal(error.message,'same-page-deadline');assert.equal(error.nativeProjectEntryDiagnostic.status,'DIAGNOSTIC_ONLY');assert.equal(error.nativeProjectEntryDiagnostic.nativeAnchor.clicks,1);return true;});assert.equal(h.listeners.size,0);
});

test('successful native navigation with destroyed original frame preserves streamed click and already-gone cleanup',async()=>{
 const h=fixture('frame-gone'),result=await openNativeProjectEntry(h.args);assert.equal(result.mode,'SAME_PAGE_NATIVE_CONTROL');assert.equal(result.diagnostic.frameCleanup.status,'ALREADY_GONE');assert.equal(result.diagnostic.frameCleanup.parentDocumentResponsive,true);assert.equal(result.diagnostic.frame.events[0].defaultPrevented,true);assert.equal(result.diagnostic.liveFrameSnapshots,1);assert(!result.diagnostic.cleanupErrors);assert.equal(h.listeners.size,0);
});
for(const mode of ['parent-closed','browser-disconnected','parent-unresponsive','live-cleanup-error'])test('diagnostic cleanup still fails '+mode,async()=>{const h=fixture(mode);await assert.rejects(openNativeProjectEntry(h.args),error=>{assert(error.nativeProjectEntryDiagnostic.cleanupErrors.length);return true;});assert.equal(h.listeners.size,0);});
test('detached proof requires affirmative original-frame destruction and responsive live parent',async()=>{
 const frame={isDetached:()=>false},page={url:()=>'/expected',isClosed:()=>false,evaluate:async()=>true},context={browser:()=>({isConnected:()=>true}),pages:()=>[page]};assert.equal((await detachedProbeParentProof({sourceFrame:frame,page,context,expectedURL:'/expected'})).ok,false);
 frame.isDetached=()=>true;assert.equal((await detachedProbeParentProof({sourceFrame:frame,page,context,expectedURL:'/expected'})).ok,true);assert.equal((await detachedProbeParentProof({sourceFrame:frame,page,context,expectedURL:'/wrong'})).ok,false);
});

for(const mode of ['wrong-nonce','wrong-page','no-source'])test('stream receiver refuses '+mode,async()=>{const h=fixture(mode),result=await openNativeProjectEntry(h.args);assert.equal(result.diagnostic.liveFrameSnapshots,undefined);});
test('stream schema refuses missing source, wrong href, extra data and event overflow',()=>{
 const href='http://127.0.0.1:1/g/p/project',frameURL=`chrome-extension://${'a'.repeat(32)}/workspace.html`,before={href,target:'_blank',rel:'noopener noreferrer',delegationMarker:true,ariaDisabled:null,navigationReason:null,connected:true,originalNode:true,visibility:'visible',documentFocused:true};const state={sourceURL:frameURL,before,events:[]};assert(validNativeFrameDiagnostic(state,{href,frameURL}));
 for(const value of [{...state,sourceURL:'https://untrusted/'},{...state,unknown:'body'},{...state,before:{...before,href:href+'evil'}},{...state,events:Array(9).fill({})}])assert.equal(validNativeFrameDiagnostic(value,{href,frameURL}),false);
});

test('never-responsive parent has one bounded probe and cannot authorize ALREADY_GONE',async()=>{
 let calls=0;const frame={isDetached:()=>true},page={url:()=>'/expected',isClosed:()=>false,evaluate:()=>{calls++;return new Promise(()=>{});}},context={browser:()=>({isConnected:()=>true}),pages:()=>[page]};const started=Date.now();const proof=await detachedProbeParentProof({sourceFrame:frame,page,context,expectedURL:'/expected'});assert.equal(proof.ok,false);assert.equal(proof.parentDocumentResponsive,false);assert.equal(calls,1);assert(Date.now()-started<2500,'cleanup responsiveness must be bounded');
});

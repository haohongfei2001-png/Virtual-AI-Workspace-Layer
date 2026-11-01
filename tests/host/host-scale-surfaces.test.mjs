import test from 'node:test';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {waitHostScaleSurfaces,hostScaleFailureFacts,observeHostFlowSurfaces} from './fixtures/host-scale-surfaces.mjs';
const frame=(role,visible=async()=>true)=>({detached:false,url(){return `chrome-extension://fixture/${role}.html`;},isDetached(){return this.detached;},locator(selector){assert.equal(selector,'.workspace');return {isVisible:visible};}});
function setup(){let clock=0;const state={frames:[frame('workspace'),frame('sidebar')],open:2,closed:false};const page={frames:()=>state.frames,isClosed:()=>state.closed,locator(){return {count:async()=>state.open};},url:()=> 'http://127.0.0.1:1234/'};return {state,page,options:{extensionId:'fixture',timeout:100,now:()=>clock,pause:async ms=>{clock+=ms;}},time:()=>clock,setTime:value=>{clock=value;}};}
test('a detached observation is replaced by the unique current frame without any action replay',async()=>{
 const {state,page,options}=setup(),replacement=frame('workspace'),old=state.frames[0],events=[];
 old.locator=()=>({isVisible:async()=>{old.detached=true;state.frames=[replacement,state.frames[1]];throw Error('Frame was detached');}});
 const result=await waitHostScaleSurfaces(page,{...options,onObservation:e=>events.push(e)});assert.equal(result[0],replacement);assert(events.some(e=>e.kind==='frame-replaced-during-read'));
});
test('popover and frame readiness share one deadline, never two timeout windows',async()=>{
 const {state,page,options,time,setTime}=setup();page.locator=()=>({count:async()=>{setTime(90);return 2;}});state.frames[0]=frame('workspace',async()=>false);
 await assert.rejects(waitHostScaleSurfaces(page,options),/surfaces-deadline/);assert.equal(time(),100);
});
test('permanent product revocation stays failed instead of accepting removed UI',async()=>{
 const {state,page,options}=setup(),old=state.frames[0],events=[];old.locator=()=>({isVisible:async()=>{old.detached=true;state.frames=[];state.open=0;throw Error('Frame was detached');}});
 await assert.rejects(waitHostScaleSurfaces(page,{...options,onObservation:e=>events.push(e)}),/surfaces-deadline/);assert.equal(events.at(-1).openSurfaces,0);assert(events.at(-1).roles.every(r=>!r.present));
});
test('duplicate exact URLs or wrong-extension frames cannot stand in for current surfaces',async()=>{
 for(const kind of ['duplicate','other-extension']){const {state,page,options}=setup();if(kind==='duplicate')state.frames.push(frame('workspace'));else state.frames[0].url=()=> 'chrome-extension://other/workspace.html';await assert.rejects(waitHostScaleSurfaces(page,options),/surfaces-deadline/);}
});
test('visibility returning true for a replaced frame is not success',async()=>{
 const {state,page,options}=setup(),old=state.frames[0],replacement=frame('workspace');old.locator=()=>({isVisible:async()=>{state.frames=[replacement,state.frames[1]];return true;}});
 assert.equal((await waitHostScaleSurfaces(page,options))[0],replacement);
});
test('unrelated read error and closed parent are not swallowed as remounts',async()=>{
 const {state,page,options}=setup();state.frames[0]=frame('workspace',async()=>{throw Error('protocol read failure');});await assert.rejects(waitHostScaleSurfaces(page,options),/protocol read failure/);state.closed=true;await assert.rejects(waitHostScaleSurfaces(page,options),/native-parent-closed/);
});
test('hung readonly query is bounded by original total budget',async()=>{
 const {page}=setup();page.locator=()=>({count:()=>new Promise(()=>{})});await assert.rejects(waitHostScaleSurfaces(page,{extensionId:'fixture',timeout:10}),/surfaces-deadline/);
});
function flowSetup(){
 const f=setup();f.state.frames=[frame('workspace')];
 f.state.flow={workspace:{count:1,flow:true,visible:true,hit:true},sidebar:{count:0,flow:false,visible:false,hit:false},nativeSidebar:{present:true,visible:true,hit:true,historyInside:true,history:{visible:true,hit:true},collapsed:false,toggle:{visible:false,hit:false}}};
 f.page.evaluate=async(fn,input)=>{assert.equal(fn,observeHostFlowSurfaces);assert.deepEqual(input,{extensionId:'fixture'});return structuredClone(f.state.flow);};
 f.page.locator=()=>assert.fail('flow readiness must not infer UI from exit-popover count');
 Object.assign(f.options,{backend:'document-flow',sidebarMode:'NATIVE_RETAINED'});return f;
}
test('flow workspace requires its exact renderer and a separately visible native sidebar',async()=>{
 const f=flowSetup(),rows=await waitHostScaleSurfaces(f.page,f.options);assert.equal(rows[0],f.state.frames[0]);assert.equal(rows[1],null);
});
for(const kind of ['missing-workspace','not-flow','occluded-workspace','hidden-workspace','unexpected-sidebar-frame','missing-native-sidebar','hidden-native-sidebar','occluded-native-history','unrelated-history'])test('flow rejects '+kind,async()=>{
 const f=flowSetup(),v=f.state.flow;
 if(kind==='missing-workspace')v.workspace.count=0;if(kind==='not-flow')v.workspace.flow=false;if(kind==='occluded-workspace')v.workspace.hit=false;if(kind==='hidden-workspace')v.workspace.visible=false;if(kind==='unexpected-sidebar-frame')v.sidebar.count=1;if(kind==='missing-native-sidebar')v.nativeSidebar.present=false;if(kind==='hidden-native-sidebar')v.nativeSidebar.visible=false;if(kind==='occluded-native-history')v.nativeSidebar.history.hit=false;if(kind==='unrelated-history')v.nativeSidebar.historyInside=false;
 await assert.rejects(waitHostScaleSurfaces(f.page,f.options),/surfaces-deadline/);
});
test('flow parent geometry alone cannot accept an absent or hidden formal renderer',async()=>{
 for(const hidden of [false,true]){const f=flowSetup();if(hidden)f.state.frames[0]=frame('workspace',async()=>false);else f.state.frames=[];await assert.rejects(waitHostScaleSurfaces(f.page,f.options),/surfaces-deadline/);}
});
test('flow rechecks the parent hit target before accepting a current frame',async()=>{
 const f=flowSetup();let reads=0;f.page.evaluate=async()=>{const v=structuredClone(f.state.flow);if(++reads>1)v.workspace.hit=false;return v;};await assert.rejects(waitHostScaleSurfaces(f.page,f.options),/surfaces-deadline/);assert(reads>1);
});
test('responsive collapse requires a formally retained zero-sized sidebar and native drawer entry',async()=>{
 const f=flowSetup();f.options.sidebarMode='FORMAL_RESPONSIVE_COLLAPSED';f.state.frames.push(frame('sidebar'));Object.assign(f.state.flow.sidebar,{count:1,flow:true,withinNativeSidebar:true,zeroRect:true});Object.assign(f.state.flow.nativeSidebar,{visible:false,hit:false,collapsed:true,toggle:{visible:true,hit:true}});
 assert.equal((await waitHostScaleSurfaces(f.page,f.options))[0],f.state.frames[0]);f.state.flow.nativeSidebar.toggle.hit=false;await assert.rejects(waitHostScaleSurfaces(f.page,f.options),/surfaces-deadline/);
});
test('failure facts are bounded and text-free, including absent/closed parents',async()=>{
 assert.deepEqual(await hostScaleFailureFacts(null),{closed:true});const {page}=setup();page.evaluate=async()=>({openSurfaces:0,iframeCount:0});const facts=await hostScaleFailureFacts(page);assert.equal(facts.nativeDOM.openSurfaces,0);assert.equal(facts.frames.length,2);assert(!JSON.stringify(facts).includes('inputValue'));
});
test('runner retains original RPC failures and capture phase before owned cleanup',async()=>{
 const source=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');assert(source.includes('waitHostScaleSurfaces(page,{extensionId:id,timeout:30000'));assert(!source.includes("frames[0].locator('.workspace').waitFor"));assert(source.includes('rpcTail:report.rpc.slice(-16)'));assert(source.includes('captureError:failure.message'));assert(source.indexOf('report.failure={')<source.indexOf('const cleaned=await cleanupHostScaleRun'));
});

test('actual diagnostic callback records zero history geometry and allowlisted public status only',async()=>{
 const {page}=setup();
 const node={getBoundingClientRect:()=>({x:0,y:4000,width:228,height:0}),scrollHeight:999999,clientHeight:0};
 const document={readyState:'complete',documentElement:{dataset:{vaiwlState:'NATIVE_ONLY',vaiwlReason:'unsafe-native-geometry'}},querySelectorAll:selector=>selector.startsWith('aside')?[node]:[],querySelector:()=>null};
 page.evaluate=fn=>runInNewContext('('+fn.toString()+')()',{document,getComputedStyle:()=>({display:'flex',overflowY:'auto'})});
 const facts=await hostScaleFailureFacts(page);assert.equal(facts.nativeDOM.geometry.history.height,0);assert.equal(facts.nativeDOM.contentReason,'unsafe-native-geometry');assert.equal(facts.nativeDOM.geometry.projects.scrollHeight,999999);
 document.documentElement.dataset={vaiwlState:'SECRET'.repeat(100000),vaiwlReason:{token:'SECRET'}};
 node.getBoundingClientRect=()=>({x:Infinity,y:NaN,width:1e20,height:-1e20});
 const bad=await hostScaleFailureFacts(page);assert.equal(bad.nativeDOM.contentState,null);assert.equal(bad.nativeDOM.contentReason,null);assert.equal(bad.nativeDOM.geometry.history.width,null);assert(!JSON.stringify(bad).includes('SECRET'));assert(JSON.stringify(bad).length<4096);
});

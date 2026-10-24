import test from 'node:test';
import assert from 'node:assert/strict';
import {collectFrameAttribution,mountBreakpointLine} from '../../tools/frame-attribution/collector.mjs';
const origin='chrome-extension://'+'a'.repeat(32);
const ownEvent={method:'Debugger.paused',source:{tabId:1},params:{reason:'other',hitBreakpoints:['bp'],callFrames:[{callFrameId:'cf',url:'',location:{scriptId:'owned',lineNumber:80,columnNumber:3}}]}};
const domEvent={method:'Debugger.paused',source:{tabId:1},params:{reason:'DOM',data:{type:'attribute-modified',nodeId:1},callFrames:[{callFrameId:'writer',url:'https://example.invalid/writer.js?PRIVATE#SECRET',location:{scriptId:'writer',lineNumber:2,columnNumber:4}}]}};
const stepEvent={method:'Debugger.paused',source:{tabId:1},params:{reason:'step',callFrames:[]}};
function setup({events=[],reject,breakpoint={breakpointId:'bp'},inline=false,hangReload=false,staleSets=0,alive=true}={}){
 const calls=[];let time=0,reads=0,node=0,reloads=0;
 const cdp={async send(method,params){
  calls.push(method);if(reject===method)throw Error('denied PRIVATE_TOKEN');
  if(method==='Debugger.setBreakpointByUrl')return breakpoint;
  if(method==='Debugger.evaluateOnCallFrame')return params.returnByValue?{result:{value:['workspace','sidebar'].map(role=>({role,owned:true,connected:true,inline:false}))}}:{result:{objectId:'frame'+(++node)}};
  if(method==='DOM.requestNode')return {nodeId:Number(params.objectId.slice(5))};
  if(method==='DOMDebugger.setDOMBreakpoint'&&staleSets-->0)throw Error('Could not find node with given id');
  if(method==='Runtime.callFunctionOn')return {result:{value:params.functionDeclaration.includes('isConnected')?alive:inline}};
  return {};
 },async readEvents(){if(++reads===1)return {cursor:0,events:[]};time+=100;return {cursor:reads,events:events.length?[events.shift()]:[],truncated:false};}};
 return {calls,get reloads(){return reloads;},run:(options={})=>collectFrameAttribution({cdp,extensionOrigin:origin,mountLine:80,now:()=>time,observationMs:600,
  reload:()=>{reloads++;return hangReload?new Promise(()=>{}):Promise.resolve();},...options})};
}
test('source anchor must be unique; no hard-coded line drift',()=>{
 assert.equal(mountBreakpointLine('line\n   const inspectLayer=()=>{};'),1);
 assert.throws(()=>mountBreakpointLine('missing'));
 assert.throws(()=>mountBreakpointLine('   const inspectLayer=a\n   const inspectLayer=b'));
});
test('denial before setup causes zero reloads and no follow-on commands',async()=>{
 const h=setup({reject:'Debugger.enable'}),r=await h.run();
 assert.equal(h.reloads,0);assert.deepEqual(h.calls,['Debugger.enable']);assert.equal(r.failure.code,'ACCESS_REFUSED');
 assert(!JSON.stringify(r).includes('PRIVATE_TOKEN'));
});
test('unknown breakpoint envelope stops before reload and cleans enabled domains',async()=>{
 const h=setup({breakpoint:{result:{breakpointId:'wrapped'}}}),r=await h.run();
 assert.equal(h.reloads,0);assert.equal(r.failure.validation,'breakpoint-response-unrecognized');
 assert.equal(r.cleanup.debugger,'DONE');assert.equal(r.cleanup.dom,'DONE');
});
test('a hung reload never extends the observation deadline',async()=>{
 const h=setup({hangReload:true}),r=await h.run();
 assert.equal(h.reloads,1);assert.equal(r.state,'DEADLINE');assert.equal(r.reload,'PENDING');assert.equal(r.observationElapsedMs,600);
});
test('empty frame URL with exact owned hit arms both frames; no write is invented',async()=>{
 const h=setup({events:[ownEvent]}),r=await h.run();
 assert.equal(r.armed,2);assert.equal(r.state,'DEADLINE');assert.deepEqual(r.writes,[]);
});
test('pause cap while stepping still releases debugger and objects',async()=>{
 const h=setup({events:[ownEvent,domEvent,stepEvent]}),r=await h.run({maxPauses:2});
 assert.equal(r.pauses,2);assert.equal(r.state,'PAUSE_LIMIT');assert.equal(r.cleanup.debugger,'DONE');assert.equal(r.cleanup.objects,'DONE');
 assert.deepEqual(r.writes,[]);
});
test('independent breakpoint during step cannot certify the preceding mutation',async()=>{
 const h=setup({events:[ownEvent,domEvent,{...stepEvent,params:{reason:'other'}}]}),r=await h.run();
 assert.equal(r.state,'STEP_INTERRUPTED');assert.deepEqual(r.writes,[]);
});
test('positive writer keeps only source path/line/column, never query or locals',async()=>{
 const h=setup({events:[ownEvent,domEvent],inline:true}),r=await h.run();
 assert.equal(r.state,'WRITER_OBSERVED');assert.equal(r.writes[0].stack[0].source,'https://example.invalid/writer.js');
 assert(!JSON.stringify(r).includes('PRIVATE'));assert(!JSON.stringify(r).includes('SECRET'));
});
test('missing script metadata stays unresolved, not successful attribution',async()=>{
 const missing={...domEvent,params:{...domEvent.params,callFrames:[{url:'',location:{scriptId:'unseen',lineNumber:2,columnNumber:0}}]}};
 const h=setup({events:[ownEvent,missing],inline:true}),r=await h.run();
 assert.equal(r.state,'WRITE_OBSERVED_SOURCE_UNRESOLVED');assert.deepEqual(r.writes[0].stack,[null]);
});
test('cleanup failure is explicit and never hidden by a successful write',async()=>{
 const h=setup({events:[ownEvent,domEvent],inline:true,reject:'Debugger.disable'}),r=await h.run();
 assert.equal(r.cleanup.debugger,'ACCESS_REFUSED');assert.equal(h.calls.filter(x=>x==='Debugger.disable').length,1);
});
test('stale frontend ID permits one remapping of the same live objects, never another reload',async()=>{
 const h=setup({events:[ownEvent],staleSets:1}),r=await h.run();
 assert.equal(r.nodeRebindings,1);assert.equal(r.armed,2);assert.equal(h.reloads,1);
});
test('second stale-ID failure stops instead of looping',async()=>{
 const h=setup({events:[ownEvent],staleSets:2}),r=await h.run();
 assert.equal(r.nodeRebindings,1);assert.equal(r.state,'STOPPED');assert.equal(r.failure.code,'NODE_ALREADY_GONE');
 assert.equal(h.calls.filter(x=>x==='DOMDebugger.setDOMBreakpoint').length,2);
});
test('detached owned object cannot be rebound or confused with a replacement',async()=>{
 const h=setup({events:[ownEvent],staleSets:1,alive:false}),r=await h.run();
 assert.equal(r.nodeRebindings,0);assert.equal(r.failure.validation,'owned-node-no-longer-live');assert.equal(r.armed,0);
});

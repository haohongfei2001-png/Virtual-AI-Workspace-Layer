import test from 'node:test';
import assert from 'node:assert/strict';
import {initializationFailureStates,foregroundFailureStates,installLocalStatus,readActiveLocalStatus,validLayoutShape,readActiveLocalLayout,validLocalPipeline,createSidebarSnapshot} from '../../src/host/local-status.mjs';

test('private presentation reads never invoke native structure collectors or fall back to them',()=>{
 let listener,presentationReads=0,structureReads=0,historyReads=0;
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>{listener=f;},removeListener(){}}};
 const sender={id:runtime.id,url:runtime.getURL('status.html')},shape={counts:[1,1,1,1,1,1,1],branches:[]};
 const options={runtime,readState:()=> 'reading',readLayout:()=>{structureReads++;throw Error('native-structure-read');},observeHistory:()=>{historyReads++;throw Error('native-history-read');}};
 installLocalStatus({...options,readPresentation:()=>{presentationReads++;return shape;}});
 for(const source of [{...sender,id:'other'},{...sender,url:'https://chatgpt.com/'},{...sender,url:sender.url+'?probe'},{...sender,tab:{}}])listener({v:1,type:'HOST_LOCAL_PRESENTATION'},source,()=>assert.fail('foreign sender'));
 listener({v:1,type:'HOST_LOCAL_PRESENTATION',includeStructure:true},sender,()=>assert.fail('extra request fields'));
 assert.equal(presentationReads,0);
 let reply;listener({v:1,type:'HOST_LOCAL_PRESENTATION'},sender,r=>{reply=r;});assert.deepEqual(reply,{v:1,shape});assert.equal(presentationReads,1);
 installLocalStatus(options);reply=undefined;listener({v:1,type:'HOST_LOCAL_PRESENTATION'},sender,r=>{reply=r;});assert.deepEqual(reply,{v:1,shape:null});
 assert.equal(structureReads,0);assert.equal(historyReads,0);
});

test('private presentation rejects structural payloads at both ends without collecting a replacement',async()=>{
 const shape={counts:[1,1,1,1,1,1,1],branches:[]},target={tabId:7,documentId:'doc',url:'https://chatgpt.com/'};
 for(const key of ['sidebarStructure','mainMountCheck']){
  let listener,reads=0;const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>{listener=f;},removeListener(){}}};
  const forbidden={...shape};Object.defineProperty(forbidden,key,{enumerable:true,get(){assert.fail('structural payload accessor');}});
  installLocalStatus({runtime,readState:()=> 'reading',readPresentation:()=>forbidden,readLayout:()=>{reads++;throw Error('native-structure-read');}});
  let reply;listener({v:1,type:'HOST_LOCAL_PRESENTATION'},{id:runtime.id,url:runtime.getURL('status.html')},r=>{reply=r;});assert.deepEqual(reply,{v:1,shape:null});assert.equal(reads,0);
  let sends=0;const result=await readActiveLocalLayout({presentationOnly:true,target,webNavigation:{getFrame:async()=>({...target,documentLifecycle:'active'})},tabs:{query:()=>assert.fail('exact target only'),sendMessage:async(id,message,options)=>{sends++;assert.deepEqual(message,{v:1,type:'HOST_LOCAL_PRESENTATION'});assert.deepEqual(options,{documentId:'doc'});return {v:1,shape:forbidden};}}});
  assert.equal(result,null);assert.equal(sends,1);
 }
});

test('private presentation discards changed-document replies with no full-layout fallback',async()=>{
 const target={tabId:7,documentId:'doc',url:'https://chatgpt.com/'};let frames=0,sends=0;
 const result=await readActiveLocalLayout({presentationOnly:true,target,webNavigation:{getFrame:async()=>({documentId:'doc',url:frames++?target.url+'changed':target.url,documentLifecycle:'active'})},tabs:{query:()=>assert.fail('must keep original target'),sendMessage:async(id,message,options)=>{sends++;assert.equal(id,7);assert.deepEqual(message,{v:1,type:'HOST_LOCAL_PRESENTATION'});assert.deepEqual(options,{documentId:'doc'});return {v:1,shape:{counts:[1,1,1,1,1,1,1],branches:[]}};}}});
 assert.equal(result,null);assert.equal(sends,1);assert.equal(frames,2);
});

test('private presentation requires a trusted document target without querying another active tab',async()=>{
 for(const options of [{},{target:{tabId:7}},{target:{tabId:7,documentId:'doc',url:'https://chatgpt.com/'}}]){
  const result=await readActiveLocalLayout({...options,presentationOnly:true,tabs:{query:()=>assert.fail('unbound active-tab query'),sendMessage:()=>assert.fail('unbound presentation read')}});
  assert.equal(result,null);
 }
});
import {validSidebarStructure,sidebarStructureCoverage} from '../../src/host/history-structure-diagnostic.mjs';
import observedSidebar from './fixtures/observed-sidebar-structure.json' with {type:'json'};
import observedProjectSidebar from './fixtures/observed-sidebar-project-20261026.json' with {type:'json'};
import observedProjectDetails from './fixtures/observed-sidebar-project-details-20261026.json' with {type:'json'};
test('received Project details retain omitted control subtrees and do not invent stable member markers',()=>{
 const {sidebarStructure:report,coverage:recorded}=observedProjectDetails,rows=report.rows;
 assert.equal(observedProjectDetails.build,'2dd6a78932f5cbcb2118b8daaa6940ee9a2b226282f5ec470c3e0246f13d853f');
 assert.equal(observedProjectDetails.route,'project');assert(validSidebarStructure(report));
 const coverage=sidebarStructureCoverage(report);assert.deepEqual(coverage,recorded);
 assert.equal(rows.length,95);assert.deepEqual(coverage.gaps.missingChildren,[]);
 assert.deepEqual(coverage.gaps.depthLimitRows,[66,71,73,83,88,90]);
 assert.deepEqual(report.contextOnly,[94]);assert.equal(rows[56][3],'list');assert.equal(rows[56][5],2);
 for(const i of [57,74]){assert.equal(rows[i][0],56);assert.equal(rows[i][3],'listitem');assert.equal(rows[i][4],32);assert.equal(rows[i][4]&1,0);}
 for(const i of [66,83]){assert.equal(rows[i][2],'A');assert.equal(rows[i][4]&4,4);assert.equal(rows[i][8],true);}
 // More rows/time cannot resolve an omitted subtree, and an optimistic
 // termination label cannot turn this capture into whole-sidebar authority.
 const mislabeled=structuredClone(report);mislabeled.reason='complete';
 assert.equal(sidebarStructureCoverage(mislabeled).state,'PARTIAL');
 assert.equal(sidebarStructureCoverage(mislabeled).reason,'unexplained-omission');
});
test('focused detail coverage names its unobserved history and never certifies the whole sidebar',()=>{
 const row=(parent,position,tag,role,flags,children,omitted=false)=>[parent,position,tag,role,flags,children,[0,0,200,20],0,omitted];
 const report={schema:'sidebar-structure-v2',reason:'complete',ancestors:[],detailRoots:[3,4],contextOnly:[5],rows:[row(-1,0,'DIV','absent',0,2),row(0,0,'SECTION','absent',2,1),row(1,0,'DIV','absent',0,2),row(2,0,'DIV','absent',8,0),row(2,1,'DIV','list',32,0),row(0,1,'SECTION','absent',2,17,true)]};
 assert(validSidebarStructure(report));assert(validLayoutShape({sidebarStructure:report}));
 const coverage=sidebarStructureCoverage(report);
 assert.equal(coverage.state,'COMPLETE_FOCUSED_SNAPSHOT');assert.equal(coverage.scope,'non-history-section-details');assert.deepEqual(coverage.contextOnly,[5]);
 for(const mutate of [r=>r.detailRoots=[3,3],r=>r.contextOnly=[9],r=>r.detailRoots='PRIVATE']){const copy=structuredClone(report);mutate(copy);assert(!validSidebarStructure(copy));}
 for(const mutate of [r=>r.contextOnly=[],r=>r.contextOnly=[3],r=>r.detailRoots=[3,5],r=>r.rows[3][4]=0,r=>r.rows[4][3]='button']){const copy=structuredClone(report);mutate(copy);assert.equal(sidebarStructureCoverage(copy).state,'PARTIAL');}
 const late=structuredClone(report);late.contextOnly=[];late.reason='capacity';
 assert.equal(sidebarStructureCoverage(late).reason,'capacity');
});
test('real focused Project snapshot separates depth omissions from exhausted row budget',()=>{
 const snapshot=observedProjectSidebar,report=snapshot.sidebarStructure,rows=report.rows;
 assert.equal(snapshot.build,'b3092e59a2d160ed6618c2b620c5753010172d7504530ab75aa2ed8acfa20e71');
 assert.equal(snapshot.route,'project');assert.equal(snapshot.documentBinding,'verified-at-capture-not-account-identity');
 assert(validSidebarStructure(report));
 const coverage=sidebarStructureCoverage(report);
 assert.equal(coverage.state,'PARTIAL');assert.equal(coverage.reason,'capacity');
 assert.deepEqual(coverage.sections,snapshot.coverage.sections);
 // Snapshot indices only: the first section was traversed before history,
 // so more row budget would NOT recover these four depth-truncated subtrees.
 assert.deepEqual(coverage.gaps.depthLimitRows.filter(i=>i<44),[32,35,40,42]);
 assert.deepEqual(coverage.gaps.missingChildren,[[71,4],[255,1]]);
 assert.equal(rows[40][2],'BUTTON');assert.equal(rows[40][4]&8,8);
 assert.equal(rows[23][3],'list');assert.equal(rows[23][5],1);
 assert.equal(rows[28][3],'button');assert.equal(rows[28][4]&8,8);
 // Presence of aria-expanded is not its value. No href/member evidence in
 // this section establishes the expansion state or a Project member relation.
 assert(!rows.slice(0,44).some(r=>r[4]&5));
 assert(!coverage.gaps.unexplainedOmissionRows.includes(9),'SVG subtree is a deliberate omission');
 const mislabeled=structuredClone(report);mislabeled.reason='complete';
 assert.equal(sidebarStructureCoverage(mislabeled).state,'PARTIAL');
});
test('export binds the captured structure and strips URL, native IDs and unrelated layout data',async()=>{
 const target={tabId:7,documentId:'PRIVATE_DOCUMENT',url:'https://chatgpt.com/g/PRIVATE_PROJECT/project'},boot={v:1,stage:'module-loaded',build:'a'.repeat(64)};
 const shape={sidebarStructure:observedSidebar.report,navigation:{title:'PRIVATE_TITLE'}};
 const current={documentId:target.documentId,url:target.url,documentLifecycle:'active'};
 const snapshot=await createSidebarSnapshot({target,boot,shape,webNavigation:{getFrame:async()=>current}});
 assert.equal(snapshot.route,'project');assert.equal(snapshot.build,boot.build);assert.equal(snapshot.coverage.state,'PARTIAL');
 assert.deepEqual(snapshot.sidebarStructure,observedSidebar.report);assert.notEqual(snapshot.sidebarStructure,observedSidebar.report);
 assert(!JSON.stringify(snapshot).includes('PRIVATE'));
 for(const changed of [{...current,documentId:'other'},{...current,url:'https://chatgpt.com/'},{...current,documentLifecycle:'cached'},null])assert.equal(await createSidebarSnapshot({target,boot,shape,webNavigation:{getFrame:async()=>changed}}),null);
 for(const bad of [{...boot,stage:'module-loading'},{...boot,build:'PRIVATE'},{...boot,extra:'PRIVATE'}])assert.equal(await createSidebarSnapshot({target,boot:bad,shape,webNavigation:{getFrame:()=>assert.fail('invalid boot must not probe')}}),null);
});
test('export document lookup has one bounded attempt and no late report',async()=>{
 let expire,release,calls=0;const pending=createSidebarSnapshot({target:{tabId:7,documentId:'doc',url:'https://chatgpt.com/'},boot:{v:1,stage:'module-loaded',build:'a'.repeat(64)},shape:{sidebarStructure:observedSidebar.report},webNavigation:{getFrame:()=>{calls++;return new Promise(r=>release=r);}},schedule:f=>{expire=f;return 1;},cancel:()=>{}});
 expire();assert.equal(await pending,null);release({documentId:'doc',url:'https://chatgpt.com/',documentLifecycle:'active'});assert.equal(calls,1);
});
test('captured sidebar topology remains partial and cannot certify omitted Project controls',()=>{
 const report=observedSidebar.report,rows=report.rows;
 assert(validSidebarStructure(report));assert.equal(report.reason,'capacity');
 assert.equal(sidebarStructureCoverage(report).state,'PARTIAL');
 // These are anonymous snapshot indices, not selectors or native IDs.
 assert.equal(rows[61][0],rows[93][0]);
 assert.equal(rows[62][4]&2,2);assert.equal(rows[95][4]&2,2);
 assert.equal(rows[88][3],'button');assert.equal(rows[88][4]&8,8);
 assert.equal(rows[92][8],true);assert(rows[92][5]>0);
 const recent=rows.filter(row=>row[0]===120);
 assert.deepEqual(recent.slice(0,4).map(row=>Boolean(row[4]&1)),[true,false,false,true]);
 assert(rows.some(row=>(row[4]&1)&&(row[7]&1)),'owned masks are present in the capture; hidden is not native absence');
});
test('sidebar completeness rejects missing children, duplicate positions and omitted controls even with complete termination',()=>{
 const row=(parent,position,flags=0,children=0,omit=false)=>[parent,position,'DIV','absent',flags,children,[0,0,200,20],0,omit];
 const report={schema:'sidebar-structure-v1',reason:'complete',ancestors:[],rows:[row(-1,0,0,2),row(0,0,2,2),[1,0,'A','absent',4,0,[0,0,100,20],0,false],[1,1,'BUTTON','button',8,0,[0,0,20,20],0,false],row(0,1,2,1),row(4,0,1)]};
 assert.deepEqual(sidebarStructureCoverage(report),{state:'COMPLETE_SNAPSHOT',reason:'complete',rows:6,sections:[[1,1,0,0],[0,0,1,0]]});
 const mutate=fn=>{const copy=structuredClone(report);fn(copy);return sidebarStructureCoverage(copy);};
 assert.equal(mutate(r=>r.rows.pop()).reason,'incomplete-tree');
 assert.equal(mutate(r=>r.rows[3][1]=0).reason,'incomplete-tree');
 assert.equal(mutate(r=>{r.rows[5][5]=1;r.rows[5][8]=true;}).reason,'unexplained-omission');
 assert.equal(mutate(r=>r.rows[4][4]=0).reason,'section-boundary-unconfirmed');
 assert.equal(mutate(r=>r.reason='budget').state,'PARTIAL');
 assert.equal(mutate(r=>r.rows=[]).reason,'incomplete-tree');
 assert.equal(mutate(r=>{r.rows[5][2]='SVG';r.rows[5][5]=1;r.rows[5][8]=true;}).state,'COMPLETE_SNAPSHOT');
});
test('sidebar snapshot remains anonymous, bounded and confined to the existing layout response',()=>{
 const sidebarStructure={schema:'sidebar-structure-v1',reason:'complete',ancestors:[],rows:[[-1,0,'NAV','navigation',0,1,[0,0,200,600],0,false],[0,0,'A','absent',4,0,[0,0,200,20],0,false]]};
 const layout={counts:[0,0,0,0,0,0,0],branches:[]};
 assert(validSidebarStructure(sidebarStructure));assert(validLayoutShape({...layout,sidebarStructure}));
 assert(validLayoutShape({sidebarStructure}));assert(!validLayoutShape({}));
 assert(!validLayoutShape({sidebarStructure,navigation:null}));
 for(const invalid of [{...sidebarStructure,title:'PRIVATE'}, {...sidebarStructure,rows:[[0,0,'NAV','absent',0,0,[0,0,0,0],0,false]]},{...sidebarStructure,rows:[[-1,0,'PRIVATE','absent',0,0,[0,0,0,0],0,false]]},{...sidebarStructure,rows:Array(257).fill(sidebarStructure.rows[0])},{...sidebarStructure,ancestors:Array(9).fill(sidebarStructure.rows[0])}])assert(!validSidebarStructure(invalid));
 assert(!validLayoutShape({...layout,sidebarStructure,private:'PRIVATE'}));
 let reads=0,handler;const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>{handler=f;},removeListener(){}}};
 installLocalStatus({runtime,readState:()=> 'ready',readLayout:()=>{reads++;return {...layout,sidebarStructure};}});
 let reply;handler({v:1,type:'HOST_LOCAL_LAYOUT'},{id:'extension',url:'https://chatgpt.com/'},r=>{reply=r;});assert.equal(reads,0);
 handler({v:1,type:'HOST_LOCAL_LAYOUT'},{id:'extension',url:runtime.getURL('status.html')},r=>{reply=r;});assert.equal(reads,1);assert.deepEqual(reply.shape.sidebarStructure,sidebarStructure);
 installLocalStatus({runtime,readState:()=> 'connecting',readLayout:()=>({sidebarStructure})});
 handler({v:1,type:'HOST_LOCAL_LAYOUT'},{id:'extension',url:runtime.getURL('status.html')},r=>{reply=r;});assert.deepEqual(reply.shape,{sidebarStructure});
});
const request=()=>({v:1,type:'HOST_LOCAL_STATUS'});
const sender=()=>({id:'extension',url:'chrome-extension://extension/status.html'});
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function listenerFixture(readState=()=> 'ready'){
 const listeners=new Set();let reads=0;
 const runtime={id:'extension',getURL:path=>'chrome-extension://extension/'+path,onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
 const dispose=installLocalStatus({runtime,readState:()=>{reads++;return readState();}});
 return {listeners,dispose,reads:()=>reads,dispatch(message=request(),source=sender()){const replies=[];for(const listener of listeners)listener(message,source,value=>replies.push(value));return replies;}};
}
for(const state of [...initializationFailureStates,'ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed','layout-missing-reading','layout-geometry-header-gap','layout-history-row-order','unavailable'])test('fixed popup receives only local '+state+' enum',()=>{
 const f=listenerFixture(()=>state);assert.deepEqual(f.dispatch(),[{v:1,state}]);assert.equal(f.reads(),1);f.dispose();assert.equal(f.listeners.size,0);assert.deepEqual(f.dispatch(),[]);f.dispose();
});
for(const source of [null,{}, {...sender(),id:'other'},{...sender(),url:'https://chatgpt.com/'},{...sender(),url:'chrome-extension://extension/workspace.html'},{...sender(),url:'chrome-extension://extension/status.html#x'},{...sender(),url:'chrome-extension://extension/status.html?x'},{...sender(),tab:{}},{...sender(),tab:null}])test('reject non-popup sender '+JSON.stringify(source),()=>{
 const f=listenerFixture();assert.deepEqual(f.dispatch(request(),source),[]);assert.equal(f.reads(),0);f.dispose();
});
for(const message of [null,{},[],{v:2,type:'HOST_LOCAL_STATUS'},{v:1,type:'HOST_REFRESH'},{...request(),scope:'PRIVATE'},{...request(),extra:undefined},Object.assign(Object.create({inherited:true}),request())])test('reject malformed status request '+JSON.stringify(message),()=>{
 const f=listenerFixture();assert.deepEqual(f.dispatch(message),[]);assert.equal(f.reads(),0);f.dispose();
});
for(const value of ['PRIVATE',null,{state:'ready',scope:'PRIVATE'},['ready'],Promise.resolve('ready')])test('unknown local result never exposes private content '+String(value),()=>{
 const f=listenerFixture(()=>value);assert.deepEqual(f.dispatch(),[{v:1,state:'unavailable'}]);f.dispose();
});
test('local read exception becomes unavailable without exception text',()=>{const f=listenerFixture(()=>{throw Error('PRIVATE_TOKEN');});assert.deepEqual(f.dispatch(),[{v:1,state:'unavailable'}]);f.dispose();});
function popupFixture({query=async()=>[{id:7}],send=async()=>({v:1,state:'ready'})}={}){
 const calls=[],timers=new Map();let serial=0;
 const tabs={query:args=>{calls.push(['query',args]);return query(args);},sendMessage:(...args)=>{calls.push(['send',...args]);return send(...args);}};
 const schedule=(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},cancel=id=>timers.delete(id);
 return {calls,timers,run:()=>readActiveLocalStatus({tabs,schedule,cancel}),expire(){for(const[id,timer]of [...timers]){timers.delete(id);timer.fn();}}};
}
for(const state of [...initializationFailureStates,'ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed','layout-missing-reading','layout-geometry-header-gap','layout-history-row-order','unavailable'])test('active tab lookup has one topframe request and exact '+state+' result',async()=>{
 const f=popupFixture({query:async()=>[{id:7,get url(){throw Error('must not read private URL');},get title(){throw Error('must not read private title');}}],send:async()=>({v:1,state})});assert.equal(await f.run(),state);
 assert.deepEqual(f.calls,[['query',{active:true,currentWindow:true}],['send',7,request(),{frameId:0}]]);assert.equal(f.timers.size,0);
});
for(const response of [null,{},[],{v:2,state:'ready'},{v:1,state:'PRIVATE'},{v:1,state:'ready',scope:'PRIVATE'},{v:1,state:'ready',extra:undefined},Object.assign(Object.create({inherited:true}),{v:1,state:'ready'})])test('popup rejects malformed response '+JSON.stringify(response),async()=>{
 const f=popupFixture({send:async()=>response});assert.equal(await f.run(),'unavailable');assert.equal(f.calls.filter(c=>c[0]==='send').length,1);assert.equal(f.timers.size,0);
});
for(const rows of [[],null,[{}],[{id:-1}],[{id:'7'}],[{id:1.5}],[{id:NaN}]])test('no valid current tab yields unavailable without request '+JSON.stringify(rows),async()=>{
 const f=popupFixture({query:async()=>rows});assert.equal(await f.run(),'unavailable');assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
});
for(const stage of ['query','send'])test(stage+' rejection is unavailable with no retry',async()=>{
 const f=popupFixture({[stage]:async()=>{throw Error('PRIVATE_ERROR');}});assert.equal(await f.run(),'unavailable');assert.equal(f.calls.length,stage==='query'?1:2);assert.equal(f.timers.size,0);
});
for(const stage of ['query','send'])test('single 1000ms observation deadline fences late '+stage+' completion',async()=>{
 let release;const f=popupFixture({[stage]:()=>new Promise(resolve=>{release=resolve;})});const result=f.run();await drain();assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,1000);
 f.expire();assert.equal(await result,'unavailable');const count=f.calls.length;release(stage==='query'?[{id:7}]:{v:1,state:'ready'});await drain();assert.equal(f.calls.length,count,'late query must not dispatch, late reply must not retry');assert.equal(f.timers.size,0);
});

test('layout shape is bounded fixed metadata and restricted to the exact popup',async()=>{
 const shape={counts:[1,2,1,1,1,1,1],branches:[['DIV',true,false,true,false,1],['STYLE',false,false,false,false,0]]};
 assert.equal(validLayoutShape(shape),true);
 for(const bad of [{...shape,url:'PRIVATE'}, {...shape,counts:[34,2,1,1,1,1,1]}, {...shape,branches:[['PRIVATE',true,false,true,false,1]]}])assert.equal(validLayoutShape(bad),false);
 let listener;const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listener=f,removeListener(){}}};
 const dispose=installLocalStatus({runtime,readState:()=> 'layout-ambiguous-reading',readLayout:()=>shape});
 for(const source of [{...sender(),tab:{}},{...sender(),url:'https://chatgpt.com/'}]){let called=false;listener({v:1,type:'HOST_LOCAL_LAYOUT'},source,()=>called=true);assert.equal(called,false);}
 const tabs={query:async()=>[{id:7}],sendMessage:async(id,msg,options)=>{assert.equal(id,7);assert.deepEqual(options,{frameId:0});let result;listener(msg,sender(),r=>result=r);return result;}};
 assert.deepEqual(await readActiveLocalLayout({tabs}),shape);dispose();
});

test('layout lookup deadline fences a late tab lookup without dispatch',async()=>{
 let release,expire,sends=0;const tabs={query:()=>new Promise(r=>release=r),sendMessage:()=>{sends++;}};
 const result=readActiveLocalLayout({tabs,schedule:f=>{expire=f;return 1;},cancel:()=>{}});await drain();expire();assert.equal(await result,null);release([{id:7}]);await drain();assert.equal(sends,0);
});

test('foreground diagnostic codes use the existing private popup channel without raw response text',async()=>{
 for(const state of foregroundFailureStates){const f=listenerFixture(()=>state);assert.deepEqual(f.dispatch(),[{v:1,state}]);f.dispose();assert.equal(await popupFixture({send:async()=>({v:1,state})}).run(),state);}
 const f=listenerFixture(()=> 'foreground-PRIVATE');assert.deepEqual(f.dispatch(),[{v:1,state:'unavailable'}]);f.dispose();
});

test('Project clip diagnostic admits numeric inset geometry only',()=>{
 assert.equal(validLayoutShape({projectClip:'inset(0px 0px 0px -9999px round 16px)'}),true);
 for(const projectClip of ['url(https://private.invalid)','PRIVATE','inset(0px) account-id','inset('+('0'.repeat(200))+'px)'])assert.equal(validLayoutShape({projectClip}),false);
 assert.equal(validLayoutShape({projectClip:'inset(0px)',title:'private'}),false);
});

 test('navigation summary admits only fixed phase and bounded counts, never row data',()=>{
 const navigation={phase:'accepted',roots:[1,1,1],firstOutside:[],firstClip:[],memberShape:[],headingShape:[],memberReject:Array(7).fill(0),rejected:Array(11).fill(0),matched:3,visible:2,titles:2,association:1,candidates:3,claims:2};
 assert.equal(validLayoutShape({navigation}),true);
 for(const n of [{...navigation,url:'PRIVATE'},{...navigation,phase:'PRIVATE'},{...navigation,matched:257},{...navigation,roots:[1,1,1,1]},{...navigation,titles:-1}])assert.equal(validLayoutShape({navigation:n}),false);
 });

test('one-time structure diagnostic accepts only the private popup and fixed anonymous report',async()=>{
 const {validHistoryStructureReport}=await import('../../src/host/history-structure-diagnostic.mjs');
 const report={schema:'history-structure-v1',reason:'complete',truncated:false,events:0,elapsedMs:6000,snapshots:[],operations:[]};
 assert(validHistoryStructureReport(report));assert(!validHistoryStructureReport({...report,title:'PRIVATE'}));
 assert(!validHistoryStructureReport({...report,operations:[{at:1,kind:'children',target:'PRIVATE',removed:[],added:[]}]}));
 let listener,calls=0;const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listener=f,removeListener(){}}};
 const dispose=installLocalStatus({runtime,readState:()=> 'ready',observeHistory:async()=>{calls++;return report;}});
 const message={v:1,type:'HOST_LOCAL_HISTORY_STRUCTURE'};
 for(const source of [{...sender(),tab:{}},{...sender(),url:'https://chatgpt.com/'}])assert.equal(listener(message,source,()=>assert.fail()),undefined);
 const result=await new Promise(resolve=>assert.equal(listener(message,sender(),resolve),true));
 assert.deepEqual(result,{v:1,report});assert.equal(calls,1);dispose();
});

test('structure diagnostic spends before dispatch and never retries an unknown outcome',async()=>{
 const {HISTORY_DIAGNOSTIC_BATCH,runHistoryDiagnosticOnce}=await import('../../src/host/history-structure-diagnostic.mjs');
 const saved={};let sends=0;
 const chrome={storage:{local:{get:async key=>({[key]:saved[key]}),set:async value=>Object.assign(saved,value)}},tabs:{query:async()=>[{id:7,incognito:false}],sendMessage:async()=>{assert.equal(saved[HISTORY_DIAGNOSTIC_BATCH].spent,true);sends++;throw Error('PRIVATE');}}};
 const locks={request:async(key,run)=>run()};
 assert.equal((await runHistoryDiagnosticOnce({chrome,locks})).state,'outcome-unknown');
 assert.deepEqual(await runHistoryDiagnosticOnce({chrome,locks}),{state:'spent',report:null});assert.equal(sends,1);
});

test('local pipeline reports only counts and separate versions, never raw rows or IDs',()=>{
 const p={storage:'session',nativeRevision:3,projects:1,refs:2,lastWorkspaceDelivery:{versions:[2,0,0,0],segment:0,inventory:[1,1],groups:[1,1],noProject:[0,0],unknown:[1,1]}};
 assert(validLocalPipeline(p));assert(validLocalPipeline({...p,projects:null,refs:null,lastWorkspaceDelivery:null}));
 for(const bad of [{...p,scope:'PRIVATE'},{...p,refs:'PRIVATE'},{...p,storage:'server'},{...p,lastWorkspaceDelivery:{...p.lastWorkspaceDelivery,url:'PRIVATE'}}])assert(!validLocalPipeline(bad));
});
for(const [stage,message,expected]of [['query','PRIVATE','tab-query-failed'],['send','Could not establish connection. Receiving end does not exist.','receiver-unavailable'],['send','The message port closed before a response was received.','receiver-disconnected'],['send','No tab with id: 123','tab-closed'],['send','PRIVATE','transport-error']])test('status retains fixed failure stage '+expected+' without retry or error text',async()=>{
 let code,sends=0;const tabs={query:async()=>{if(stage==='query')throw Error(message);return [{id:7}];},sendMessage:async()=>{sends++;throw Error(message);}};
 assert.equal(await readActiveLocalStatus({tabs,onFailure:c=>code=c}),'unavailable');assert.equal(code,expected);assert.equal(sends,stage==='query'?0:1);
});

for(const changed of [false,true])test('status targets exact browser document and rejects replacement '+changed,async()=>{
 let reads=0,sends=0,code;const tabs={query:async()=>[{id:7}],sendMessage:async(id,message,options)=>{sends++;assert.equal(id,7);assert.deepEqual(options,{documentId:'old'});return {v:1,state:'reading'};}};
 const webNavigation={getFrame:async()=>({documentId:changed&&reads++?'new':'old',documentLifecycle:'active',url:'https://chatgpt.com/'})};
 const result=await readActiveLocalStatus({tabs,webNavigation,onFailure:c=>code=c});
 assert.equal(result,changed?'unavailable':'reading');assert.equal(code,changed?'document-changed':undefined);assert.equal(sends,1);
});
test('status timeout during document lookup cannot later dispatch into a replacement',async()=>{
 let release,expire,sends=0;const pending=readActiveLocalStatus({tabs:{query:async()=>[{id:7}],sendMessage:()=>{sends++;}},webNavigation:{getFrame:()=>new Promise(r=>release=r)},schedule:f=>{expire=f;return 1;},cancel:()=>{}});
 await drain();expire();assert.equal(await pending,'unavailable');release({documentId:'late',documentLifecycle:'active'});await drain();assert.equal(sends,0);
});

test('anonymous delivery shape rejects content, extra fields and overflow',()=>{
 const navigation={phase:'accepted',roots:[1,1,0],firstOutside:[],firstClip:[],memberShape:[],headingShape:[],memberReject:Array(7).fill(0),rejected:Array(11).fill(0),matched:0,visible:0,titles:0,association:0,candidates:0,claims:0};
 const delivery={pages:3,resolvedProjects:0,resolvedChats:4,acceptedPackets:2,acceptedProjects:0,acceptedChats:4,rejectedPackets:0,capped:false};
 assert(validLayoutShape({navigation,delivery}));for(const bad of [{...delivery,title:'PRIVATE'},{...delivery,pages:'PRIVATE'},{...delivery,pages:1000001}])assert(!validLayoutShape({navigation,delivery:bad}));
});
test('current boundary diagnostics are fixed private categories and preserve legacy layout compatibility',()=>{
 const navigation={phase:'accepted',roots:[1,1,0],firstOutside:[],firstClip:[],memberShape:[],headingShape:[],memberReject:Array(7).fill(0),rejected:Array(11).fill(0),matched:0,visible:0,titles:0,association:0,candidates:0,claims:0};
 const delivery={pages:0,resolvedProjects:0,resolvedChats:0,acceptedPackets:0,acceptedProjects:0,acceptedChats:0,rejectedPackets:0,capped:false};
 const presentation={mode:'reading',attempt:'show-returned',registered:true,frames:2,grants:2,workspace:false,sidebar:true,geometryPaused:false,returnPresent:true};
 const shape={navigation,delivery,presentation},boundary={phase:'presentation',reason:'region-identity-changed',key:'composer'};
 assert(validLayoutShape(shape));assert(validLayoutShape({...shape,presentation:{...presentation,boundary:null}}));
 assert(validLayoutShape({...shape,presentation:{...presentation,boundary}}));
 const projectBoundary={phase:'initial',reason:'unsafe-native-geometry',key:null,projectStage:'geometry-overflow'};
 assert(validLayoutShape({...shape,presentation:{...presentation,boundary:projectBoundary}}));
 assert(validLayoutShape({...shape,presentation:{...presentation,boundary:null,mountFailure:'surface-native-flow-wrapper-paint'}}));
 assert(validLayoutShape({...shape,presentation:{...presentation,mountFailure:null}}));
 for(const invalid of [{...projectBoundary,projectStage:'PRIVATE_TITLE'},{...projectBoundary,reason:'region-identity-changed'},{...projectBoundary,projectStage:{node:'PRIVATE'}},{...projectBoundary,nativeId:'PRIVATE'}])assert(!validLayoutShape({...shape,presentation:{...presentation,boundary:invalid}}));
 let reads=0;const accessor={...projectBoundary};Object.defineProperty(accessor,'projectStage',{get(){reads++;return 'paint';}});
 assert(!validLayoutShape({...shape,presentation:{...presentation,boundary:accessor}}));assert.equal(reads,0);
 for(const mountFailure of ['PRIVATE','surface-'+JSON.stringify({node:'PRIVATE'}),{},false])assert(!validLayoutShape({...shape,presentation:{...presentation,mountFailure}}));
 for(const invalid of [true,{},Object.assign(Object.create(null),boundary),{...boundary,phase:'PRIVATE'},{...boundary,reason:'PRIVATE'},{...boundary,key:'PRIVATE'},{...boundary,url:'https://chatgpt.com/c/PRIVATE'}])assert(!validLayoutShape({...shape,presentation:{...presentation,boundary:invalid}}));
});
test('SPA replacement is rejected even with the same document ID',async()=>{
 let reads=0,code,target;const webNavigation={getFrame:async()=>({documentId:'doc',url:reads++?'https://chatgpt.com/g/private/project':'https://chatgpt.com/',documentLifecycle:'active'})};
 assert.equal(await readActiveLocalStatus({webNavigation,tabs:{query:async()=>[{id:7}],sendMessage:async()=>({v:1,state:'ready'})},onTarget:t=>target=t,onFailure:c=>code=c}),'unavailable');assert.equal(code,'document-changed');assert.equal(target,undefined);
});
test('layout reuses status target and drops data if that route changed',async()=>{
 const target={tabId:7,documentId:'doc',url:'https://chatgpt.com/'};let reads=0,sends=0;
 const result=await readActiveLocalLayout({target,webNavigation:{getFrame:async()=>({documentId:'doc',url:reads++?target.url+'c/private':target.url,documentLifecycle:'active'})},tabs:{query:()=>assert.fail('must reuse the exact status target'),sendMessage:async(id,m,o)=>{sends++;assert.equal(id,7);assert.deepEqual(o,{documentId:'doc'});return {v:1,shape:{counts:[1,1,1,1,1,1,1],branches:[]}};}}});
 assert.equal(result,null);assert.equal(sends,1);
});

test('anonymous presentation and frame receipt validators reject content and invented success',()=>{
 const p={storage:'session',nativeRevision:3,projects:0,refs:13,lastWorkspaceDelivery:null,workspaceReceipt:{deliveryId:3,phase:'received',cards:null,rows:null}};
 assert(validLocalPipeline(p));assert(!validLocalPipeline({...p,workspaceReceipt:{...p.workspaceReceipt,rows:13}}));
 assert(validLocalPipeline({...p,workspaceReceipt:{deliveryId:3,phase:'rendered',cards:0,rows:5}}));
 assert(!validLocalPipeline({...p,workspaceReceipt:{deliveryId:3,phase:'rendered',cards:0,rows:5,title:'private'}}));
});


test('bounded transport recovery reports only fixed diagnostics through the existing status schema',async()=>{
 for(const state of ['surface-recovery-rate-limited','surface-recovery-clock-invalid']){
  const f=listenerFixture(()=>state);assert.deepEqual(f.dispatch(),[{v:1,state}]);f.dispose();
  assert.equal(await popupFixture({send:async()=>({v:1,state})}).run(),state);
 }
 const f=listenerFixture(()=> 'surface-recovery-rate-limited:PRIVATE');assert.deepEqual(f.dispatch(),[{v:1,state:'unavailable'}]);f.dispose();
});

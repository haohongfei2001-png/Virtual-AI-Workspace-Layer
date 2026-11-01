import {requestLocalReconnect} from '../../src/host/local-reconnect.mjs';
import {projectSurfaceFailureReasons} from '../../src/host/native-project-surface.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registeredHostBuild} from '../../extension/runtime-build.mjs';
import {initializationFailureStates,readActiveLocalStatus,readActiveLocalLayout,readLocalBoot,validLocalPipeline,createSidebarSnapshot} from '../../src/host/local-status.mjs';
const source=readFileSync(new URL('../../extension/status.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../../extension/status.html',import.meta.url),'utf8');
const importLine="import {PROJECT_WRAPPER_DIAGNOSTIC_BATCH,validProjectWrapperReport,isProjectDiagnosticURL} from '../src/host/project-wrapper-diagnostic.mjs';\nimport {runProjectWrapperDiagnosticOnce,readProjectWrapperDiagnostic} from '../src/host/project-wrapper-diagnostic-channel.mjs';\nimport {requestLocalReconnect} from '../src/host/local-reconnect.mjs';\nimport {HOST_CONFIG} from './config.mjs';\nimport {readActiveLocalStatus,readActiveLocalLayout,readLocalBoot,validLocalPipeline,createSidebarSnapshot,createMainMountSnapshot} from '../src/host/local-status.mjs';\nimport {HISTORY_DIAGNOSTIC_BATCH,validHistoryStructureReport,runHistoryDiagnosticOnce,sidebarStructureCoverage} from '../src/host/history-structure-diagnostic.mjs';\nimport {HOST_BUILD,registeredHostBuild} from './runtime-build.mjs';\n";
assert(source.startsWith(importLine),'execute actual popup body after its exact imports');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function render(initial,browserLocal=false,localState={ok:true},boot=undefined,trustedTarget=false,layouts={},environment={}){
 if(boot===undefined)boot={v:1,stage:'module-loaded',build:'a'.repeat(64)};
 let current=initial;const calls=[],node={textContent:''};
 const chrome={tabs:{query:async args=>{calls.push(['query',args]);return [{id:7,get title(){throw Error('PRIVATE_TITLE');},get url(){throw Error('PRIVATE_URL');}}];},sendMessage:async(...args)=>{calls.push(['send',...args]);if(environment.reply)return environment.reply(args,current);return args[1]?.type==='HOST_LOCAL_LAYOUT'?{v:1,shape:layouts.full??null}:args[1]?.type==='HOST_LOCAL_PRESENTATION'?{v:1,shape:layouts.presentation??null}:args[1]?.type==='HOST_LOCAL_BOOT'?boot:args[1]?.type==='HOST_LOCAL_RECONNECT'?{v:1,ok:true}:current;}}};
 let frameReads=0;
 if(trustedTarget)chrome.webNavigation={getFrame:async()=>{frameReads++;return environment.frame?environment.frame(frameReads,calls):{documentId:'document',url:'https://chatgpt.com/',documentLifecycle:'active'};}};
 const elements=[];
 const make=tag=>({tag,textContent:'',children:[],append(...nodes){this.children.push(...nodes);},listeners:{},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}});
 const details=make('details'),summary=make('summary'),buildKind=make('p');details.id='diagnostic-details';summary.textContent='诊断详情';buildKind.id='build-kind';buildKind.textContent='构建类别未标定，请先验证安装包。';details.append(summary,buildKind);elements.push(details);
 if(html.includes('id="diagnostic-summary"')){const fixed=make('section');fixed.id='diagnostic-summary';for(const id of ['runtime-build','boot-stage','status-code','mount-stage']){const p=make('p');p.id=id;p.textContent=new RegExp('<p id="'+id+'"[^>]*>([^<]*)</p>').exec(html)?.[1]??'';fixed.append(p);}elements.unshift(fixed);}
 const find=(nodes,id)=>{for(const e of nodes){if(e.id===id)return e;const nested=find(e.children??[],id);if(nested)return nested;}return null;};
 const byId=id=>id==='status'?node:find(elements,id);
 const document={getElementById:byId,body:{append:e=>{const old=elements.indexOf(e);if(old>=0)elements.splice(old,1);elements.push(e);}},createElement:make};
 chrome.runtime={getManifest:()=>({version_name:environment.registeredBuild??'a'.repeat(64)}),sendMessage:async message=>{calls.push(['control',message]);return localState;}};
 await new AsyncFunction('requestLocalReconnect','HOST_CONFIG','readActiveLocalStatus','readActiveLocalLayout','readLocalBoot','validLocalPipeline','createSidebarSnapshot','chrome','document','HOST_BUILD','registeredHostBuild',source.slice(importLine.length))(requestLocalReconnect,{browserLocal},readActiveLocalStatus,readActiveLocalLayout,environment.realBoot?readLocalBoot:async()=>boot,validLocalPipeline,createSidebarSnapshot,chrome,document,'a'.repeat(64),registeredHostBuild);
 return {calls,node,elements,byId,frameReads,change:value=>{current=value;}};
}
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const summaryIds=['runtime-build','boot-stage','status-code','mount-stage'];
const currentFrame={documentId:'document',url:'https://chatgpt.com/',documentLifecycle:'active'};
const currentBoot={v:1,stage:'module-loaded',build:'a'.repeat(64)};
test('version fence rejects a historical BOOT without relabeling its observed fingerprint',async()=>{
 const old={v:1,stage:'module-loaded',build:'e287d27625cbeadbfdb3bf4410fe16011e0ae73c68bdf436b1071a38b50279cf'};
 const f=await render({v:1,state:'ready'},true,{ok:true,mode:'personal',exists:true},old,true,{presentation:presentationShape({mode:'workspace',attempt:'show-returned'})},{realBoot:true});
 assert.match(f.byId('status-code').textContent,/runtime-build-mismatch/);
 assert(f.byId('runtime-build').textContent.includes(old.build));
 assert.doesNotMatch(f.node.textContent,/增强界面已连接/);assert.doesNotMatch(f.byId('mount-stage').textContent,/show-returned/);
 assert(!f.byId('read-sidebar-structure'));assert(!f.calls.some(c=>c[0]==='control'));
 const [unlock,lock]=f.elements.filter(e=>e.tag==='button');assert(unlock.disabled);unlock.listeners.click();await drain();assert(!f.calls.some(c=>c[0]==='control'));
 lock.listeners.click();await drain();assert(unlock.disabled);assert.deepEqual(f.calls.filter(c=>c[0]==='control').map(c=>c[1].action),['lock']);
});
test('version fence rejects a stale registered manifest even with a matching BOOT',async()=>{
 const f=await render({v:1,state:'ready'},true,{ok:true},currentBoot,true,{presentation:presentationShape()},{realBoot:true,registeredBuild:'b'.repeat(64)});
 assert.match(f.byId('status-code').textContent,/runtime-registration-mismatch/);assert(!f.calls.some(c=>c[0]==='control'));
});
test('version fence never accepts ready without a current BOOT',async()=>{
 const f=await render({v:1,state:'ready'},true,{ok:true},null,true,{presentation:presentationShape()},{realBoot:true});
 assert.match(f.byId('status-code').textContent,/runtime-build-unverified/);assert(!f.calls.some(c=>c[0]==='control'));assert(!f.byId('read-sidebar-structure'));
});
function presentationShape(patch={}){
 const navigation={phase:'accepted',roots:[1,1,0],firstOutside:[],firstClip:[],memberShape:[],headingShape:[],memberReject:Array(7).fill(0),rejected:Array(11).fill(0),matched:0,visible:0,titles:0,association:0,candidates:0,claims:0};
 const delivery={pages:0,resolvedProjects:0,resolvedChats:0,acceptedPackets:0,acceptedProjects:0,acceptedChats:0,rejectedPackets:0,capped:false};
 const presentation={mode:'waiting',attempt:'not-attempted',registered:false,frames:0,grants:0,workspace:null,sidebar:null,geometryPaused:false,returnPresent:false,...patch};
 return {navigation,delivery,presentation};
}
for(const id of summaryIds)test('fixed summary has a static accessible placeholder outside closed details: '+id,()=>{
 const outside=html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))??[]).length,1);
 assert.match(outside,new RegExp('<p id="'+id+'"[^>]*>[^<]*(?:正在|等待|未核实|未就绪)'));
 assert.doesNotMatch(outside,/<(?:section|p)\b[^>]*(?:hidden|aria-hidden="true")/);
});
test('fixed summary exposes current build, boot, status and existing refusal while details stay closed',async()=>{
 const shape=presentationShape({boundary:{phase:'initial',reason:'unsafe-native-project-layout',key:null,projectStage:'rows'},mountFailure:'surface-native-flow-wrapper-paint',layoutRefusal:null});
 const f=await render({v:1,state:'layout-project-rows'},true,{ok:true},currentBoot,true,{presentation:shape},{realBoot:true});
 const fixed=f.byId('diagnostic-summary');assert(fixed);assert.notEqual(f.byId('diagnostic-details').open,true);
 for(const id of summaryIds)assert(fixed.children.includes(f.byId(id)),id+' must be outside details');
 assert(f.byId('runtime-build').textContent.includes(currentBoot.build));assert.match(f.byId('boot-stage').textContent,/module-loaded/);
 assert.match(f.byId('status-code').textContent,/layout-project-rows/);
 assert.match(f.byId('mount-stage').textContent,/initial.*unsafe-native-project-layout.*rows.*surface-native-flow-wrapper-paint/);
 assert.deepEqual(f.calls.filter(c=>c[0]==='send').map(c=>c[2].type).sort(),['HOST_LOCAL_BOOT','HOST_LOCAL_PRESENTATION','HOST_LOCAL_STATUS']);
});
for(const [name,change] of [['documentId',{documentId:'replacement'}],['same-document route',{url:'https://chatgpt.com/g/private/project'}],['inactive document',{documentLifecycle:'cached'}]])test('snapshot invalidation clears earlier status when '+name+' changes after STATUS',async()=>{
 const f=await render({v:1,state:'ready'},true,{ok:true},currentBoot,true,{presentation:presentationShape()},{realBoot:true,frame:n=>n<=2?currentFrame:{...currentFrame,...change}});
 assert.match(f.byId('status-code').textContent,/unavailable.*document-changed/);assert.doesNotMatch(f.byId('status-code').textContent,/ready/);
 assert(!f.byId('runtime-build').textContent.includes(currentBoot.build));assert.match(f.byId('mount-stage').textContent,/文档.*变化/);
 assert(!f.byId('local-layout-shape'));assert(!f.byId('read-sidebar-structure'));
 assert(!f.calls.some(c=>c[0]==='control'&&c[1].action==='status'));
});
test('snapshot invalidation clears all successful channels if the document changes at the final check',async()=>{
 const f=await render({v:1,state:'ready'},true,{ok:true},currentBoot,true,{presentation:presentationShape({boundary:null,mountFailure:null,layoutRefusal:null})},{realBoot:true,frame:n=>n<=6?currentFrame:{...currentFrame,documentId:'replacement'}});
 assert.match(f.byId('status-code').textContent,/document-changed/);assert(!f.byId('runtime-build').textContent.includes(currentBoot.build));assert(!f.byId('local-layout-shape'));
 assert.equal(f.calls.filter(c=>c[0]==='send').length,3,'no resampling or fallback');
});
test('snapshot invalidation fails closed when final document lookup rejects',async()=>{
 const f=await render({v:1,state:'ready'},true,{ok:true},currentBoot,true,{presentation:presentationShape()},{realBoot:true,frame:n=>{if(n>6)throw Error('PRIVATE_DOCUMENT_ERROR');return currentFrame;}});
 assert.match(f.byId('status-code').textContent,/unavailable.*document-query-failed/);assert(!f.byId('runtime-build').textContent.includes(currentBoot.build));
 for(const id of summaryIds)assert(!f.byId(id).textContent.includes('PRIVATE'));
});
test('snapshot invalidation latches an observed route change even if the final lookup returns to the old URL',async()=>{
 const f=await render({v:1,state:'ready'},true,{ok:true},currentBoot,true,{presentation:presentationShape()},{realBoot:true,frame:n=>n===3?{...currentFrame,url:'https://chatgpt.com/c/private'}:currentFrame});
 assert.match(f.byId('status-code').textContent,/unavailable.*document-changed/);assert(!f.byId('runtime-build').textContent.includes(currentBoot.build));assert(!f.byId('local-layout-shape'));
});
for(const stage of ['module-loading','module-load-failed'])test('fixed summary keeps independent BOOT when STATUS receiver is missing: '+stage,async()=>{
 const boot={...currentBoot,stage};
 const f=await render(null,true,{ok:true},boot,true,{}, {realBoot:true,reply:args=>{if(args[1].type==='HOST_LOCAL_STATUS')throw Error('Could not establish connection. Receiving end does not exist.');if(args[1].type==='HOST_LOCAL_BOOT')return boot;assert.fail('unexpected request');}});
 assert.match(f.byId('status-code').textContent,/runtime-build-unverified.*receiver-unavailable/);assert(f.byId('runtime-build').textContent.includes(boot.build));assert(f.byId('boot-stage').textContent.includes(stage));
 assert.match(f.byId('mount-stage').textContent,/未采用/);assert.equal(f.calls.filter(c=>c[0]==='send').length,2);
});
for(const [label,boot] of [['missing',null],['bad stage',{...currentBoot,stage:'PRIVATE_STAGE'}],['bad fingerprint',{...currentBoot,build:'PRIVATE_BUILD'}],['extra private field',{...currentBoot,title:'PRIVATE_TITLE'}]])test('fixed summary rejects '+label+' BOOT without inferring disk version',async()=>{
 const f=await render({v:1,state:'ready'},true,{ok:true},boot,true,{}, {realBoot:true});
 assert.match(f.byId('runtime-build').textContent,/未核实.*不能用磁盘文件推定/);assert.match(f.byId('boot-stage').textContent,/未核实/);
 for(const id of summaryIds)assert(!f.byId(id).textContent.includes('PRIVATE'));
});
for(const [label,shape,expected] of [
 ['missing',null,/未取得当前文档回执/],
 ['no presentation field',{counts:[1,1,1,1,1,1,1],branches:[]},/未提供挂载阶段/],
 ['controller not ready',{...presentationShape(),presentation:null},/presentation=null.*未就绪/],
 ['omitted optional fields',presentationShape(),/boundary=未提供.*mountFailure=未提供.*layoutRefusal=未提供/],
 ['explicit null fields',presentationShape({boundary:null,mountFailure:null,layoutRefusal:null}),/boundary=null.*mountFailure=null.*layoutRefusal=null/],
 ['active layout refusal',presentationShape({boundary:null,mountFailure:null,layoutRefusal:'control-overlap'}),/layoutRefusal=control-overlap/],
 ['private rejection text',presentationShape({boundary:{phase:'initial',reason:'PRIVATE_BODY',key:null}}),/未取得当前文档回执/]
])test('fixed summary distinguishes '+label+' PRESENTATION',async()=>{
 const f=await render({v:1,state:'ready'},true,{ok:true},currentBoot,true,{presentation:shape},{realBoot:true});
 assert.match(f.byId('mount-stage').textContent,expected);assert.doesNotMatch(f.byId('mount-stage').textContent,/PRIVATE|挂载成功|已通过/);
 assert(!f.calls.some(c=>c[0]==='send'&&['HOST_LOCAL_LAYOUT','HOST_LOCAL_HISTORY_STRUCTURE'].includes(c[2].type)));
});
test('snapshot invalidation has a bounded final check and ignores its late old-document completion',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const f=await render({v:1,state:'ready'},true,{ok:true},currentBoot,true,{presentation:presentationShape()},{realBoot:true,frame:n=>n>6?pending:currentFrame});
 assert.match(f.byId('status-code').textContent,/unavailable.*timeout/);assert(!f.byId('runtime-build').textContent.includes(currentBoot.build));
 const before=summaryIds.map(id=>f.byId(id).textContent);finish(currentFrame);await drain();assert.deepEqual(summaryIds.map(id=>f.byId(id).textContent),before);
});
test('actual BrowserLocal popup reads presentation by default and collects structure only on one explicit click',async()=>{
 const f=await render({v:1,state:'reading'},true,{ok:true,mode:'locked',exists:true},currentBoot,true,{presentation:{counts:[1,1,1,1,1,1,1],branches:[]}});
 assert.equal(f.calls.filter(c=>c[0]==='send'&&c[2].type==='HOST_LOCAL_LAYOUT').length,0);
 assert.equal(f.calls.filter(c=>c[0]==='send'&&c[2].type==='HOST_LOCAL_PRESENTATION').length,1);
 assert.equal(f.calls.filter(c=>c[0]==='send'&&c[2].type==='HOST_LOCAL_HISTORY_STRUCTURE').length,0);
 assert(f.byId('local-layout-shape'));assert(!f.byId('save-sidebar-snapshot'));
 const capture=f.byId('read-sidebar-structure');assert(capture);const first=capture.listeners.click();const second=capture.listeners.click();await Promise.all([first,second]);await drain();
 assert.equal(capture.disabled,true);assert.equal(f.calls.filter(c=>c[0]==='send'&&c[2].type==='HOST_LOCAL_LAYOUT').length,1);
 assert.equal(f.calls.filter(c=>c[0]==='send'&&c[2].type==='HOST_LOCAL_HISTORY_STRUCTURE').length,0);
 assert(!f.byId('save-sidebar-snapshot'),'failed explicit read must not create an export or retry');
});
function assertSnapshotMeaning(text){
 const visible=text+' '+html.replace(/<[^>]*>/g,' ');
 assert.match(visible,/打开.{0,12}(?:时|状态)|本次(?:检查|读取)|状态快照/,'one-shot result must be explicitly presented as a snapshot');
 assert.match(visible,/(?:重新|再次).{0,8}打开|关闭.{0,8}打开/,'explain how the user can obtain a fresh local observation without polling');
}
for(const state of ['ready','reading','suspended','dormant','connecting','waiting','verification-required','frame-blocked','layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed','layout-missing-reading','layout-geometry-header-gap','unavailable'])test('actual popup renders '+state+' as a single local snapshot',async()=>{
 const f=await render({v:1,state});assert.equal(typeof f.node.textContent,'string');assert(f.node.textContent.length>0);assertSnapshotMeaning(f.node.textContent);
 const expected=[['query',{active:true,currentWindow:true}],['send',7,{v:1,type:'HOST_LOCAL_STATUS'},{frameId:0}]];if(state.startsWith('layout-'))expected.push(['query',{active:true,currentWindow:true}],['send',7,{v:1,type:'HOST_LOCAL_LAYOUT'},{frameId:0}]);assert.deepEqual(f.calls,expected);
 const before=f.node.textContent;f.change({v:1,state:state==='ready'?'waiting':'ready'});await drain();assert.equal(f.calls.length,expected.length,'no polling or automatic refresh');assert.equal(f.node.textContent,before,'snapshot remains explicitly historical');
});
for(const response of [{v:1,state:'PRIVATE_TOKEN'},{v:1,state:'ready',title:'PRIVATE_TITLE'},{v:1,state:{scope:'PRIVATE_SCOPE'}},{v:1,state:'waiting',error:'PRIVATE_BODY'}])test('actual popup discards malformed or private response '+Object.keys(response).join(','),async()=>{
 const f=await render(response),fallback=await render({v:1,state:'unavailable'});assert.equal(f.node.textContent.split(' 本地检查：')[0],fallback.node.textContent.split(' 本地检查：')[0]);assert(!f.node.textContent.includes('PRIVATE'));assert.equal(f.calls.length,2);assertSnapshotMeaning(f.node.textContent);
});

test('blocked Browser-Local popup explains frame failure and keeps locking available without offering re-unlock',async()=>{
 const f=await render({v:1,state:'frame-blocked'},true);
 assert.match(f.node.textContent,/框架被替换/);assert.match(f.node.textContent,/重新打开页面/);assert.match(f.node.textContent,/无需重装扩展/);assert.match(f.node.textContent,/旧本地资料仍需.*确认后恢复/);assert.doesNotMatch(f.node.textContent,/无需重新确认账号/);
 const [unlock,lock]=f.elements.filter(e=>e.tag==='button');
 assert.equal(unlock.disabled,true);assert.notEqual(lock.disabled,true);assert.equal(f.calls.length,2);
 lock.listeners.click();await drain();
 assert.deepEqual(f.calls.at(-1),['control',{v:1,type:'HOST_LOCAL_SPACE',action:'lock'}]);
 assert.equal(unlock.disabled,true);assert.equal(lock.disabled,false);
});

for(const reason of projectSurfaceFailureReasons)test('Project preparation stays understandable and its fixed code is in diagnostics: '+reason,async()=>{
 const f=await render({v:1,state:'layout-project-'+reason});assert.match(f.node.textContent,/项目页面布局尚未就绪/);assert(!f.node.textContent.includes(reason));assert(f.byId('status-code').textContent.includes('layout-project-'+reason));assert(!f.node.textContent.includes('状态不可用'));
});

for(const [mode,exists,expected] of [['personal',true,/已解锁.*无需重复确认/],['locked',true,/旧私人数据已锁定.*本人确认/],['locked',false,/即时视图.*确认后才绑定/]])test('actual Browser-Local popup separates surface readiness from '+mode+' binding with descriptor '+exists,async()=>{
 const f=await render({v:1,state:'reading'},true,{ok:true,mode,exists});
 assert.doesNotMatch(f.node.textContent,/无需重新确认/);
 assert.match(f.elements.filter(e=>e.tag==='p').at(-1).textContent,expected);
 assert.deepEqual(f.calls.filter(c=>c[0]==='control'),[['control',{v:1,type:'HOST_LOCAL_SPACE',action:'status'}],['control',{v:1,type:'HOST_LOCAL_SPACE',action:'pipeline'}]]);
 await drain();assert.equal(f.calls.length,4,'legacy transport has no trusted document target: surface, binding and pipeline only; no polling or unlock');
});
test('unknown local binding response is not presented as an unlocked workspace',async()=>{
 const f=await render({v:1,state:'ready'},true,{ok:true,mode:'PRIVATE',exists:true});
 assert.match(f.elements.filter(e=>e.tag==='p').at(-1).textContent,/未能确认/);
 assert(!f.elements.some(e=>e.textContent.includes('PRIVATE')));
});

test('layout refusal does not mislabel a still-confirmed document as locked',async()=>{
 const f=await render({v:1,state:'layout-ambiguous-header'},true,{ok:true,mode:'personal',exists:true});
 assert.match(f.node.textContent,/多个候选/);assert.doesNotMatch(f.node.textContent,/未解锁旧数据/);
 assert.match(f.elements.filter(e=>e.tag==='p').at(-1).textContent,/已解锁.*无需重复确认/);
 assert.deepEqual(f.calls.filter(c=>c[0]==='control'),[['control',{v:1,type:'HOST_LOCAL_SPACE',action:'status'}],['control',{v:1,type:'HOST_LOCAL_SPACE',action:'pipeline'}]]);
});

test('history surface failure reports actual personal binding without asking to unlock again',async()=>{
 const f=await render({v:1,state:'surface-unsafe-native-history-list-row-order'},true,{ok:true,mode:'personal',exists:true});
 assert.doesNotMatch(f.node.textContent,/未解锁旧数据/);
 assert.match(f.elements.filter(e=>e.tag==='p').at(-1).textContent,/已解锁.*无需重复确认/);
 assert.deepEqual(f.calls.filter(c=>c[0]==='control'),[['control',{v:1,type:'HOST_LOCAL_SPACE',action:'status'}],['control',{v:1,type:'HOST_LOCAL_SPACE',action:'pipeline'}]]);
});

for(const reason of ['native-flow-uncovered-branch','native-flow-check-failed'])test('flow preflight has a fixed local reason without requesting another unlock: '+reason,async()=>{
 const f=await render({v:1,state:'surface-'+reason},true,{ok:true,mode:'locked',exists:true});
 assert(!f.node.textContent.includes(reason));assert(f.byId('status-code').textContent.includes('surface-'+reason));
 assert.match(f.elements.filter(e=>e.tag==='p').at(-1).textContent,/旧私人数据已锁定/);
 assert(!f.calls.some(c=>c[0]==='control'&&c[1].action==='unlock'));
});

test('detailed reports stay closed while fixed summary is separate from local confirmation controls',async()=>{
 const f=await render({v:1,state:'reading'},true,{ok:true,mode:'locked',exists:true});
 const detail=f.elements.find(e=>e.id==='diagnostic-details');assert(detail);assert.notEqual(detail.open,true);assert.equal(detail.children[0].textContent,'诊断详情');
 assert(!detail.children.includes(f.byId('runtime-build')));assert(f.byId('diagnostic-summary').children.includes(f.byId('runtime-build')));assert(detail.children.includes(f.byId('build-kind')));assert.match(html,/<details id="diagnostic-details"><summary>诊断详情<\/summary><p id="build-kind"/);
 assert(!f.node.textContent.includes('构建'));assert(!f.elements.some(e=>e.id==='runtime-build'||e.id==='build-kind'));
 assert(f.elements.some(e=>e.tag==='button'&&e.textContent.includes('确认当前账号')));assert(!detail.children.some(e=>e.tag==='button'&&e.textContent.includes('确认当前账号')));
});

for(const state of initializationFailureStates)test('post-authorization initializer failure is not an account confirmation request: '+state,async()=>{
 const f=await render({v:1,state});
 assert.match(f.node.textContent,/已通过本次工作空间授权检查/);
 assert.match(f.node.textContent,/无需重复确认或重装扩展/);
 assert(!f.node.textContent.includes(state));assert(f.byId('status-code').textContent.includes(state));
 assert.doesNotMatch(f.node.textContent,/旧私人数据保持锁定|已解锁/);
 assert.equal(f.calls.length,2);
});
test('existing current-document build receipt is in the fixed summary without new requests',async()=>{
 const boot={v:1,stage:'module-loaded',build:'a'.repeat(64)};
 const f=await render({v:1,state:'authorization-failed'},false,{},boot);await drain();
 const note=f.byId('runtime-build');assert(f.byId('diagnostic-summary').children.includes(note));assert.notEqual(f.byId('diagnostic-details').open,true);
 assert.equal(note.tag,'p');assert(note.textContent.includes(boot.build));assert(f.byId('boot-stage').textContent.includes(boot.stage));
 assert.match(html,/不代表产品验收通过/);assert.equal(f.calls.length,2);
});
test('missing runtime receipt does not infer activated build from disk or user Reload',async()=>{
 const f=await render({v:1,state:'authorization-failed'},false,{ok:true},null);await drain();
 assert.match(f.byId('runtime-build').textContent,/未核实.*不能用磁盘文件推定运行版本/);
 assert.equal(f.calls.length,2);
});

test('real popup offers one explicit reconnect only for document-bound transport failure',async()=>{
 const f=await render({v:1,state:'hello-transport-unavailable'},true,{ok:true},currentBoot,true);
 const button=f.elements.find(e=>e.id==='reconnect');assert(button);assert(!f.calls.some(c=>c[0]==='send'&&c[2].type==='HOST_LOCAL_RECONNECT'));
 await button.listeners.click();await button.listeners.click();
 const sent=f.calls.filter(c=>c[0]==='send'&&c[2].type==='HOST_LOCAL_RECONNECT');assert.equal(sent.length,1);assert.deepEqual(sent[0].slice(1),[7,{v:1,type:'HOST_LOCAL_RECONNECT',url:'https://chatgpt.com/'},{documentId:'document'}]);
 assert(f.elements.some(e=>e.textContent.includes('已发起重新连接')));assert(!f.calls.some(c=>c[0]==='control'));
});
for(const state of ['waiting','frame-blocked','hello-invalid-binding','foreground-scope-changed','ready'])test('popup does not offer reconnect for '+state,async()=>{
 const f=await render({v:1,state},true,{ok:true},null,true);assert(!f.elements.some(e=>e.id==='reconnect'));
});

import {projectSurfaceFailureReasons} from '../../src/host/native-project-surface.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializationFailureStates,readActiveLocalStatus,readActiveLocalLayout,validLocalPipeline} from '../../src/host/local-status.mjs';
const source=readFileSync(new URL('../../extension/status.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../../extension/status.html',import.meta.url),'utf8');
const importLine="import {HOST_CONFIG} from './config.mjs';\nimport {readActiveLocalStatus,readActiveLocalLayout,readLocalBoot,validLocalPipeline,createSidebarSnapshot,createMainMountSnapshot} from '../src/host/local-status.mjs';\nimport {HISTORY_DIAGNOSTIC_BATCH,validHistoryStructureReport,runHistoryDiagnosticOnce,sidebarStructureCoverage} from '../src/host/history-structure-diagnostic.mjs';\n";
assert(source.startsWith(importLine),'execute actual popup body after its exact imports');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function render(initial,browserLocal=false,localState={ok:true},boot=null){
 let current=initial;const calls=[],node={textContent:''};
 const chrome={tabs:{query:async args=>{calls.push(['query',args]);return [{id:7,get title(){throw Error('PRIVATE_TITLE');},get url(){throw Error('PRIVATE_URL');}}];},sendMessage:async(...args)=>{calls.push(['send',...args]);return args[1]?.type==='HOST_LOCAL_LAYOUT'?{v:1,shape:null}:current;}}};
 const elements=[];
 const make=tag=>({tag,textContent:'',children:[],append(...nodes){this.children.push(...nodes);},listeners:{},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}});
 const details=make('details'),summary=make('summary'),buildKind=make('p');details.id='diagnostic-details';summary.textContent='诊断详情';buildKind.id='build-kind';buildKind.textContent='构建类别未标定，请先验证安装包。';details.append(summary,buildKind);elements.push(details);
 const find=(nodes,id)=>nodes.flatMap(e=>[e,...e.children.flatMap(c=>[c,...c.children??[]])]).find(e=>e.id===id);
 const byId=id=>id==='status'?node:find(elements,id);
 const document={getElementById:byId,body:{append:e=>{const old=elements.indexOf(e);if(old>=0)elements.splice(old,1);elements.push(e);}},createElement:make};
 chrome.runtime={sendMessage:async message=>{calls.push(['control',message]);return localState;}};
 await new AsyncFunction('HOST_CONFIG','readActiveLocalStatus','readActiveLocalLayout','readLocalBoot','validLocalPipeline','chrome','document',source.slice(importLine.length))({browserLocal},readActiveLocalStatus,readActiveLocalLayout,async()=>boot,validLocalPipeline,chrome,document);
 return {calls,node,elements,byId,change:value=>{current=value;}};
}
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
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
 assert.match(f.node.textContent,/框架被替换/);assert.match(f.node.textContent,/无需重新确认账号或重装扩展/);
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

test('engineering diagnostics are closed and separate from local confirmation controls',async()=>{
 const f=await render({v:1,state:'reading'},true,{ok:true,mode:'locked',exists:true});
 const detail=f.elements.find(e=>e.id==='diagnostic-details');assert(detail);assert.notEqual(detail.open,true);assert.equal(detail.children[0].textContent,'诊断详情');
 assert(detail.children.includes(f.byId('runtime-build')));assert(detail.children.includes(f.byId('build-kind')));assert.match(html,/<details id="diagnostic-details"><summary>诊断详情<\/summary><p id="build-kind"/);
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
test('existing current-document build receipt stays in closed diagnostics without new requests',async()=>{
 const boot={v:1,stage:'module-loaded',build:'a'.repeat(64)};
 const f=await render({v:1,state:'authorization-failed'},false,{},boot);await drain();
 const note=f.byId('runtime-build');assert(f.byId('diagnostic-details').children.includes(note));assert.notEqual(f.byId('diagnostic-details').open,true);assert(!f.elements.includes(note));
 assert.equal(note.tag,'p');assert(note.textContent.includes(boot.build));assert(note.textContent.includes(boot.stage));
 assert.match(note.textContent,/不代表产品验收通过/);assert.equal(f.calls.length,2);
});
test('missing runtime receipt does not infer activated build from disk or user Reload',async()=>{
 const f=await render({v:1,state:'authorization-failed'});await drain();
 assert.match(f.byId('runtime-build').textContent,/未核实.*不能用磁盘文件推定运行版本/);
 assert.equal(f.calls.length,2);
});

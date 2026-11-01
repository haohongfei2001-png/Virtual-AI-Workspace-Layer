import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProjectSidebarMetadata as sidebar,parseProjectDetailMetadata as detail,parseProjectConversationListMetadata as conversations} from '../../src/host/project-metadata.mjs';
const P='g-p-'+ '1'.repeat(32),Q='g-p-'+ '2'.repeat(32),C='11111111-1111-4111-8111-111111111111';
const project=(id=P,name='原生名称',extra={})=>({id,display:{name,description:'PRIVATE_DESCRIPTION'},gizmo_type:'snorlax',...extra});
const wrapper=value=>({gizmo:{gizmo:value}});
const list=(items,cursor=null,previousCursor=null)=>sidebar({payload:JSON.stringify({items,cursor}),previousCursor});
const chat=(items,cursor=null,previousCursor=0)=>conversations({projectId:P,payload:JSON.stringify({items,cursor}),previousCursor});
const hasGap=(result,reason)=>result.gaps.some(g=>g.reason===reason);

test('fixed public wrappers reduce same-record IDs and titles, never names joined to a route',()=>{
 const result=list([wrapper(project()),wrapper(project(Q,'原生名称'))]);
 assert.deepEqual(result.candidates,[P,Q].map(nativeId=>({entity:'project',nativeId,nativeTitle:'原生名称',titleState:'exact'})));
 assert.equal(result.state,'candidate');assert.equal(result.coverage,'observed-only');
 assert.equal(list([{gizmo:project()}]).candidates.length,0);
 assert.deepEqual(detail({projectId:P,payload:JSON.stringify({gizmo:project()})}).candidates,result.candidates.slice(0,1));
 const mismatch=detail({projectId:Q,payload:JSON.stringify({gizmo:project()})});assert.equal(mismatch.candidates.length,0);assert(hasGap(mismatch,'project-identity-conflict'));
});
test('Custom GPT, missing type and incorrect Project ID remain unsupported',()=>{
 for(const extra of [{gizmo_type:'gpt'},{gizmo_type:null},{gizmo_type:undefined},{id:'g-custom'},{id:'__proto__'},{id:P+'/../other'}]){
  const result=list([wrapper(project(P,'title',extra))]);assert.equal(result.candidates.length,0);assert.equal(result.state,'partial');
 }
});
test('missing and overlong titles retain unavailable identity candidates without invented names',()=>{
 for(const name of [undefined,null,12,'',' '.repeat(4),'x'.repeat(201)]){
  const r=list([wrapper(project(P,'placeholder',{display:{name}}))]);assert.equal(r.state,'partial');assert.equal(r.candidates[0].nativeTitle,null);assert.notEqual(r.candidates[0].titleState,'exact');
 }
 const exact='界'.repeat(200);assert.equal(list([wrapper(project(P,exact))]).candidates[0].nativeTitle,exact);
});
test('conflicting duplicate IDs disappear instead of last writer winning; same names do not merge IDs',()=>{
 const result=list([wrapper(project(P,'first')),wrapper(project(Q,'first')),wrapper(project(P,'second')),wrapper(project(P,'first'))]);
 assert.deepEqual(result.candidates.map(r=>r.nativeId),[Q]);assert(hasGap(result,'native-title-conflict'));
 assert.equal(list([wrapper(project()),wrapper(project())]).candidates.length,1);
});
test('conversation list emits title candidates, never infers PROJECT or NONE from queried Project or null',()=>{
 for(const gizmo_id of [undefined,null,P]){
  const r=chat([{id:C,title:'聊天',gizmo_id,create_time:1,update_time:2,preview:'PRIVATE_PREVIEW',author:{id:'PRIVATE_ACTOR'},accessToken:'PRIVATE_TOKEN'}]);
  assert.deepEqual(r.candidates,[{entity:'conversation',nativeId:C,nativeTitle:'聊天',titleState:'exact'}]);
  assert(!/PRIVATE_|membership|sentAt|create_time|update_time|author|principal|scopeKey|nativeUrl|evidence/.test(JSON.stringify(r)));
 }
 const foreign=chat([{id:C,title:'chat',gizmo_id:Q}]);assert.equal(foreign.candidates.length,0);assert(hasGap(foreign,'conversation-project-conflict'));
});
test('pagination preserves opaque cursor, missing and invalid are not terminal, empty page is not completeness',()=>{
 const opaque='opaque/+==:next',first=chat([],opaque),last=chat([],null,opaque);
 assert.equal(first.page.nextCursor,opaque);assert.equal(first.page.terminalObserved,false);assert.equal(last.page.terminalObserved,true);
 assert.equal(first.coverage,'observed-only');assert.equal(last.coverage,'observed-only');
 for(const cursor of [undefined,{},[],false,1,'','x'.repeat(2049),'bad\nvalue']){
  const r=conversations({projectId:P,payload:JSON.stringify({items:[],cursor}),previousCursor:0});assert.equal(r.state,'partial');assert.equal(r.page.terminalObserved,false);assert.equal(r.page.nextCursor,null);
 }
 const repeated=chat([],opaque,opaque);assert(hasGap(repeated,'repeated-cursor'));assert.equal(repeated.page.terminalObserved,false);
 const directory=list([],17,0);assert.equal(directory.page.nextCursor,17);assert.equal(list([],null,17).page.terminalObserved,true);
});
test('unknown private fields are omitted, only exact whitelist paths are read from raw JSON',()=>{
 const value={items:[wrapper(project())],cursor:null,description:'PRIVATE',instructions:'PRIVATE',files:['PRIVATE'],token:'PRIVATE',account:{id:'PRIVATE'},conversations:{items:[{id:C,title:'PRIVATE'}]}};
 const result=sidebar({payload:JSON.stringify(value),previousCursor:null});assert.equal(result.candidates.length,1);assert(!JSON.stringify(result).includes('PRIVATE'));
 const polluted=sidebar({payload:JSON.stringify(value).slice(0,-1)+',"__proto__":{"polluted":"PRIVATE"}}',previousCursor:null});assert.deepEqual(polluted,result);assert.equal({}.polluted,undefined);
 assert.throws(()=>sidebar({payload:'{"__proto__":{"items":[]},"cursor":null}',previousCursor:null}),/invalid-project-items/);
 let reads=0;assert.throws(()=>sidebar({get payload(){reads++;return '{}';},previousCursor:null}),/invalid-project-metadata-input/);assert.equal(reads,0);
 assert.throws(()=>sidebar({payload:{toJSON(){reads++;return '{}';}},previousCursor:null}),/invalid-project-json/);assert.equal(reads,0);
 for(const payload of ['{','null','[]','{"items":{}}'])assert.throws(()=>sidebar({payload,previousCursor:null}));
});
test('fixed input and output byte and row bounds retain explicit partial state',()=>{
 const byteLimit=1024*1024,prefix='{"items":[],"cursor":null,"preview":"',suffix='"}',exact=prefix+'x'.repeat(byteLimit-prefix.length-suffix.length)+suffix;
 assert.equal(sidebar({payload:exact,previousCursor:null}).state,'candidate');
 const over=sidebar({payload:exact+' ',previousCursor:null});assert.deepEqual(over.candidates,[]);assert(hasGap(over,'byte-limit'));assert.equal(over.page.terminalObserved,false);
 const utf8=sidebar({payload:prefix+'界'.repeat(Math.ceil(byteLimit/3))+suffix,previousCursor:null});assert(hasGap(utf8,'byte-limit'));
 const rows=Array.from({length:257},(_,i)=>wrapper(project('g-p-'+i.toString(16).padStart(32,'0'),'same'))),limited=list(rows);assert.equal(limited.candidates.length,256);assert(hasGap(limited,'item-limit'));assert.equal(limited.coverage,'observed-only');
 const bytes=list(rows.map(row=>wrapper(project(row.gizmo.gizmo.id,'界'.repeat(200)))));assert(hasGap(bytes,'candidate-byte-limit'));assert(new TextEncoder().encode(JSON.stringify(bytes)).length<=65536);
});
test('candidate DTO cannot masquerade as an existing DOM proposal',()=>{
 const r=list([wrapper(project())]);for(const key of ['documentToken','producerToken','profileId','profileVersion','bodyProofId','kind','payload','membershipClaims','coverageClaims'])assert.equal(Object.hasOwn(r,key),false);
});
test('a contradictory duplicate type or explicit project cannot leave an earlier candidate standing',()=>{
 const projects=list([wrapper(project()),wrapper(project(P,'原生名称',{gizmo_type:'gpt'})),wrapper(project())]);assert.equal(projects.candidates.length,0);
 const rows=chat([{id:C,title:'chat',gizmo_id:P},{id:C,title:'chat',gizmo_id:Q},{id:C,title:'chat',gizmo_id:P}]);assert.equal(rows.candidates.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseConversationDirectoryMetadata as ordinary,parseArchivedConversationDirectoryMetadata as archived} from '../../src/host/conversation-metadata.mjs';
import {parseProjectConversationListMetadata as members} from '../../src/host/project-metadata.mjs';

const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const row=(n,extra={})=>({id:id(n),title:' 原始标题 '+n+' ',...extra});
const request={offset:0,limit:2,cursor:null,sort:'unspecified',starred:'unspecified'};
const body=(items,extra={})=>({items,offset:0,limit:2,total:2,has_missing_conversations:false,...extra});
const input=(value,extra={})=>({payload:JSON.stringify(value),request:{...request},pageOrdinal:0,priorPage:null,stopReason:null,...extra});
const hasGap=(r,gap)=>r.gaps.some(g=>g.reason===gap);

test('ordinary, archived, starred and member domains are separate candidate filters',()=>{
 const value=body([row(1),row(2)]),a=ordinary(input(value)),b=archived(input(value));
 assert.deepEqual(a.candidates.map(r=>r.nativeTitle),[' 原始标题 1 ',' 原始标题 2 ']);
 assert.equal(a.state,'candidate');assert.equal(a.coverage,'observed-only');
 assert.equal(a.domain.kind,'recent-list');assert.equal(b.domain.kind,'recent-list');
 assert.equal(a.domain.filter,'is_archived=unspecified;is_starred=unspecified');
 assert.equal(b.domain.filter,'is_archived=true;is_starred=unspecified');
 const filtered=ordinary(input(value,{request:{...request,starred:false,sort:'updated'}}));
 assert.notDeepEqual(filtered.domain,a.domain);assert.equal(filtered.domain.sort,'updated');
 assert.deepEqual(members({payload:JSON.stringify({items:[],cursor:null}),projectId:'g-p-'+'1'.repeat(32),previousCursor:0}).domain,{kind:'project-members',projectId:'g-p-'+'1'.repeat(32),filter:'unspecified',sort:'unspecified'});
 assert.equal(a.page.termination,'reported-total-boundary');assert.equal(a.page.terminalObserved,false);
});
test('metadata minimization: null gizmo and update time never become NONE or self activity',()=>{
 const r=ordinary(input(body([row(1,{gizmo_id:null,update_time:1700000000,preview:'PRIVATE',author:'PRIVATE',account:'PRIVATE',content:'PRIVATE',is_archived:true})])));
 assert.deepEqual(r.candidates,[{entity:'conversation',nativeId:id(1),nativeTitle:' 原始标题 1 ',titleState:'exact'}]);
 const text=JSON.stringify(r);
 for(const value of ['PRIVATE','1700000000','membership','sentAt','observedAt','receipt','evidence','scope','NONE','complete-snapshot'])assert(!text.includes(value),value);
 assert.equal(r.page.nextOffset,1); // ordinary default does not prove archive exclusion
});
test('missing, null and invalid cursor/total fields are not conflated with an explicit end',()=>{
 const base=body([row(1)],{total:null});
 for(const [cursor,state,termination]of [[undefined,'missing','unknown'],[null,'null','cursor-null'],['next','value','unknown'],['','invalid','unknown']]){
  const r=ordinary(input({...base,cursor}));assert.equal(r.page.fields.cursor.state,state);assert.equal(r.page.fields.total.state,'null');assert.equal(r.page.termination,termination);
  assert.equal(r.page.terminalObserved,cursor===null);assert.equal(r.state,cursor===null||cursor==='next'?'candidate':'partial');
 }
 const r=ordinary(input(body([row(1)],{total:undefined,cursor:null})));
 assert.equal(r.page.fields.total.state,'missing');assert.equal(r.page.terminalObserved,false);assert(hasGap(r,'missing-total'));
});
test('empty and short pages do not invent an end, and missing status stays unknown',()=>{
 for(const value of [body([],{total:null}),body([],{total:8}),body([],{total:null,cursor:'more'})]){
  const r=ordinary(input(value));assert.equal(r.state,'partial');assert.equal(r.page.terminalObserved,false);assert.equal(r.page.nextOffset,null);assert(hasGap(r,'empty-page-without-end'));
 }
 const short=ordinary(input(body([row(1)],{total:8})));assert.equal(short.page.nextOffset,1);assert.equal(short.page.termination,'unknown');
 const empty=ordinary(input(body([],{total:0,cursor:null})));assert.equal(empty.page.terminalObserved,true);assert.equal(empty.coverage,'observed-only');
 for(const flag of [undefined,null,true]){const r=ordinary(input(body([],{total:0,cursor:null,has_missing_conversations:flag})));assert.equal(r.state,'partial');assert.equal(r.page.terminalObserved,false);}
});
test('offset/limit/total contradictions, unsafe values and cursor contradictions stop continuation',()=>{
 for(const extra of [{offset:-1},{offset:1},{offset:null},{offset:undefined},{offset:0.5},{limit:1},{limit:null},{total:1},{total:-1},{total:Number.MAX_SAFE_INTEGER+1},{total:'2'},{total:8,cursor:null},{cursor:'more'}]){
  const r=ordinary(input(body([row(1),row(2)],extra)));assert.equal(r.state,'partial',JSON.stringify(extra));assert.equal(r.page.terminalObserved,false);assert.equal(r.page.nextOffset,null);
 }
 const overflow=ordinary(input(body([row(1)],{offset:Number.MAX_SAFE_INTEGER,total:null}),{request:{...request,offset:Number.MAX_SAFE_INTEGER}}));assert(hasGap(overflow,'offset-overflow'));
});
test('duplicate positions count as server rows, while conflicting IDs and invalid identities are excluded',()=>{
 const duplicate=ordinary(input(body([row(1),row(1)])));
 assert.equal(duplicate.candidates.length,1);assert.equal(duplicate.page.returnedCount,2);assert.equal(duplicate.page.termination,'reported-total-boundary');assert(hasGap(duplicate,'duplicate-id'));assert.equal(duplicate.page.nextOffset,null);
 const conflict=ordinary(input(body([row(1),row(1,{title:'conflict'})])));assert.equal(conflict.candidates.length,0);assert(hasGap(conflict,'native-title-conflict'));
 for(const value of [row(1,{id:'../wrong'}),null,row(1,{title:null}),row(1,{title:'x'.repeat(201)})]){
  const r=ordinary(input(body([value])));assert.equal(r.state,'partial');assert.equal(r.page.nextOffset,null);
 }
 const unavailable=ordinary(input(body([row(1,{title:undefined})])));assert.equal(unavailable.candidates[0].titleState,'unavailable');assert.equal(unavailable.candidates[0].nativeTitle,null);
});
test('archive contradictions remove the ID, even after an earlier apparently consistent duplicate',()=>{
 for(const flag of [false,'true']){
  const r=archived(input(body([row(1),row(1,{is_archived:flag})])));assert.equal(r.candidates.length,0);assert.equal(r.state,'partial');
 }
 for(const flag of [null,undefined,true])assert.equal(archived(input(body([row(1,{is_archived:flag})]))).candidates.length,1);
});
test('bounded preceding-page summaries catch repeats, overlaps, total drift and chain/domain gaps',()=>{
 const first=ordinary(input(body([row(1),row(2)],{total:4})));
 const next=items=>input(body(items,{offset:2,total:4}),{request:{...request,offset:2},pageOrdinal:1,priorPage:first.summary});
 const second=ordinary(next([row(3),row(4)]));assert.equal(second.state,'candidate');assert.equal(second.page.termination,'reported-total-boundary');assert.equal(second.coverage,'observed-only');
 assert(hasGap(ordinary(next([row(2),row(1)])),'repeated-page'));
 assert(hasGap(ordinary(next([row(2),row(3)])),'overlapping-page'));
 assert(hasGap(archived(next([row(3),row(4)])),'prior-domain-conflict'));
 assert(hasGap(ordinary({...next([row(3),row(4)]),pageOrdinal:2}),'page-ordinal-gap'));
 assert(hasGap(ordinary({...next([row(3),row(4)]),priorPage:null}),'prior-page-unavailable'));
 assert(hasGap(ordinary({...next([row(3),row(4)]),payload:JSON.stringify(body([row(3),row(4)],{offset:2,total:5}))}),'total-changed'));
 const bad={...first.summary,gapped:true};assert(hasGap(ordinary({...next([row(3),row(4)]),priorPage:bad}),'prior-page-gap'));
 assert(hasGap(ordinary({...next([row(3),row(4)]),priorPage:{...first.summary,nextOffset:null}}),'continuation-conflict'));
});
test('cursor pages preserve the opaque token without creating authority or restarting at a missing cursor',()=>{
 const req={...request,offset:null},first=ordinary(input(body([row(1),row(2)],{total:null,cursor:'next'}),{request:req}));
 assert.equal(first.page.nextCursor,'next');assert.equal(first.page.nextOffset,null);
 const second=extra=>input(body([row(3)],{offset:undefined,total:null,cursor:null,...extra}),{request:{...req,cursor:'next'},pageOrdinal:1,priorPage:first.summary});
 assert.equal(ordinary(second({})).page.terminalObserved,true);
 assert(hasGap(ordinary(second({cursor:'next'})),'repeated-cursor'));
 assert(hasGap(ordinary(second({cursor:undefined})),'missing-cursor'));
 assert(hasGap(ordinary({...second({}),request:{...req,cursor:'wrong'}}),'continuation-conflict'));
});
test('parser and caller budgets retain raw end markers but never return a usable terminal/continuation',()=>{
 for(const stopReason of ['budget','deadline','cancelled']){
  const r=ordinary(input(body([row(1)],{total:1,cursor:null}),{stopReason}));assert.equal(r.page.fields.cursor.state,'null');assert.equal(r.page.terminalObserved,false);assert.equal(r.state,'partial');assert(hasGap(r,'stopped-'+stopReason));
 }
 const many=ordinary(input(body(Array.from({length:257},(_,i)=>row(i)),{limit:256,total:257,cursor:null}),{request:{...request,limit:256}}));assert(hasGap(many,'item-limit'));assert.equal(many.page.terminalObserved,false);assert(many.candidates.length<=256);
 const wide=ordinary(input(body(Array.from({length:256},(_,i)=>row(i,{title:'字'.repeat(200)})),{limit:256,total:256,cursor:null}),{request:{...request,limit:256}}));assert(hasGap(wide,'candidate-byte-limit'));assert.equal(wide.page.terminalObserved,false);assert(Buffer.byteLength(JSON.stringify(wide))<65536);
 const huge=ordinary(input({}, {payload:' '.repeat(1048577)}));assert(hasGap(huge,'byte-limit'));assert.equal(huge.page.fields,null);assert.equal(huge.candidates.length,0);
 const cursor='字'.repeat(2048),r=ordinary(input(body(Array.from({length:256},(_,i)=>row(i,{title:'t'.repeat(50)})),{limit:256,total:null,cursor}),{request:{...request,limit:256,offset:null}}));
 assert(hasGap(r,'output-byte-limit'));assert.equal(r.summary.gapped,true);assert.equal(r.page.nextCursor,null);assert(Buffer.byteLength(JSON.stringify(r))<=65536);
});
test('raw JSON and exact descriptor inputs reject accessors, malformed data and unrecognized options',()=>{
 for(const payload of ['{','[]','null','{"items":{}}'])assert.throws(()=>ordinary({...input({}),payload}),/invalid-directory/);
 for(const extra of [{scope:'fake'},{request:{...request,headers:{}}},{priorPage:{}},{stopReason:'complete'},{pageOrdinal:-1}])assert.throws(()=>ordinary({...input(body([])),...extra}),/invalid-directory-input/);
 let accessed=0;const value=input(body([]));Object.defineProperty(value,'payload',{get(){accessed++;return '{}';}});assert.throws(()=>ordinary(value),/invalid-directory-input/);assert.equal(accessed,0);
 const s=ordinary(input(body([row(1)]))).summary;Object.defineProperty(s.loadedIds,'0',{get(){accessed++;return id(1);}});assert.throws(()=>ordinary(input(body([]),{priorPage:s})),/invalid-directory-input/);assert.equal(accessed,0);
});
test('output mutation cannot change the request or a preceding summary',()=>{
 const first=ordinary(input(body([row(1),row(2)],{total:4}))),saved=structuredClone(first.summary);
 const i=input(body([row(3),row(4)],{offset:2,total:4}),{request:{...request,offset:2},pageOrdinal:1,priorPage:first.summary});
 const r=ordinary(i);r.summary.loadedIds[0]='bad';r.domain.filter='bad';r.page.fields.offset.value=999;
 assert.deepEqual(first.summary,saved);assert.equal(i.request.offset,2);assert.equal(i.request.starred,'unspecified');
});

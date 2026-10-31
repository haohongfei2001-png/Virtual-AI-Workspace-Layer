import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
import {projectPublicPage,projectPublicPanel,projectPublicRows,projectPublicRecords,projectPublicSearch,projectPublicPreview,publicVersions,publicStatus,validatePublicProReply,PRO_FRAME_BYTES,PRO_FRAME_PROTOCOL} from '../../src/pro/integration/public-frame-dto.mjs';
import {digest} from '../../src/data/hash.mjs';

async function fixture(t){const owner=await createFixtureOwner({fixtureOnly:true,indexedDB:new MockIDBFactory()}),controller=await createProController(owner);t.after(()=>controller.destroy());return {owner,controller,async current(){return {...await owner.readPrivate(),view:controller.getView(),status:controller.getStatus()};}};}
test('public frame projection omits complete version maps and unrelated private index entries',async t=>{
 const f=await fixture(t),input=await f.current();
 for(let n=0;n<1000;n++){const id='not_visible_'+n;input.snapshot.references.push({id,nativeTitle:'PRIVATE NEVER REQUESTED '+n,available:true,membership:{state:'UNKNOWN',reason:'synthetic',revision:1}});input.snapshot.versions.nativeFields[id]=1;}
 input.snapshot.versions.sourceGeneration.super_secret_source=23;
 const dto=projectPublicPage(input),json=JSON.stringify(dto);
 assert.equal(dto.kind,'pro-frame-page');assert(new TextEncoder().encode(json).length<=PRO_FRAME_BYTES);
 assert.equal(dto.items.length,9);assert(!json.includes('not_visible_999'));assert(!json.includes('super_secret_source'));
 assert.deepEqual(Object.keys(dto.versions).sort(),['authorizationEpoch','overlayRevision','reviewId','scopeKey']);
 assert(dto.projection.windows.pending.hasMore);assert.equal(dto.projection.windows.pending.count,5);
});
test('public DTO uses exact nested display schemas and rejects unauthorized aliases and getters',async t=>{
 const f=await fixture(t);await f.controller.dispatch({type:'CREATE_TOPIC',name:'检验主题'});const dto=projectPublicPage(await f.current()),topicId=Object.keys(dto.display.topics)[0];
 const bad=structuredClone(dto);bad.display.topics[topicId].privateStuff={arbitrary:'secret'};assert.throws(()=>validatePublicProReply('view',bad),/shape/);
 const full=structuredClone(dto);full.versions.nativeFields={hidden:1};assert.throws(()=>validatePublicProReply('view',full),/private|versions/);
 const hidden=structuredClone(dto);Object.defineProperty(hidden,'neverRead',{get(){throw Error('getter executed');},enumerable:true});assert.throws(()=>validatePublicProReply('view',hidden),/json/);
 const wrongAction=structuredClone(dto);assert.throws(()=>validatePublicProReply('commit',wrongAction),/reply/);
 const incomplete=structuredClone(dto);delete incomplete.projection;assert.throws(()=>validatePublicProReply('view',incomplete),/reply/);
});
test('page and targeted reference panels are bounded independently and never include inverse or evidence',async t=>{
 const f=await fixture(t);await f.controller.dispatch({type:'CREATE_TOPIC',name:'可编辑主题'});const topic=Object.keys(f.controller.getState().topics)[0];await f.controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId:topic,role:'primary'});
 const input=await f.current(),panel=projectPublicPanel({...input,kind:'reference',id:'c_alpha'});
 assert.deepEqual(panel.items.map(r=>r.id),['c_alpha']);assert.equal(Object.values(panel.display.placements)[0].role,'primary');
 assert(!JSON.stringify(panel).includes('evidenceId'));assert(!JSON.stringify(panel).includes('readSet'));
 const records=projectPublicRecords(input);assert(records.items.some(r=>r.changes.some(c=>c.kind==='placement')));assert(!JSON.stringify(records).includes('inverse'));
 const p=projectPublicPreview({preview:await f.controller.previewDelete(topic),previewId:'worker_preview_1'});assert.equal(p.previewId,'worker_preview_1');assert(!('patch' in p));
});
test('topic rows and uncollected pages preserve all known rows without sending the full index',async t=>{
 const f=await fixture(t);await f.controller.dispatch({type:'CREATE_TOPIC',name:'分页'});const topicId=Object.keys(f.controller.getState().topics)[0];await f.controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId,role:'primary'});const input=await f.current();
 for(let n=0;n<50;n++){const id='extra_'+n;input.snapshot.references.push({id,nativeTitle:'窗口 '+n,available:true,membership:{state:'NONE',evidenceId:'synthetic_'+n,revision:1}});input.state.placements[id]={topicId,conversationId:id,role:'related',state:'included',control:{mode:'human',locked:true}};}
 const first=projectPublicRows({...input,topicId,limit:17}),second=projectPublicRows({...input,topicId,offset:first.page.offset+first.page.count,limit:17});
 assert.equal(first.rows.length,17);assert.equal(second.rows.length,17);assert(first.page.hasMore);assert(!first.rows.some(a=>second.rows.some(b=>b.refId===a.refId)));
 const page1=projectPublicPage({...input,query:{inventoryOffsets:{uncollected:0,pending:0}}}),page2=projectPublicPage({...input,query:{inventoryOffsets:{uncollected:5,pending:0}}});
 assert.equal(page2.page.offset,page1.page.offset);assert.equal(page2.projection.windows.uncollected.offset,5);assert.equal(page2.projection.groups[0].topicId,topicId);
});
test('public review token changes for invisible version changes and preserves maximum safe epoch',()=>{
 const v={scopeKey:'s',authorizationEpoch:Number.MAX_SAFE_INTEGER,overlayRevision:1,nativeFields:{invisible:1}};const before=publicVersions(v);v.nativeFields.invisible=2;assert.notEqual(publicVersions(v).reviewId,before.reviewId);assert.equal(before.authorizationEpoch,Number.MAX_SAFE_INTEGER);
});
test('scalar result and preview fields cannot hide arbitrary private objects or arrays',()=>{
 const hidden={privateTitles:['not for this frame']},base={kind:'pro-result',protocol:PRO_FRAME_PROTOCOL};
 for(const field of ['state','operationId','replayed','anchor','message'])assert.throws(()=>validatePublicProReply('navigation',{...base,[field]:hidden}),/public/);
 const preview={kind:'pro-preview',protocol:PRO_FRAME_PROTOCOL,previewId:'review1',proposal:false,conflicts:[],summary:''};
 for(const field of ['state','inverseHash','planHash','chosenPrimary','preservedAssetDigest','expected'])assert.throws(()=>validatePublicProReply('commit',{...preview,[field]:hidden}),/public/);
 assert.throws(()=>validatePublicProReply('commit',{...preview,conflicts:[{kind:'topic',reason:hidden}]}),/public/);
 assert.throws(()=>validatePublicProReply('navigation',{...base,state:'invented-success'}),/result/);
 assert.equal(validatePublicProReply('navigation',{...base,state:'unconfirmed'}).state,'unconfirmed');
});
test('navigation anchors and status context accept only bounded data primitives',()=>{
 const status=publicStatus({launchContext:{referenceId:'chat1',topicId:'topic1',seriesId:null,nativeProjectId:null,origin:'topic'}});
 for(const key of ['topicId','seriesId','nativeProjectId','origin']){const bad=structuredClone(status);bad.launchContext[key]={privateTitles:['x']};assert.throws(()=>validatePublicProReply('background',{kind:'pro-status',protocol:PRO_FRAME_PROTOCOL,status:bad}),/launch/);}
 const anchor={cardId:null,refId:'chat1',segment:0,scrollOffset:0,openOldItems:[],sidebarChoices:[]};
 assert.deepEqual(validatePublicProReply('navigation',{kind:'pro-result',protocol:PRO_FRAME_PROTOCOL,state:'returned',anchor}).anchor,anchor);
 for(const key of Object.keys(anchor)){const bad=structuredClone(anchor);bad[key]={privateTitles:['x']};assert.throws(()=>validatePublicProReply('navigation',{kind:'pro-result',protocol:PRO_FRAME_PROTOCOL,anchor:bad}),/anchor/);}
 assert.equal(publicStatus({modelAvailability:'fixture-rules'}).modelAvailability,'unavailable');
 assert.equal(publicStatus({modelAvailability:'local-rules',persistence:'memory'}).modelAvailability,'local-rules');
 assert.equal(publicStatus({persistence:'memory'}).persistence,'memory-only');assert.equal(publicStatus({}).persistence,'unavailable');
});
test('all source projector entrypoints reject wrong scope and withdrawn authorization',async t=>{
 const f=await fixture(t);await f.controller.dispatch({type:'CREATE_TOPIC',name:'范围'});const input=await f.current(),topicId=Object.keys(input.state.topics)[0];
 const calls=[x=>projectPublicPage({...x,query:{mode:'native'}}),x=>projectPublicPanel({...x,kind:'records'}),x=>projectPublicRecords(x),x=>projectPublicRows({...x,topicId}),x=>projectPublicSearch({...x,query:'a'})];
 for(const call of calls){for(const mutate of [x=>{x.state.scopeKey='other_scope';},x=>{x.snapshot.authorized=false;},x=>{x.snapshot.references[0].scopeKey='other_scope';}]){const copy=structuredClone(input);mutate(copy);assert.throws(()=>call(copy),/scope/);}}
 const dto=projectPublicPage(input);dto.display.scopeKey='other_scope';assert.throws(()=>validatePublicProReply('view',dto),/scope/);
});
test('Free nested display objects are fully checked and retain the real composite evidence revision',async t=>{
 const f=await fixture(t),dto=projectPublicPage(await f.current());dto.view.native.evidenceRevision='2:17';assert.equal(validatePublicProReply('view',dto).view.native.evidenceRevision,'2:17');
 const mutate=[x=>{x.view.native.groups.items[0].name={privateTitles:['x']};},x=>{x.view.native.navigation.maxSegment={privateTitles:['x']};},x=>{x.view.native.inventory.refs={privateTitles:['x']};},x=>{x.view.native.groups.items[0].lists.current.items[0].nativeTitle={privateTitles:['x']};},x=>{x.view.native.evidenceRevision={privateTitles:['x']};},x=>{x.view.native.scope='different_scope';}];
 for(const change of mutate){const bad=structuredClone(dto);change(bad);assert.throws(()=>validatePublicProReply('view',bad),/native/);}
 const sparse=structuredClone(dto);sparse.status.selectedProjectIds=new Array(1);sparse.status.selectedProjectIds.extra='unseen';assert.throws(()=>validatePublicProReply('view',sparse),/json/);
});
test('display series, legacy and placement fields reject nested-object smuggling',async t=>{
 const f=await fixture(t);await f.controller.dispatch({type:'CREATE_TOPIC',name:'字段'});const input=await f.current(),topicId=Object.keys(input.state.topics)[0];
 await f.controller.dispatch({type:'SET_PLACEMENT',refId:'c_alpha',topicId,role:'primary'});const next=await f.current();
 next.state.series.test_series={id:'test_series',topicId,title:'示例',entries:['c_alpha','c_beta'],edges:[{kind:'continuation',from:'c_alpha',to:'c_beta'}],labels:[{refId:'c_alpha',sequence:[1],source:'human-confirmed'}]};
 const dto=projectPublicPanel({...next,kind:'series-detail',id:'test_series'});
 const mutate=[x=>{x.display.series.test_series.edges[0].from={privateTitles:['x']};},x=>{x.display.series.test_series.labels[0].sequence={privateTitles:['x']};},x=>{x.display.topics[topicId].lifecycle={privateTitles:['x']};},x=>{Object.values(x.display.placements)[0].state={privateTitles:['x']};},x=>{x.display.series.test_series.totalEntries={privateTitles:['x']};}];
 for(const change of mutate){const bad=structuredClone(dto);change(bad);assert.throws(()=>validatePublicProReply('view',bad),/public/);}
 assert.equal(dto.display.series.test_series.detailsComplete,true);
});
test('records panel pages actual operations and complete batches up to200 changes remain reviewable',async t=>{
 const f=await fixture(t),input=await f.current();input.records=Array.from({length:51},(_,i)=>({transaction:{operationId:'op_'+i,actor:'human',status:'applied',patch:[{kind:'topic',key:'topic_'+i,after:{name:'记录 '+i}}]}}));
 const first=projectPublicPanel({...input,kind:'records'}),second=projectPublicPanel({...input,kind:'records',offset:first.page.count});
 assert.equal(first.page.total,51);assert.equal(first.operations.length,24);assert.equal(first.page.count,24);assert(first.page.hasMore);assert(!first.operations.some(x=>second.operations.some(y=>x.operationId===y.operationId)));
 input.records=[{transaction:{operationId:'batch',actor:'human',status:'applied',patch:Array.from({length:80},(_,i)=>({kind:'topic',key:'topic_'+i,after:{name:'主题 '+i}}))}}];
 const batch=projectPublicRecords(input);assert.equal(batch.items[0].changes.length,80);assert.equal(batch.items[0].changesTruncated,false);
 input.records[0].transaction.patch=Array.from({length:200},(_,i)=>({kind:'topic',key:'topic_'+i,after:{name:'界'.repeat(500)}}));
 const large=projectPublicPanel({...input,kind:'records'});assert.equal(large.operations[0].changesTruncated,true);assert(new TextEncoder().encode(JSON.stringify(large)).length<=PRO_FRAME_BYTES);
});
test('suggestion panels have an explicit proposal cursor independent from topic count',async t=>{
 const f=await fixture(t),input=await f.current();for(let i=0;i<52;i++){const id='proposal_'+i;input.state.proposals[id]={state:'awaiting-review',proposal:{id,planHash:digest(id),kind:'unknown',summary:'需确认 '+i,rationale:[],versions:{privateTitles:['never copied']}}};}
 const a=projectPublicPanel({...input,kind:'suggestions'}),b=projectPublicPanel({...input,kind:'suggestions',offset:a.page.count});
 assert.equal(a.page.total,52);assert.equal(Object.keys(a.display.proposals).length,24);assert(a.page.hasMore);assert(!Object.keys(a.display.proposals).some(id=>Object.hasOwn(b.display.proposals,id)));assert(!JSON.stringify(a).includes('privateTitles'));
});
test('long Series remain visible and paginated; full small detail alone is editable',async t=>{
 const f=await fixture(t);await f.controller.dispatch({type:'CREATE_TOPIC',name:'长工作线'});const input=await f.current(),topicId=Object.keys(input.state.topics)[0],entries=[];
 for(let i=0;i<221;i++){const id='series_ref_'+i;entries.push(id);input.snapshot.references.push({id,nativeTitle:'成员 '+i,available:true,membership:{state:'NONE',evidenceId:'membership_'+i,revision:1}});}
 input.state.series.long={id:'long',topicId,title:'完整保留的长工作线',entries,edges:entries.slice(1).map((to,i)=>({kind:'continuation',from:entries[i],to})),labels:[]};
 for(let i=0;i<29;i++)input.state.series['other_'+i]={id:'other_'+i,topicId,title:'小工作线 '+i,entries:['c_alpha'],edges:[],labels:[]};
 const page=projectPublicPage(input);assert.equal(page.display.series.long.totalEntries,221);assert.equal(page.display.series.long.detailsComplete,false);assert.deepEqual(page.display.series.long.entries,[]);
 const list1=projectPublicPanel({...input,kind:'series',id:topicId}),list2=projectPublicPanel({...input,kind:'series',id:topicId,offset:24});assert.equal(list1.page.total,30);assert.equal(list1.page.count,24);assert.equal(list2.page.count,6);
 const detail=projectPublicPanel({...input,kind:'series-detail',id:'long'}),next=projectPublicPanel({...input,kind:'series-detail',id:'long',offset:detail.page.count});assert.equal(detail.page.total,221);assert.equal(detail.display.series.long.detailsComplete,false);assert(!detail.display.series.long.entries.some(id=>next.display.series.long.entries.includes(id)));assert.equal(detail.items.length,detail.page.count);
 const small=projectPublicPanel({...input,kind:'series-detail',id:'other_0',limit:200});assert.equal(small.display.series.other_0.detailsComplete,true);assert.equal(small.page.count,1);
 const plan=projectPublicPreview({preview:{kind:'manual-series-plan',expected:input.snapshot.versions,planHash:digest('plan')},previewId:'series_review'});assert.equal(plan.kind,'manual-series-plan');assert.equal(plan.planHash,digest('plan'));
});
test('oversized protected reference relations are refused explicitly instead of hidden',async t=>{
 const f=await fixture(t);await f.controller.dispatch({type:'CREATE_TOPIC',name:'被保护的关系'});const input=await f.current();
 for(let i=0;i<101;i++)input.state.placements['placement_'+i]={conversationId:'c_alpha',topicId:'hidden_topic_'+i,role:'related',state:'included',control:{mode:'human',locked:true}};
 assert.throws(()=>projectPublicPanel({...input,kind:'reference',id:'c_alpha'}),/relations-require-paging/);
});
test('native fallback links preserve the current draft and reject foreign or mismatched targets',()=>{
 const refId='33333333-3333-4333-8333-333333333333',make=url=>({kind:'pro-result',protocol:PRO_FRAME_PROTOCOL,state:'native-link',nativeLink:{refId,url,disposition:'new-tab-preserve-current'}});
 for(const origin of ['https://chatgpt.com','http://127.0.0.1:8123','http://localhost:8123','http://[::1]:8123'])assert.equal(validatePublicProReply('navigation',make(origin+'/c/'+refId)).nativeLink.refId,refId);
 for(const url of ['https://example.com/c/'+refId,'https://chatgpt.com.evil.test/c/'+refId,'javascript:alert(1)','https://chatgpt.com/c/44444444-4444-4444-8444-444444444444','https://chatgpt.com/c/'+refId+'?private=1','https://chatgpt.com/c/'+refId+'#message','https://user@chatgpt.com/c/'+refId])assert.throws(()=>validatePublicProReply('navigation',make(url)),/native-link/);
 const bad=make('https://chatgpt.com/c/'+refId);bad.nativeLink.disposition='same-tab';assert.throws(()=>validatePublicProReply('navigation',bad),/native-link/);
 assert.throws(()=>validatePublicProReply('commit',make('https://chatgpt.com/c/'+refId)),/native-link/);
});
test('dense Series edge pages expose every preserved edge exactly once within the byte budget',async t=>{
 const f=await fixture(t);await f.controller.dispatch({type:'CREATE_TOPIC',name:'密集分支'});const input=await f.current(),topicId=Object.keys(input.state.topics)[0],entries=[],edges=[];
 for(let i=0;i<40;i++){const id='dense_'+i;entries.push(id);input.snapshot.references.push({id,nativeTitle:'分支 '+i,available:true,membership:{state:'NONE',evidenceId:'member_'+i,revision:1}});}
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)edges.push({kind:'branch',from:entries[i],to:entries[j]});
 input.state.series.dense={id:'dense',topicId,title:'完整边列表',entries,edges,labels:[]};
 const found=new Set();let offset=0;
 do{const dto=projectPublicPanel({...input,kind:'series-edges',id:'dense',offset,limit:100}),s=dto.display.series.dense;
   assert.equal(dto.page.total,edges.length);assert.equal(s.detailsComplete,false);assert.equal(s.edges.length,dto.page.count);assert(dto.items.length<=200);assert(new TextEncoder().encode(JSON.stringify(dto)).length<=PRO_FRAME_BYTES);
   for(const edge of s.edges){const key=JSON.stringify(edge);assert(!found.has(key));found.add(key);}offset+=dto.page.count;if(!dto.page.hasMore)break;assert(dto.page.count>0);
 }while(offset<edges.length);
 assert.equal(found.size,780);assert.deepEqual(found,new Set(edges.map(e=>JSON.stringify(e))));
});

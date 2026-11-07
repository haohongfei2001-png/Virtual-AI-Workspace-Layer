import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,stable} from '../../src/data/hash.mjs';
import {emptyOverlay,reduceProCommand,planTransaction,buildMergePlan,buildSplitPlan,buildSeriesPlan,validateSeries,registerProposal,placementId,previewUndo,applyUndo,topicIdForDraft} from '../../src/pro/domain/index.mjs';

const refs=['a','b','c','d'].map(id=>({id,nativeTitle:id,nativeUrl:null,membership:{state:'NONE',evidenceId:'e_'+id,revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['source']}));
function versions(s){return {scopeKey:s.scopeKey,authorizationEpoch:1,sourceGeneration:{source:1},nativeFields:{a:1,b:1,c:1,d:1},overlayRevision:s.revision,targets:{},constraintRevision:s.revision,policyVersion:'1',evidenceDigest:digest('e')};}
function context(s,id='op'+(s.revision+1)){const expected=versions(s);return {actor:'human',operationId:id,snapshot:{references:refs,versions:expected},expected};}
function run(s,c,extra={}){return reduceProCommand(s,c,{...context(s),...extra});}
function setup(){let s=emptyOverlay('scope');for(const id of ['t1','t2','t3'])s=run(s,{type:'CREATE_TOPIC',name:id},{allocations:{topicId:id}});return s;}
function place(s,refId,topicId='t1',role='primary'){return run(s,{type:'SET_PLACEMENT',refId,topicId,role});}
function unlock(s,refId,topicId='t1'){return run(s,{type:'SET_LOCK',target:{kind:'placement',refId,topicId},locked:false});}
function seriesInput(s,entries=['a','b','c'],edges=[{kind:'continuation',from:'a',to:'b'},{kind:'continuation',from:'b',to:'c'}]){return {seriesId:null,topicId:'t1',title:'推导工作线',entries,edges,labels:entries.map((refId,i)=>({refId,sequence:[i+1],source:'human-confirmed'})),expected:versions(s)};}
function buildSeries(s,input=seriesInput(s),currentSeries=null){return buildSeriesPlan(input,{knownRefs:refs.map(r=>r.id),topicId:'t1',currentSeries,versions:versions(s)});}
function applyProposal(s,p,id='apply'+s.revision){s=registerProposal(s,p);const ctx=context(s,id);const plan=planTransaction(s,{type:'ACCEPT_PROPOSAL',proposalId:p.id,planHash:p.planHash},ctx);return {state:plan.state,operation:{...plan,operationId:id,actor:'human',proposalId:p.id,status:'applied',resultRevision:plan.state.revision,base:ctx.expected}};}

test('A17: Series rejects both continuation and branch cycles and duplicate next nodes',()=>{
  let s=setup();for(const r of ['a','b','c'])s=place(s,r);const input=seriesInput(s);
  const cyclic={...input,edges:[...input.edges,{kind:'branch',from:'c',to:'a'}]};assert.throws(()=>buildSeries(s,cyclic),/series-cycle/);
  const fork={...input,edges:[{kind:'continuation',from:'a',to:'b'},{kind:'continuation',from:'a',to:'c'}]};assert.throws(()=>buildSeries(s,fork),/ambiguous-continuation/);
});
test('branch stays separate from main numbering; semantic 2.10 remains integer tuple',()=>{
  const v={id:'s1',topicId:'t1',title:'系列',entries:['a','b','c'],edges:[{kind:'continuation',from:'a',to:'b'},{kind:'branch',from:'a',to:'c'}],labels:[{refId:'a',sequence:[2,9],source:'human-confirmed'},{refId:'b',sequence:[2,10],source:'human-confirmed'},{refId:'c',sequence:null,source:'human-confirmed'}],revision:1};validateSeries(v);assert.deepEqual(v.labels[1].sequence,[2,10]);const bad=structuredClone(v);bad.labels[2].sequence=[3];assert.throws(()=>validateSeries(bad),/branch-not-main/);const duplicate=structuredClone(v);duplicate.labels[1].sequence=[2,9];assert.throws(()=>validateSeries(duplicate),/duplicate-sequence/);
});
test('removing middle Series item keeps the gap and preserves surviving labels',()=>{
  let s=setup();for(const r of ['a','b','c'])s=place(s,r);const plan=buildSeries(s);s=run(s,{type:'APPLY_SERIES_PLAN',plan},{allocations:{seriesId:'s1'}});const original=s.series.s1;const input={seriesId:'s1',topicId:'t1',title:original.title,entries:['a','c'],edges:original.edges.filter(e=>e.from!=='b'&&e.to!=='b'),labels:original.labels.filter(l=>l.refId!=='b'),expected:versions(s)};const remove=buildSeries(s,input,original);s=run(s,{type:'APPLY_SERIES_PLAN',plan:remove});assert.deepEqual(s.series.s1.edges,[]);assert.deepEqual(s.series.s1.labels.map(l=>l.sequence),[[1],[3]]);
});
test('Series plan is sealed and requires current known members of the selected theme',()=>{
  let s=place(setup(),'a');const input=seriesInput(s,['a','b'],[{kind:'continuation',from:'a',to:'b'}]),plan=buildSeries(s,input);assert.throws(()=>run(s,{type:'APPLY_SERIES_PLAN',plan}),/outside-topic/);const bad=structuredClone(plan);bad.title='changed';assert.throws(()=>run(s,{type:'APPLY_SERIES_PLAN',plan:bad}),/plan-hash/);
});
test('A15: merge include/exclude conflict blocks the entire preview and preserves all state',()=>{
  let s=place(setup(),'a','t1');s=run(s,{type:'EXCLUDE_TOPIC',refId:'a',topicId:'t2'});const before=stable(s),preview=buildMergePlan(s,{keepId:'t1',sourceIds:['t2']},context(s));assert.equal(preview.proposal,null);assert.deepEqual(preview.conflicts,[{kind:'include-exclude',refId:'a',excludedTopicId:'t2',targetTopicId:'t1'}]);assert.equal(stable(s),before);
  s=run(s,{type:'REMOVE_TOPIC_EXCLUSION',refId:'a',topicId:'t2'});const resolved=buildMergePlan(s,{keepId:'t1',sourceIds:['t2']},context(s));assert.equal(resolved.conflicts.length,0);s=applyProposal(s,resolved.proposal).state;assert.equal(s.topics.t2.lifecycle,'redirected');assert.equal(s.redirects.t2.toTopicId,'t1');assert.equal(s.placements[placementId('t1','a')].role,'primary');
});
test('merge preserves primary/related union, aliases, hard exclusions and Series IDs',()=>{
  let s=place(setup(),'a','t1');s=place(s,'a','t2','related');s=place(s,'b','t2');s=run(s,{type:'EXCLUDE_TOPIC',refId:'c',topicId:'t2'});const input={seriesId:null,topicId:'t2',title:'二号工作线',entries:['a','b'],edges:[{kind:'continuation',from:'a',to:'b'}],labels:[{refId:'a',sequence:[1],source:'human-confirmed'},{refId:'b',sequence:[2],source:'human-confirmed'}],expected:versions(s)};const plan=buildSeriesPlan(input,{knownRefs:['a','b','c','d'],topicId:'t2',currentSeries:null,versions:versions(s)});s=run(s,{type:'APPLY_SERIES_PLAN',plan},{allocations:{seriesId:'s1'}});const graph=structuredClone(s.series.s1);const preview=buildMergePlan(s,{keepId:'t1',sourceIds:['t2']},context(s));s=applyProposal(s,preview.proposal).state;
  assert.equal(Object.values(s.placements).filter(p=>p.conversationId==='a').length,1);assert.ok(s.topics.t1.aliases.includes('t2'));assert.equal(s.series.s1.id,graph.id);assert.deepEqual(s.series.s1.edges,graph.edges);assert.equal(s.series.s1.topicId,'t1');assert.ok(Object.values(s.constraints).some(c=>c.refId==='c'&&c.topicId==='t2'));assert.ok(Object.values(s.constraints).some(c=>c.refId==='c'&&c.topicId==='t1'));
});
test('A16: late failed merge plan cannot leak half redirect or members',()=>{
  let s=place(setup(),'a','t1');s=place(s,'b','t2');const preview=buildMergePlan(s,{keepId:'t1',sourceIds:['t2']},context(s));s=registerProposal(s,preview.proposal);s=run(s,{type:'EXCLUDE_TOPIC',refId:'a',topicId:'t2'});const before=stable(s);assert.throws(()=>run(s,{type:'ACCEPT_PROPOSAL',proposalId:preview.proposal.id,planHash:preview.proposal.planHash}),/stale-proposal/);assert.equal(stable(s),before);assert.equal(Object.keys(s.redirects).length,0);assert.ok(s.placements[placementId('t2','b')]);
});
test('A18: new post-merge member invalidates original structural inverse without writing',()=>{
  let s=place(setup(),'a','t1');s=place(s,'b','t2');const preview=buildMergePlan(s,{keepId:'t1',sourceIds:['t2']},context(s));const applied=applyProposal(s,preview.proposal);s=place(applied.state,'c','t1');const before=stable(s),undo=previewUndo(s,applied.operation);assert.equal(undo.state,'conflict');assert.ok(undo.conflicts.some(c=>c.kind==='topic-membership-set'));assert.throws(()=>applyUndo(s,applied.operation,context(s)),/undo-conflict/);assert.equal(stable(s),before);assert.ok(s.placements[placementId('t1','c')]);
});
test('split shows retained and moved destinations and requires explicit lock resolution',()=>{
  let s=place(setup(),'a');s=place(s,'b');const input={retainId:'t1',children:[{draftKey:'part2',name:'独立工作',members:['b']}]};let preview=buildSplitPlan(s,input,context(s));assert.equal(preview.proposal,null);assert.ok(preview.conflicts.some(c=>c.kind==='locked-placement'));assert.deepEqual(preview.preview.retained.map(r=>r.refId),['a']);s=unlock(s,'b');preview=buildSplitPlan(s,input,context(s));const destination=preview.preview.destinations[0].to,applied=applyProposal(s,preview.proposal);assert.equal(destination,topicIdForDraft(preview.proposal.id,'part2'));assert.equal(applied.state.placements[placementId(destination,'b')].role,'primary');assert.ok(applied.state.placements[placementId('t1','a')]);assert.equal(applied.state.placements[placementId('t1','b')],undefined);
});
test('split does not guess a primary when same chat assigned to two child destinations',()=>{
  let s=unlock(place(setup(),'a'),'a');assert.throws(()=>buildSplitPlan(s,{retainId:'t1',children:[{draftKey:'one',name:'一',members:['a']},{draftKey:'two',name:'二',members:['a']}]},context(s)),/ambiguous-split/);
});
test('split preserves whole Series and rejects partial silent continuity loss',()=>{
  let s=setup();for(const r of ['a','b','c']){s=place(s,r);s=unlock(s,r);}const series=buildSeries(s);s=run(s,{type:'APPLY_SERIES_PLAN',plan:series},{allocations:{seriesId:'s1'}});const partial=buildSplitPlan(s,{retainId:'t1',children:[{draftKey:'part',name:'部分',members:['b']}]},context(s));assert.ok(partial.conflicts.some(c=>c.kind==='series-crosses-split'));const graph=structuredClone(s.series.s1),whole=buildSplitPlan(s,{retainId:'t1',children:[{draftKey:'whole',name:'完整工作线',members:['a','b','c']}]},context(s));s=applyProposal(s,whole.proposal).state;assert.equal(s.series.s1.id,'s1');assert.deepEqual(s.series.s1.entries,graph.entries);assert.deepEqual(s.series.s1.edges,graph.edges);assert.deepEqual(s.series.s1.labels,graph.labels);assert.equal(s.series.s1.topicId,whole.preview.destinations[0].to);
});
test('split inverse restores exact original topology and all stable IDs',()=>{
  let s=unlock(place(place(setup(),'a'),'b'),'b');const original=structuredClone(s),split=buildSplitPlan(s,{retainId:'t1',children:[{draftKey:'b',name:'新主题',members:['b']}]},context(s));const applied=applyProposal(s,split.proposal);s=applyUndo(applied.state,applied.operation,context(applied.state));assert.deepEqual(s.topics,original.topics);assert.deepEqual(s.placements,original.placements);assert.equal(s.proposals[split.proposal.id].state,'applied');
});

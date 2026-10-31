import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,stable} from '../../src/data/hash.mjs';
import {emptyOverlay,placementId,planTransaction,applyUndo,previewUndo} from '../../src/pro/domain/index.mjs';
import {buildSeriesEditPlan} from '../../src/pro/integration/series-edit.mjs';

function setup(count=3) {
  const state=emptyOverlay('scope'),control={mode:'human',locked:false,revision:1,lastHumanOperation:'seed'};
  state.revision=1;
  state.topics.topic={id:'topic',scopeKey:'scope',name:'完整工作线',aliases:[],icon:'◇',intent:null,nameControl:control,membershipControl:control,lifecycle:'active',createdBy:'human',revision:1};
  const references=Array.from({length:count+1},(_,i)=>({id:'ref_'+i,nativeTitle:'窗口 '+i,nativeUrl:null,membership:{state:'NONE',evidenceId:'e_'+i,revision:1},available:true,freshness:'current',nativeRevision:1,sourceIds:['source']}));
  for(const ref of references)state.placements[placementId('topic',ref.id)]={conversationId:ref.id,topicId:'topic',role:'primary',activityContribution:'primary-only',state:'included',control,constraintRefs:[],evidenceIds:[],revision:1};
  const entries=references.slice(0,count).map(r=>r.id);
  state.series.series={id:'series',topicId:'topic',title:'工作线',entries,edges:entries.slice(1).map((to,i)=>({kind:'continuation',from:entries[i],to})),labels:entries.map((refId,i)=>({refId,sequence:[i+1],source:'human-confirmed'})),revision:1};
  const versions=s=>({scopeKey:s.scopeKey,authorizationEpoch:1,sourceGeneration:{source:1},nativeFields:Object.fromEntries(references.map(r=>[r.id,1])),overlayRevision:s.revision,targets:{},constraintRevision:0,policyVersion:'1',evidenceDigest:digest('e')});
  const context=s=>({actor:'human',operationId:'change_'+s.revision,snapshot:{authorized:true,references,versions:versions(s)},expected:versions(s)});
  return {state,context,versions,edit(change,s=state){const c=context(s);return buildSeriesEditPlan({seriesId:'series',change},{state:s,snapshot:c.snapshot,expected:c.expected});}};
}

test('bounded remove operates on all 2000 entries, keeps the gap and does not mutate worker input',()=>{
  const f=setup(2000),before=stable(f.state),plan=f.edit({kind:'remove',refId:'ref_1000',removeIncidentEdges:true});
  assert.equal(plan.entries.length,1999);assert.equal(plan.edges.length,1997);
  assert(!plan.edges.some(e=>e.from==='ref_999'&&e.to==='ref_1001'));
  assert.deepEqual(plan.labels.find(l=>l.refId==='ref_1001').sequence,[1002]);
  assert.equal(stable(f.state),before);
});
test('bounded rename commits through the existing transaction and undoes the exact entire graph',()=>{
  const f=setup(201),ctx=f.context(f.state),plan=f.edit({kind:'rename',title:'已复核的工作线'}),transaction=planTransaction(f.state,{type:'APPLY_SERIES_PLAN',plan},ctx);
  assert.deepEqual(transaction.state.series.series.entries,f.state.series.series.entries);
  assert.deepEqual(transaction.state.series.series.edges,f.state.series.series.edges);
  const operation={...transaction,operationId:ctx.operationId,actor:'human',proposalId:null,status:'applied',resultRevision:transaction.state.revision,base:ctx.expected};
  assert.equal(previewUndo(transaction.state,operation).state,'ready');
  const restored=applyUndo(transaction.state,operation,f.context(transaction.state));
  assert.deepEqual(restored.series,f.state.series);
});
test('display-order move does not infer edges or renumber human sequence labels',()=>{
  const f=setup(),plan=f.edit({kind:'move',refId:'ref_1',direction:'up'});
  assert.deepEqual(plan.entries,['ref_1','ref_0','ref_2']);
  assert.deepEqual(plan.edges,f.state.series.series.edges);assert.deepEqual(plan.labels,f.state.series.series.labels);
  assert.throws(()=>f.edit({kind:'move',refId:'ref_0',direction:'up'}),/boundary/);
});
test('inserting a known topic member creates no automatic connection and rejects outside membership',()=>{
  const f=setup(),plan=f.edit({kind:'insert',refId:'ref_3',beforeRefId:null});
  assert.deepEqual(plan.entries,['ref_0','ref_1','ref_2','ref_3']);assert.deepEqual(plan.edges,f.state.series.series.edges);
  assert.deepEqual(plan.labels.at(-1),{refId:'ref_3',sequence:null,source:'human-confirmed'});
  const foreign=structuredClone(f.state);delete foreign.placements[placementId('topic','ref_3')];
  assert.throws(()=>f.edit({kind:'insert',refId:'ref_3',beforeRefId:null},foreign),/outside-topic/);
  assert.throws(()=>f.edit({kind:'insert',refId:'ref_1',beforeRefId:null}),/duplicate/);
});
test('single-edge edits still enforce complete-graph cycle, continuation and branch label rules',()=>{
  const f=setup();
  assert.throws(()=>f.edit({kind:'set-edge',from:'ref_2',to:'ref_0',relation:'branch'}),/cycle/);
  assert.throws(()=>f.edit({kind:'set-edge',from:'ref_0',to:'ref_2',relation:'continuation'}),/ambiguous-continuation/);
  assert.throws(()=>f.edit({kind:'set-edge',from:'ref_0',to:'ref_2',relation:'branch'}),/branch-not-main/);
  const changed=structuredClone(f.state);changed.series.series.labels[2].sequence=[1,1];
  const branch=f.edit({kind:'set-edge',from:'ref_0',to:'ref_2',relation:'branch'},changed);
  assert.equal(branch.edges.length,3);
  const removal=f.edit({kind:'remove-edge',from:'ref_0',to:'ref_1',relation:'continuation'});
  assert.deepEqual(removal.edges,[f.state.series.series.edges[1]]);assert.deepEqual(removal.labels,f.state.series.series.labels);
});
test('sequence changes reject duplicate or malformed tuples without altering other labels',()=>{
  const f=setup();assert.throws(()=>f.edit({kind:'set-label',refId:'ref_1',sequence:[1]}),/duplicate-sequence/);
  assert.throws(()=>f.edit({kind:'set-label',refId:'ref_1',sequence:[1.2]}),/invalid-revision/);
  const plan=f.edit({kind:'set-label',refId:'ref_1',sequence:[2,10]});
  assert.deepEqual(plan.labels.find(l=>l.refId==='ref_1').sequence,[2,10]);
  assert.deepEqual(plan.labels.find(l=>l.refId==='ref_0'),f.state.series.series.labels[0]);
});
test('stale scope/review, omitted removal consent and getter-shaped edits cannot authorize a plan',()=>{
  const f=setup(),ctx=f.context(f.state),input={seriesId:'series',change:{kind:'rename',title:'不可应用'}};
  for(const expected of [{...ctx.expected,scopeKey:'other'},{...ctx.expected,authorizationEpoch:2}])assert.throws(()=>buildSeriesEditPlan(input,{state:f.state,snapshot:ctx.snapshot,expected}),/stale-series-edit/);
  assert.throws(()=>f.edit({kind:'remove',refId:'ref_1',removeIncidentEdges:false}),/confirmation/);
  assert.throws(()=>f.edit({kind:'rename',title:'x',entries:[]}),/schema/);
  let accessed=false;const change={title:'x'};Object.defineProperty(change,'kind',{enumerable:true,get(){accessed=true;return 'rename';}});
  assert.throws(()=>f.edit(change),/unsafe-property/);assert.equal(accessed,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as freeView from '../../src/navigation/free-view.mjs';

function fixture(){
 const header={scope:'verified-scope-A',revision:1,workspaceRevision:2,evidenceRevision:'2:1',viewRevision:1,viewSession:{H:30,T:20738,Z:'UTC',policyRevision:0},evaluatedAt:'2026-10-13T00:00:00.000Z',visibilityRevision:'visible',activitySourceRevision:'source',membershipWitnessRevision:'witness',inventoryComplete:false,preferences:{},view:{segment:0},manifest:{projectVersions:{P:1},refVersions:{R:1,N:1,U:1},activityVersions:{R:'1',N:'1',U:'1'}}};
 const refs=[['R','PROJECT'],['N','NONE'],['U','UNKNOWN']].map(([id,membership])=>({id,scope:header.scope,nativeUrl:'https://example.test/c/'+id,nativeTitle:id,membership,projectId:membership==='PROJECT'?'P':null,activityDecision:{segment:0}}));
 const base={...header,viewMode:'free',refs,projects:[{id:'P',scope:header.scope,nativeName:'Native project',members:[refs[0]],activityDecision:{segment:0}}],noProject:[refs[1]],unknown:[refs[2]]};
 return {base,header,prepared:freeView.freeNavigationSnapshot(base)};
}
const rebind=(...args)=>freeView.rebindPreparedFreeSnapshot(...args);

test('metadata rebind shares all prepared structure, updates metadata, and remains reusable with its original base',()=>{
 const {base,header,prepared}=fixture(),before=structuredClone(prepared);
 const nextHeader={...header,revision:2,workspaceRevision:3,evidenceRevision:'3:2',viewRevision:2,preferences:{sidebarVisible:{value:false}},view:{segment:1},diagnostics:{view:'fresh'}};
 const next=rebind(prepared,base,nextHeader);assert.notEqual(next,prepared);assert.equal(freeView.assertPreparedFreeSnapshot(next),next);
 for(const key of ['refs','groups','themes','noProject','unknown','projects'])assert.equal(next[key],prepared[key],key);
 for(const key of ['preferences','view','revision','workspaceRevision','evidenceRevision','viewRevision','diagnostics'])assert.equal(next[key],nextHeader[key],key);
 assert.equal(next.viewMode,'free');assert.deepEqual(prepared,before,'rebind does not mutate prior prepared state');
 const final=rebind(next,base,{...nextHeader,viewRevision:3});assert.equal(final.refs,prepared.refs);assert.equal(final.viewRevision,3);assert.equal(freeView.assertPreparedFreeSnapshot(final),final);
});

test('copied prepared objects fail provenance, while a different base fails reuse',()=>{
 const {base,header,prepared}=fixture();
 assert.throws(()=>rebind({...prepared},base,header),/unprepared-free-navigation-snapshot/);
 assert.throws(()=>rebind(prepared,{...base},header),/unreusable-free-navigation-snapshot/);
 const other=fixture();assert.throws(()=>rebind(prepared,other.base,header),/unreusable-free-navigation-snapshot/);
});

for(const [name,change] of [
 ['scope',h=>h.scope='verified-scope-B'],
 ['H',h=>h.viewSession.H=60],['T',h=>h.viewSession.T++],['Z',h=>h.viewSession.Z='Asia/Shanghai'],['policyRevision',h=>h.viewSession.policyRevision++],
 ['evaluatedAt',h=>h.evaluatedAt='2026-10-14T00:00:00.000Z'],
 ['visibilityRevision',h=>h.visibilityRevision='revoked'],['activitySourceRevision',h=>h.activitySourceRevision='changed'],
 ['membershipWitnessRevision',h=>h.membershipWitnessRevision='changed'],['inventoryComplete',h=>h.inventoryComplete=true],
])test(`changed ${name} cannot relabel old row decisions as current`,()=>{
 const {base,header,prepared}=fixture(),next=structuredClone(header);change(next);
 assert.throws(()=>rebind(prepared,base,next),/unreusable-free-navigation-snapshot/);assert.equal(freeView.assertPreparedFreeSnapshot(prepared),prepared);
});

for(const key of ['refs','projects','groups','themes','noProject','unknown'])test(`header cannot supply owned structure ${key}, even undefined`,()=>{
 const {base,header,prepared}=fixture();
 for(const value of [undefined,[],prepared[key]])assert.throws(()=>rebind(prepared,base,{...header,[key]:value}),/unreusable-free-navigation-snapshot/);
});

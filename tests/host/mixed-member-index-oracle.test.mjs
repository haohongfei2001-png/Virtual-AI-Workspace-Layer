import test from 'node:test';
import assert from 'node:assert/strict';
import {auditMixedMemberIndex} from './mixed-member-index-oracle.mjs';
import {hostScaleRows} from './fixtures/host-scale-world.mjs';
function fixture(change=()=>{}){
 const rows=[...hostScaleRows({size:1000,distribution:'project-mixed'})],facts={refs:{},projects:{},membership:{}};
 for(const row of rows){facts.refs[row.id]={id:row.id};if(row.project)facts.projects[row.project]={id:row.project};facts.membership[row.id]=row.project===rows[0].project?{id:row.id,state:'PROJECT',projectId:row.project}:{id:row.id,state:'UNKNOWN'};}
 change(facts,rows);const ids=[...Object.keys(facts.projects),...Object.keys(facts.refs)];
 return {version:async()=>1,page:async({offset,limit})=>{const selected=ids.slice(offset,offset+limit);return {revision:1,offset,total:ids.length,nextOffset:Math.min(ids.length,offset+limit),selectedRefs:selected.filter(id=>facts.refs[id]),selectedProjects:selected.filter(id=>facts.projects[id]),facts};}};
}
test('exact first 80 mapped, 720 unobserved grouped and 200 other refs UNKNOWN',async()=>{
 const result=await auditMixedMemberIndex({},fixture());assert.equal(result.status,'PASS_PARTIAL_MIXED_MAPPING');assert.equal(result.firstProjectMembers,80);assert.equal(result.unseenProjectUnknown,720);assert.equal(result.otherUnknown,200);assert.equal(result.nativeNoneObserved,0);assert.equal(result.distinctRefs,1000);
});
test('tail alone cannot pass missing early member',async()=>{const result=await auditMixedMemberIndex({},fixture((facts,rows)=>{facts.membership[rows[0].id]={state:'UNKNOWN'};}));assert.notEqual(result.status,'PASS_PARTIAL_MIXED_MAPPING');assert.equal(result.firstProjectMembers,79);});
test('unseen native truth cannot become claimed project without observation',async()=>{const result=await auditMixedMemberIndex({},fixture((facts,rows)=>{facts.membership[rows[100].id]={id:rows[100].id,state:'PROJECT',projectId:rows[100].project};}));assert.notEqual(result.status,'PASS_PARTIAL_MIXED_MAPPING');assert.equal(result.unexpectedKnowledge,1);});
test('invented NONE rejected even for native truth NONE',async()=>{const result=await auditMixedMemberIndex({},fixture((facts,rows)=>{facts.membership[rows[4].id]={state:'NONE'};}));assert.notEqual(result.status,'PASS_PARTIAL_MIXED_MAPPING');assert.equal(result.nativeNoneObserved,1);});
test('wrong project is rejected',async()=>{const result=await auditMixedMemberIndex({},fixture((facts,rows)=>{facts.membership[rows[0].id].projectId=rows[100].project;}));assert.notEqual(result.status,'PASS_PARTIAL_MIXED_MAPPING');assert.equal(result.wrongProjectMembership,1);});
test('missing persisted ref cannot pass',async()=>{const result=await auditMixedMemberIndex({},fixture((facts,rows)=>{delete facts.refs[rows[999].id];}));assert.notEqual(result.status,'PASS_PARTIAL_MIXED_MAPPING');assert.equal(result.missingRefs,1);});
test('concurrent revision change never passes',async()=>{const readers=fixture();let calls=0;readers.version=async()=>++calls;const result=await auditMixedMemberIndex({},readers);assert.equal(result.status,'UNSTABLE_REVISION');});

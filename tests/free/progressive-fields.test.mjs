import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyNativeFacts,applyNativeObservations,validateNativeFacts,invalidateNativeSource} from '../../src/data/native-facts.mjs';
import {freeProjection} from '../../src/data/free-projection.mjs';
import {scopeOf} from '../../simulator/data.mjs';
const scope=scopeOf('A'),start=Date.parse('2026-10-23T00:00:00Z');
const project={id:'P',nativeName:'原生项目',nativeUrl:'https://chatgpt.com/g/P/project',availability:'available',memberCount:1};
const ref={id:'C',nativeTitle:'原生标题',nativeUrl:'https://chatgpt.com/c/C',availability:'available'};
const member={id:'C',state:'PROJECT',projectId:'P'};
function apply(facts,values,channel='host-dom',ms=1000,sourceId='host'){
 const at=new Date(start+ms).toISOString(),admission={profileId:'profile',profileVersion:1,evidenceClass:channel==='host-dom'?'surface':'directory-candidates',semanticFingerprint:'a'.repeat(64),acceptedAt:at};
 if(channel==='host-metadata')admission.coverage={domain:{kind:'recent-list',filter:'is_archived=unspecified;is_starred=unspecified',sort:'unspecified'},gaps:[],terminalObserved:false};
 return applyNativeObservations(facts,{scopeKey:emptyNativeFacts(scope).scopeKey,sourceRevision:(facts.sources[sourceId]?.sourceRevision??0)+1,observedAt:at,validUntil:new Date(start+ms+60000).toISOString(),projects:[],refs:[],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null},...values},{scope,channel,sourceId,generation:'g',now:at,admission});
}
const seed=()=>apply(emptyNativeFacts(scope),{projects:[project],refs:[ref],membership:[member]});
const view=(facts,ms=62000)=>freeProjection(facts,{scope,now:new Date(start+ms).toISOString()});
test('partial channels merge fields without renewing retained title, count or positive membership',()=>{
 const first=seed(),second=apply(first,{refs:[{...ref,nativeTitle:null}]},'host-metadata',62000);
 const third=apply(second,{projects:[{...project,nativeName:null,memberCount:null}],membership:[{id:'C',state:'UNKNOWN',projectId:null}]},'host-dom',63000);
 assert.equal(third.refs.C.nativeTitle,ref.nativeTitle);assert.equal(third.projects.P.memberCount,1);assert.equal(third.membership.C.state,'PROJECT');
 assert.deepEqual(third.refs.C.fieldWitnesses.nativeTitle,first.refs.C.fieldWitnesses.nativeTitle);
 assert.deepEqual(third.projects.P.fieldWitnesses.memberCount,first.projects.P.fieldWitnesses.memberCount);
 assert.deepEqual(third.membership.C.fieldWitnesses.state,first.membership.C.fieldWitnesses.state);
 const rendered=view(third,63000);assert.equal(rendered.refs[0].freshness,'last-known');assert.equal(rendered.refs[0].membershipFreshness,'last-known');assert.equal(rendered.projects[0].membershipComplete,false);assert.equal(rendered.refs[0].displayTitle,ref.nativeTitle);
});
test('equal-time channel disagreement quarantines title only; a later positive observation resolves it',()=>{
 const conflicting=apply(seed(),{refs:[{...ref,nativeTitle:'另一标题'}]},'host-metadata',1000),v=view(conflicting,1000);
 assert.equal(v.refs[0].nativeTitle,null);assert.deepEqual(v.refs[0].nativeAliases,[]);assert.equal(v.refs[0].membership,'PROJECT');assert.equal(v.projects[0].name,project.nativeName);
 const weak=apply(conflicting,{refs:[{...ref,nativeTitle:null}]},'host-dom',2000);assert.equal(view(weak,2000).refs[0].nativeTitle,null);
 const resolved=apply(weak,{refs:[{...ref,nativeTitle:'确定的新标题'}]},'host-dom',3000);assert.equal(view(resolved,3000).refs[0].nativeTitle,'确定的新标题');
});
test('explicit move/NONE can replace prior membership; source conflict, scope and revocation remain fences',()=>{
 const first=seed(),moved=apply(first,{membership:[{id:'C',state:'NONE',projectId:null}]},'host-dom',2000);assert.equal(view(moved,2000).noProject.length,1);
 assert.throws(()=>apply(first,{refs:[ref]},'host-dom',2000,'other'),/source-conflict/);
 assert.throws(()=>validateNativeFacts(first,scopeOf('B')),/invalid-native-facts/);
 assert.equal(view(invalidateNativeSource(first,'host',scope)).refs.length,0);
 const forged=structuredClone(first);forged.refs.C.fieldWitnesses.nativeTitle.sourceId='other';assert.throws(()=>validateNativeFacts(forged,scope),/field-witness/);
});

test('a conflicting route is withheld independently of title and membership',()=>{
 const first=apply(seed(),{refs:[{...ref,nativeUrl:ref.nativeUrl+'?view=one'}]},'host-dom',2000);
 const conflict=apply(first,{refs:[{...ref,nativeUrl:ref.nativeUrl+'?view=two'}]},'host-metadata',2000),r=view(conflict,2000).refs[0];
 assert.equal(r.nativeUrl,null);assert.equal(r.nativeTitle,ref.nativeTitle);assert.equal(r.membership,'PROJECT');
});

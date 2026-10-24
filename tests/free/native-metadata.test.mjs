import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeOf} from '../../simulator/data.mjs';
import {emptyNativeFacts,applyNativeObservations,invalidateNativeSource} from '../../src/data/native-facts.mjs';
import {freeProjection} from '../../src/data/free-projection.mjs';
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {knownMatches} from '../../src/navigation/search.mjs';
import {projectFreeActivity} from '../../src/data/free-activity.mjs';
import {createFreeViewSession} from '../../src/data/free-time-policy.mjs';
const scope=scopeOf('A'),now='2026-10-13T12:00:00Z',validUntil='2026-10-14T00:00:00Z';
const authority={scope,now,channel:'synthetic',sourceId:'native',generation:'first'};
const project=(nativeName='原生旧项目')=>({id:'p',nativeName,nativeUrl:'https://fixture.test/project/p',availability:'available',memberCount:1});
const ref=(nativeTitle='原生旧聊天')=>({id:'c',nativeTitle,nativeUrl:'https://fixture.test/c/c',availability:'available'});
const batch=(sourceRevision,values={})=>({scopeKey:emptyNativeFacts(scope).scopeKey,sourceRevision,observedAt:now,validUntil,projects:[project()],refs:[ref()],membership:[{id:'c',state:'PROJECT',projectId:'p'}],inventory:{projects:'complete',conversations:'complete',cursor:null},...values});
const seed=()=>applyNativeObservations(emptyNativeFacts(scope),batch(1),authority);
const view=facts=>freeProjection(facts,{scope,now});

test('verified native rename aliases remain searchable; Pro titles and arbitrary imported aliases never become native aliases',()=>{
 const facts=applyNativeObservations(seed(),batch(2,{projects:[project('原生新项目')],refs:[ref('原生新聊天')]}),authority);
 const snapshot=view(facts);assert.deepEqual(snapshot.projects[0].nativeAliases,['原生旧项目']);assert.deepEqual(snapshot.refs[0].nativeAliases,['原生旧聊天']);
 snapshot.refs[0].displayTitle='Pro派生标题';snapshot.refs[0].aliases=['Pro别名'];snapshot.projects[0].name='Pro虚拟主题';
 const nav=freeNavigationSnapshot(snapshot);assert.equal(nav.refs[0].displayTitle,'原生新聊天');assert.equal(knownMatches(nav,'原生旧聊天').length,1);assert.equal(knownMatches(nav,'原生旧项目').length,1);assert.equal(knownMatches(nav,'Pro').length,0);
 assert.throws(()=>applyNativeObservations(facts,batch(3,{refs:[{...ref(),nativeAliases:['伪造旧名']}]}),authority),/schema/);
});

test('native aliases are bounded and cannot survive source revocation or witness expiry',()=>{
 let facts=seed();for(let i=2;i<=25;i++)facts=applyNativeObservations(facts,batch(i,{refs:[ref('原生名'+i)]}),authority);
 assert.equal(facts.refs.c.nativeAliases.length,20);assert.equal(facts.refs.c.nativeAliases.includes('原生旧聊天'),false);
 const expired=freeProjection(facts,{scope,now:validUntil});assert.deepEqual(expired.refs[0].nativeAliases,[]);assert.equal(expired.refs[0].nativeTitle,null);
 const revoked=invalidateNativeSource(facts,'native',scope),fresh=applyNativeObservations(revoked,batch(1,{refs:[ref('重新核验名称')]}),{...authority,sourceId:'fresh'});
 assert.deepEqual(fresh.refs.c.nativeAliases,[]);assert.deepEqual(view(fresh).refs[0].nativeAliases,[]);
});

test('membership completeness requires exact known count and current matching member/source revision',()=>{
 const facts=seed();assert.equal(view(facts).projects[0].membershipComplete,true);
 for(const count of [null,0,2]){const changed=applyNativeObservations(facts,batch(2,{projects:[{...project(),memberCount:count}]}),authority);assert.equal(view(changed).projects[0].membershipComplete,false);}
 const partial=applyNativeObservations(facts,batch(2,{inventory:{projects:'partial',conversations:'partial',cursor:null}}),authority);assert.equal(view(partial).projects[0].membershipComplete,false);
 const oldMember=applyNativeObservations(facts,batch(2,{membership:[]}),authority);assert.equal(view(oldMember).projects[0].membershipComplete,false);
 const unknown=applyNativeObservations(facts,batch(2,{membership:[{id:'c',state:'UNKNOWN',projectId:null}]}),authority);assert.equal(view(unknown).projects[0].membershipComplete,false);assert.equal(view(unknown).unknown.length,1);
 for(const count of [-1,1.5,100001,'1'])assert.throws(()=>applyNativeObservations(facts,batch(2,{projects:[{...project(),memberCount:count}]}),authority),/member-count/);
});

test('empty verified Project has complete zero membership but no fabricated activity',()=>{
 const facts=applyNativeObservations(emptyNativeFacts(scope),batch(1,{projects:[{...project(),memberCount:0}],refs:[],membership:[]}),authority);
 const snapshot=view(facts);assert.equal(snapshot.projects[0].membershipComplete,true);assert.deepEqual(snapshot.projects[0].members,[]);
 const projected=projectFreeActivity(snapshot,{scopeKey:facts.scopeKey,sources:facts.sources,events:{},hints:{},coverage:{}},createFreeViewSession({now,timeZone:'UTC'}),now);assert.equal(projected.projects[0].activityDecision.basis,'undated');assert.equal(projected.projects[0].activityDecision.segment,null);
});

test('complete membership plus complete time coverage confirms old Project, partial membership remains provisional',()=>{
 const facts=seed(),sentAt='2026-08-14T12:00:00Z',witness={sourceId:'native',generation:'first',sourceRevision:1,observedAt:now};
 const evidence={scopeKey:facts.scopeKey,sources:facts.sources,hints:{},events:{e:{...witness,id:'e',conversationId:'c',messageId:'m',branchId:'b',actorVerified:true,actorScopeKey:facts.scopeKey,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt}},coverage:{all:{...witness,id:'all',conversationId:'c',from:sentAt,through:now,completeness:'complete',branches:'all',gaps:[]}}};
 const session=createFreeViewSession({now,timeZone:'UTC',H:30}),snapshot=view(facts);
 const complete=projectFreeActivity(snapshot,evidence,session,now);assert.equal(complete.projects[0].activityDecision.basis,'exact');assert.equal(complete.projects[0].activityDecision.segment,2);
 snapshot.projects[0].membershipComplete=false;const partial=projectFreeActivity(snapshot,evidence,session,now);assert.equal(partial.projects[0].activityDecision.basis,'provisional');assert.equal(partial.projects[0].activityDecision.segment,2);
});

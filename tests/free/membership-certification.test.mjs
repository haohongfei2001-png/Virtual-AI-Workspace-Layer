import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleFreeReplica} from '../../src/data/free-replica.mjs';

test('complete inventory cannot overwrite explicit unknown Project membership with confirmed history',()=>{
 const header={scope:'A',revision:1,evidenceRevision:1,inventoryComplete:true,manifest:{projectVersions:{p:1},refVersions:{a:1}},viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0}};
 const page={scope:'A',revision:1,evidenceRevision:1,projects:[{id:'p',scope:'A',nativeName:'原生项目',memberCount:null,membershipComplete:false,membershipWitnessCurrent:false}],refs:[{id:'a',scope:'A',nativeTitle:'原生聊天',nativeUrl:'https://fixture.test/c/a',membership:'PROJECT',projectId:'p',activityDecision:{basis:'exact',candidateDay:19940,candidateTime:'2024-08-06T00:00:00Z',segment:2}}]};
 const snapshot=assembleFreeReplica(null,header,[page]).snapshot;
 assert.equal(snapshot.projects[0].membershipComplete,false,'inventory completeness is not membership completeness');
 assert.equal(snapshot.projects[0].activityDecision.basis,'provisional');
});

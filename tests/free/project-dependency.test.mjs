import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
import {planFreeReplica,assembleFreeReplica,freeReplicaRequests} from '../../src/data/free-replica.mjs';
async function setup(){
 const frame={documentId:'dependency_document',documentLifecycle:'active',url:'https://vaiwl-hf.test/hf/A/c/T0'},sender={id:'dependency_extension',tab:{id:1},frameId:0,...frame};
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:sender.id,getFrame:async()=>frame});let seq=0,leaseId;
 const call=(type,extra={})=>service.broker.handle({v:1,type,clientId:'dependency_client',seq:++seq,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 leaseId=(await call('BIND')).leaseId;
 const header=async()=>{const r=await call('B23_FREE_HEADER');assert.equal(r.ok,true,JSON.stringify(r));return r.header;};
 const read=async(prior,head)=>{const plan=planFreeReplica(prior,head),pages=[];for(const ids of freeReplicaRequests(plan,5000)){const r=await call('B23_FREE_PAGE',{revision:head.revision,offset:0,limit:5000,ids,viewSession:head.viewSession,now:FIXTURE_NOW});assert.equal(r.ok,true,JSON.stringify(r));pages.push(r.page);}return {plan,replica:assembleFreeReplica(prior,head,pages,plan)};};
 return {service,header,read,scope:scopeOf('A')};
}
test('native project unavailable→available reprojects unchanged member refs while retaining unrelated rows',async()=>{
 const h=await setup();try{
  let header=await h.header(),replica=(await h.read(null,header)).replica;assert.equal(replica.refs.get('T1').membership,'PROJECT');assert.equal(replica.refs.get('T1').projectId,'P1');
  const initialHeader=header,none=replica.refs.get('T0'),other=replica.refs.get('T2');assert.equal(none.membership,'NONE');assert.equal(other.projectId,'P2');
  for(const availability of ['unavailable','available']){
   const facts=await h.service.native.read(h.scope),project=facts.projects.P1,source=facts.sources[project.sourceId];
   const result=await h.service.native.apply(h.scope,{operationId:'project_'+availability,expectedRevision:facts.revision,batch:{scopeKey:facts.scopeKey,sourceRevision:source.sourceRevision+1,observedAt:source.observedAt,validUntil:source.validUntil,projects:[{id:project.id,nativeName:project.nativeName,nativeUrl:project.nativeUrl,availability,...(project.memberCount===undefined?{}:{memberCount:project.memberCount})}],refs:[],membership:[],inventory:source.inventory}});assert.equal(result.ok,true,JSON.stringify(result));
   const nextHeader=await h.header();assert.deepEqual(nextHeader.manifest.refVersions,initialHeader.manifest.refVersions);assert.equal(nextHeader.visibilityRevision,initialHeader.visibilityRevision);assert.equal(nextHeader.evaluatedAt,initialHeader.evaluatedAt);assert.equal(nextHeader.evidenceRevision,initialHeader.evidenceRevision);
   const update=await h.read(replica,nextHeader);assert(update.plan.refs.includes('T1'));assert(!update.plan.refs.includes('T0'));assert(!update.plan.refs.includes('T2'));
   replica=update.replica;header=nextHeader;assert.equal(replica.refs.get('T0'),none);assert.equal(replica.refs.get('T2'),other);
   assert.equal(replica.refs.get('T1').membership,availability==='available'?'PROJECT':'UNKNOWN');assert.equal(replica.projects.has('P1'),availability==='available');
   if(availability==='unavailable')assert(replica.snapshot.unknown.some(row=>row.id==='T1'));else assert.equal(replica.refs.get('T1').projectId,'P1');
  }
 }finally{h.service.close();}
});
test('removed project version and newly introduced project both refresh lost UNKNOWN dependencies',()=>{
 const header={scope:'scope',revision:1,evidenceRevision:'same',manifest:{projectVersions:{P:1,Q:1},refVersions:{R:1,N:1,O:1,U:1},activityVersions:{}},evaluatedAt:'fixed',viewSession:{H:30,T:'fixed',Z:'UTC',policyRevision:1}};
 const prior={header,refs:new Map([['R',{membership:'PROJECT',projectId:'P'}],['N',{membership:'NONE'}],['O',{membership:'PROJECT',projectId:'Q'}],['U',{membership:'UNKNOWN'}]])};
 for(const projectVersions of [{Q:1},{P:1,Q:1,NEW:2}]){
  const next={...header,revision:2,manifest:{...header.manifest,projectVersions}},plan=planFreeReplica(prior,next);
  assert(plan.refs.includes('U'));assert(!plan.refs.includes('N'));assert(!plan.refs.includes('O'));assert.equal(plan.refs.includes('R'),!Object.hasOwn(projectVersions,'P'));
 }
});

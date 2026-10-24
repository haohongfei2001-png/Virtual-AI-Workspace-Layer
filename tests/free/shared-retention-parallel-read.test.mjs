import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSharedDirectoryRetention} from '../../src/data/shared-directory-retention.mjs';
import {buildSharedRefDirectory,sharedRefDirectoryKey,sharedRefBucket} from '../../src/data/shared-ref-directory.mjs';
import {manifest_PARTITION_FORMAT,manifest_partitionRecord,manifest_partitionKey} from '../../src/data/partition-manifest.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const scope=normalizedScope({verified:true,provider:'fixture',accountId:'A',organizationId:'P'});
function fixture({same=false,missingPointer=null,lowerCeiling=false}={}){
 const make=revision=>buildSharedRefDirectory({format:manifest_PARTITION_FORMAT,generation:'g',scopeKey:scope.key,revision,channel:'synthetic',sources:{},workspaces:{},preferences:{},refVersions:{R:revision},humanRefs:[],units:0,changes:[]},scope);
 const [old,prior,next]=[1,2,3].map(make),bucket=sharedRefBucket('R');
 if(same){next.root.refDirectory[bucket]={...prior.root.refDirectory[bucket]};next.records=[];}
 if(lowerCeiling){prior.root.nextOrdinal=2;prior.records[0]=manifest_partitionRecord(prior.records[0].key,{...prior.records[0].payload,ordinals:[1]});next.root.nextOrdinal=1;}
 if(missingPointer){const f=missingPointer==='prior'?prior:next;delete f.root.refDirectory[bucket];f.records=[];}
 const rows=new Map([...old.records,...prior.records,...next.records].map(r=>[r.key,r])),requests=[],deleteRequests=[],deleted=[],failed=[];let denied=false;
 const store={get(key){const request={key};requests.push(request);return request;},delete(key){deleted.push(key);const request={key};deleteRequests.push(request);return request;}};
 const tx={objectStore(name){return name==='b23_checkpoints'?{get(key){const request={key,checkpoint:true};requests.push(request);return request;}}:store;}};
 prepareSharedDirectoryRetention(tx,scope,prior.root,()=>{if(denied)throw Error('guard-denied');},e=>failed.push(e))(next.root);
 const answer=(q,{corrupt=false,missing=false,error=false}={})=>{assert(q,'request exists');if(error){q.error=Error('read-failed');q.onerror();return;}q.result=missing?undefined:structuredClone(q.checkpoint?manifest_partitionRecord(scope.key,old.root):rows.get(q.key));if(corrupt)q.result.checksum='0'.repeat(64);q.onsuccess();};
 const key=value=>{const root=value.root??value,p=root.refDirectory[bucket];return p?sharedRefDirectoryKey(scope.key,'g',bucket,p.revision):null;};
 const requestFor=root=>requests.findLast(q=>!q.checkpoint&&q.key===key(root));
 return {old,prior,next,requests,deleteRequests,deleted,failed,answer,requestFor,key,deny:()=>{denied=true;},expectedDeletes:[manifest_partitionKey(scope.key,'R',1,'g'),old.records[0].key]};
}
function open(h){assert.equal(h.requests.length,1);h.answer(h.requests[0]);assert.equal(h.requests.length,2);assert.deepEqual(h.deleted,[]);h.answer(h.requests[1]);}
for(const order of ['prior-first','current-first'])test('independent retained/current reads queue together, delete only after both: '+order,()=>{
 const h=fixture();open(h);assert.equal(h.requests.length,4,'both fresh gets must be queued before either reply');assert.deepEqual(h.deleted,[]);
 const pair=order==='prior-first'?[h.prior,h.next]:[h.next,h.prior];h.answer(h.requestFor(pair[0]));assert.deepEqual(h.deleted,[]);h.answer(h.requestFor(pair[1]));assert.deepEqual(h.failed,[]);assert.deepEqual(h.deleted,h.expectedDeletes);assert.equal(h.requests.length,4);
});
for(const target of ['prior','next'])for(const fault of ['missing','corrupt','error'])for(const order of ['fault-first','valid-first'])test(target+' '+fault+' never authorizes delete, '+order,()=>{
 const h=fixture();open(h);assert.equal(h.requests.length,4);const bad=h.requestFor(h[target]),good=h.requestFor(target==='prior'?h.next:h.prior),fail=()=>h.answer(bad,{[fault]:true});
 if(order==='fault-first'){fail();h.answer(good);}else{h.answer(good);fail();}assert(h.failed.length>0);assert.deepEqual(h.deleted,[]);
});
for(const fault of ['missing','corrupt','error'])test('unverified old '+fault+' cannot start retained reads or deletion',()=>{
 const h=fixture();h.answer(h.requests[0]);h.answer(h.requests[1],{[fault]:true});assert.equal(h.requests.length,2);assert.deepEqual(h.deleted,[]);
});
for(const fault of ['missing','corrupt'])test('unverified checkpoint '+fault+' grants no deletion authority',()=>{const h=fixture();h.answer(h.requests[0],{[fault]:true});assert.equal(h.requests.length,1);assert.deepEqual(h.deleted,[]);});
for(const order of ['prior-first','current-first'])test('guard loss between valid replies rejects deletion: '+order,()=>{const h=fixture();open(h);assert.equal(h.requests.length,4);const pair=order==='prior-first'?[h.prior,h.next]:[h.next,h.prior];h.answer(h.requestFor(pair[0]));h.deny();h.answer(h.requestFor(pair[1]));assert(h.failed.some(e=>e.message==='guard-denied'));assert.deepEqual(h.deleted,[]);});
test('identical retained pointer uses one verified read',()=>{const h=fixture({same:true});open(h);assert.equal(h.requests.length,3);h.answer(h.requestFor(h.prior));assert.deepEqual(h.failed,[]);assert.deepEqual(h.deleted,h.expectedDeletes);assert.equal(h.requests.length,3);});
test('same physical bucket with a lower current ordinal ceiling is separately validated',()=>{const h=fixture({same:true,lowerCeiling:true});open(h);assert.equal(h.requests.length,4);assert.equal(h.requests[2].key,h.requests[3].key);h.answer(h.requests[2]);assert.deepEqual(h.deleted,[]);h.answer(h.requests[3]);assert(h.failed.some(e=>e.message==='invalid-shared-directory-order'));assert.deepEqual(h.deleted,[]);});
for(const missingPointer of ['prior','next'])test('missing '+missingPointer+' pointer is a completed null result, not an unread result',()=>{const h=fixture({missingPointer});open(h);assert.equal(h.requests.length,3);assert.deepEqual(h.deleted,[]);h.answer(h.requests[2]);assert.deepEqual(h.failed,[]);assert.deepEqual(h.deleted,h.expectedDeletes);});

for(const index of [0,1])test('guard loss at deletion success rejects owner write: '+index,()=>{
 const h=fixture();open(h);h.answer(h.requestFor(h.prior));h.answer(h.requestFor(h.next));assert.deepEqual(h.failed,[]);assert.deepEqual(h.deleted,h.expectedDeletes);assert.equal(h.deleteRequests.length,2);
 h.deny();h.deleteRequests[index].onsuccess();assert.deepEqual(h.failed.map(e=>e.message),['guard-denied']);
});
test('valid deletion success preserves successful retention',()=>{
 const h=fixture();open(h);h.answer(h.requestFor(h.prior));h.answer(h.requestFor(h.next));for(const request of h.deleteRequests)request.onsuccess();assert.deepEqual(h.failed,[]);assert.deepEqual(h.deleted,h.expectedDeletes);
});

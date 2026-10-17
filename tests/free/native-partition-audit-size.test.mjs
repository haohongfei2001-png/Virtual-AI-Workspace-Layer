import test from 'node:test';
import assert from 'node:assert/strict';
import {A} from '../b23/contracts.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {auditNativePartitions} from '../../src/data/native-partition-audit.mjs';
import {nativeHeader,nativeRecord,validateNativeManifest,NATIVE_PARTITION_FORMAT} from '../../src/data/native-partitions.mjs';
import {validateNativeFacts} from '../../src/data/native-facts.mjs';

test('audit rejects global facts above 128Mi even though each 5000-row batch independently fits',async()=>{
 const scope=normalizedScope(A),limit=128*1024*1024,witness={sourceId:'size_fixture',generation:'one',sourceRevision:1,observedAt:'2026-10-13T00:00:00Z',validUntil:'2026-10-14T00:00:00Z'};
 // Each alias is legal (200 code units), yet controls expand sixfold in JSON.
 // Reuse this immutable string in all rows; only one full-sized oracle string
 // is transiently allocated, and native records are generated on demand.
 const alias='a'+'\u0001'.repeat(199),aliases=Array(20).fill(alias);
 const manifest={format:NATIVE_PARTITION_FORMAT,scopeKey:scope.key,revision:1,sources:{size_fixture:{id:'size_fixture',generation:witness.generation,sourceRevision:1,observedAt:witness.observedAt,validUntil:witness.validUntil,revoked:false,channel:'synthetic',inventory:{projects:'complete',conversations:'complete',cursor:null}}},projects:{},refs:{},units:0,changes:[]};
 const facts=nativeHeader(manifest,scope),count=5500;
 for(let i=0;i<count;i++){const id='R'+i;manifest.refs[id]=1;facts.refs[id]={id,nativeTitle:alias,nativeAliases:aliases,nativeUrl:'https://fixture.test/c/'+id,availability:'available',...witness};facts.membership[id]={id,state:'NONE',projectId:null,...witness};}
 validateNativeManifest(manifest,scope);
 const fullJSONLength=JSON.stringify(facts).length;
 assert(fullJSONLength>limit,'independent complete JSON oracle must exceed global cap');
 const first=nativeHeader(manifest,scope),last=nativeHeader(manifest,scope);
 for(let i=0;i<count;i++){const id='R'+i,target=i<5000?first:last;target.refs[id]=facts.refs[id];target.membership[id]=facts.membership[id];}
 assert(JSON.stringify(first).length<=limit);assert(JSON.stringify(last).length<=limit);
 validateNativeFacts(first,scope);validateNativeFacts(last,scope);
 let reads=0,doneCalls=0,failCalls=0;
 const store={get(key){const [scopeKey,label,kind,id,revision]=JSON.parse(key);assert.equal(scopeKey,scope.key);assert.equal(label,'native-piece');assert.equal(kind,'refs');assert.equal(revision,1);assert(facts.refs[id]);reads++;const request={};queueMicrotask(()=>{request.result=nativeRecord(key,{scopeKey,kind,id,revision,row:facts.refs[id],membership:facts.membership[id]});request.onsuccess();});return request;}};
 const error=await new Promise((resolve,reject)=>auditNativePartitions(store,manifest,scope,()=>{},()=>{doneCalls++;reject(Error('oversized inventory incorrectly accepted'));},error=>{failCalls++;resolve(error);}));
 assert.equal(error.message,'native-facts-too-large');assert.equal(doneCalls,0);assert.equal(failCalls,1);assert.equal(reads,count,'audit reaches second batch; per-batch rejection is not the tested failure');
});

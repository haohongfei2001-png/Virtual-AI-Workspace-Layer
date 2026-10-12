import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNativeManifest,NATIVE_PARTITION_FORMAT} from '../../src/data/native-partitions.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {digest} from '../../src/data/hash.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {evidenceHarness} from './evidence-contracts.mjs';
const scope=normalizedScope(scopeOf('A'));
function fixture(){return {format:NATIVE_PARTITION_FORMAT,scopeKey:scope.key,revision:2,sources:{},projects:{P:1},refs:{R:2},units:0,changes:[]};}
function rejects(change,reason){const value=fixture();change(value);assert.throws(()=>validateNativeManifest(value,scope),error=>error.message===reason);}
for(const table of ['projects','refs']){
 for(const value of [true,false,42,0,'abc','',null,[]])test(`native ${table} rejects non-map ${JSON.stringify(value)}`,()=>rejects(m=>{m[table]=value;},'native-partition-capacity'));
 for(const version of [0,-1,1.5,3,NaN,Infinity,'1'])test(`native ${table} rejects version ${String(version)}`,()=>rejects(m=>{m[table]={R:version};},'invalid-native-piece-version'));
 test(`native ${table} validates IDs before version`,()=>rejects(m=>{m[table]={'bad key':0};},'invalid-id'));
 test(`native ${table} capacity checked before per-row version`,()=>rejects(m=>{m[table]=Object.fromEntries(Array.from({length:100001},(_,i)=>['r'+i,0]));},'native-partition-capacity'));
}
test('native manifest aggregate boundary, scope and revision remain strict',()=>{
 const value=fixture();value.units=128*1024*1024;assert.equal(validateNativeManifest(value,scope),value);
 rejects(m=>{m.units++;m.units+=128*1024*1024;},'invalid-native-manifest');rejects(m=>{m.units=-1;},'invalid-native-manifest');rejects(m=>{m.scopeKey=normalizedScope(scopeOf('B')).key;},'invalid-native-manifest');rejects(m=>{m.revision=0;},'invalid-native-manifest');
});
test('native manifest preserves schema/header/project/ref/change error precedence',()=>{
 rejects(m=>{m.extra=true;m.scopeKey='bad';},'invalid-schema');
 rejects(m=>{m.scopeKey='bad';m.projects=true;},'invalid-native-manifest');
 rejects(m=>{m.projects={'bad key':0};m.refs=true;},'invalid-id');
 rejects(m=>{m.projects.P=0;m.refs=true;},'invalid-native-piece-version');
 rejects(m=>{m.refs=true;m.changes=null;},'native-partition-capacity');
 rejects(m=>{m.changes=null;},'invalid-native-changes');
});
for(const table of ['projects','refs'])test(`checksum-valid primitive ${table} root refuses reads and remains recoverable through valid shadow`,async()=>{
 const h=await evidenceHarness(new MockIDBFactory()),now='2026-10-13T00:00:00Z',native=new NativeRepository({baseRepository:h.base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'fixture',generation:'one'})});
 try{
  assert.equal((await native.apply(scope,{operationId:'seed',expectedRevision:0,batch:{scopeKey:scope.key,sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}}})).ok,true);
  const db=await h.base.open();let damagedHash;
  await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),request=store.get(scope.key);request.onsuccess=()=>{const row=request.result;row.payload[table]=true;row.checksum=digest(row.payload);damagedHash=digest(row);store.put(row);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  await assert.rejects(native.read(scope),/native-partition-capacity/);await assert.rejects(native.page(scope,{ids:{projects:[],refs:[]}}),/native-partition-capacity/);
  const result=await native.recover(scope,{operationId:'recover',damagedHash});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.evidenceInvalidated,true);assert(Object.values((await native.read(scope)).sources).every(source=>source.revoked));
 }finally{h.close();}
});

import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {nativeCheckpointKey,nativePartitionKey} from '../../src/data/native-partitions.mjs';
import {digest} from '../../src/data/hash.mjs';
const assert=Object.assign((value,message='assertion-failed')=>{if(!value)throw Error(message);},{equal:(actual,expected,message='equality-failed')=>{if(actual!==expected)throw Error(message+': '+String(actual)+' !== '+String(expected));}});
const scope=normalizedScope(scopeOf('A')),now='2026-10-13T00:00:00Z';
async function raw(base,key){const db=await base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),r=tx.objectStore('native_states').get(key);tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});}
export async function runNativeGCRecovery(indexedDB){
 const base=new ScopeRepository({indexedDB,databaseName:'native_gc_recovery_'+crypto.randomUUID()});let sourceId='first';const native=new NativeRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId,generation:'one'})});
 const write=async(revision,sourceRevision)=>{const result=await native.apply(scope,{operationId:'write_'+revision,expectedRevision:revision-1,batch:{scopeKey:scope.key,sourceRevision,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id:'R',nativeTitle:'revision '+revision,nativeUrl:'https://vaiwl-hf.test/hf/A/c/R',availability:'available'}],membership:[{id:'R',state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}});assert.equal(result.ok,true,JSON.stringify(result));};
 const piece=version=>nativePartitionKey(scope.key,'refs','R',version);
 try{
  await write(1,1);await write(2,2);assert(await raw(base,piece(1)));assert(await raw(base,piece(2)));
  const root=await raw(base,scope.key);root.checksum='damaged';const db=await base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite');tx.objectStore('native_states').put(root);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  const recovery=await native.recover(scope,{operationId:'recover',damagedHash:digest(root)});assert.equal(recovery.ok,true,JSON.stringify(recovery));assert.equal(recovery.revision,3);assert.equal((await raw(base,nativeCheckpointKey(scope.key))).payload.refs.R,1);assert(await raw(base,piece(1)),'before checkpoint replacement the historical piece is still needed');
  sourceId='separately_reauthorized';await write(4,1);assert.equal((await raw(base,nativeCheckpointKey(scope.key))).payload.refs.R,2);assert(await raw(base,piece(2)),'previous retained checkpoint piece');assert(await raw(base,piece(4)),'current root piece');assert.equal((await native.read(scope)).refs.R.nativeTitle,'revision 4');
  assert.equal(await raw(base,piece(1)),undefined,'recovery cleared change history; superseded older checkpoint piece must not become permanent orphan');
  await write(5,2);assert.equal(await raw(base,piece(2)),undefined);assert(await raw(base,piece(4)));assert(await raw(base,piece(5)));
  return {orphanRemoved:true,priorAndCurrentRetained:true,postRecoveryRead:true};
 }finally{base.close();}
}

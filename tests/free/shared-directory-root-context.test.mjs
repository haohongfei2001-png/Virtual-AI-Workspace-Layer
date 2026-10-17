import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scopeOf} from '../../simulator/data.mjs';
import {emptyState} from '../../src/data/state.mjs';
const sourceURL=new URL('../../src/data/shared-ref-directory.mjs',import.meta.url);let sequence=0;
async function measured(){
 let source=await readFile(sourceURL,'utf8');
 const anchor='function validateRootStructure(root,scope){';assert.equal(source.split(anchor).length,2);
 source=source.replace(anchor,anchor+'structureCalls++;');
 source+='\nlet structureCalls=0;export const countStructureCalls=()=>structureCalls;\n// isolated module '+sequence++;
 source=source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?`from '${new URL(path,sourceURL).href}'`:all);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
function root(scope,revision=1){return {format:'vaiwl-shared-ref-directory-v1',generation:'fixture_generation',scopeKey:emptyState(scope).scopeKey,revision,channel:'none',sources:{},workspaces:{},preferences:{},humanRefs:[],units:0,changes:[],refDirectory:{},nextOrdinal:0};}
const A=scopeOf('A'),B=scopeOf('B');
test('eight alternating shared root revisions retain structural validation within existing cache budget',async()=>{
 const api=await measured(),roots=Array.from({length:8},(_,i)=>root(A,i+1));
 for(const value of roots)api.validateSharedDirectoryRoot(value,A);
 const before=api.countStructureCalls();
 for(let round=0;round<3;round++)for(const value of roots)assert.deepEqual(api.validateSharedDirectoryRoot(structuredClone(value),A),value);
 assert.equal(api.countStructureCalls()-before,0,'full-byte-equal revisions must not evict one another below eight entries');
});
test('ninth shared root revision still evicts the oldest bounded cache entry',async()=>{
 const api=await measured(),roots=Array.from({length:9},(_,i)=>root(A,i+1));
 for(const value of roots)api.validateSharedDirectoryRoot(value,A);
 const before=api.countStructureCalls();api.validateSharedDirectoryRoot(structuredClone(roots[0]),A);
 assert.equal(api.countStructureCalls()-before,1);
});
test('same revision changed bytes revalidate and malformed fields cannot reuse warm structure',async()=>{
 const api=await measured(),original=root(A);api.validateSharedDirectoryRoot(original,A);
 const changed={...original,units:1},before=api.countStructureCalls();assert.equal(api.validateSharedDirectoryRoot(changed,A),changed);
 assert.equal(api.countStructureCalls()-before,1,'revision alone is never validation');
 for(const patch of [{nextOrdinal:-1},{extra:true},{revision:-1},{humanRefs:['missing']},{units:NaN},{refDirectory:{'00':{revision:2,count:1,units:5}}}]){
  assert.throws(()=>api.validateSharedDirectoryRoot({...changed,...patch},A));
  assert.deepEqual(api.validateSharedDirectoryRoot(structuredClone(changed),A),changed);
 }
});
test('same revision from another scope requires independent structure validation',async()=>{
 const api=await measured(),a=root(A),b=root(B);api.validateSharedDirectoryRoot(a,A);
 assert.throws(()=>api.validateSharedDirectoryRoot(structuredClone(a),B));
 const before=api.countStructureCalls();assert.equal(api.validateSharedDirectoryRoot(b,B),b);assert.equal(api.countStructureCalls()-before,1);
 assert.throws(()=>api.validateSharedDirectoryRoot(structuredClone(b),A));
});
test('invalid revision objects never execute toJSON while choosing validation context',async()=>{
 const api=await measured();let calls=0;const value=root(A);value.revision={toJSON(){calls++;return 1;}};
 assert.throws(()=>api.validateSharedDirectoryRoot(value,A),/non-json-value/);
 assert.equal(calls,0,'context construction cannot invoke revision.toJSON');
});
test('revision accessor is read only by the original strict byte validation',async()=>{
 const api=await measured();let reads=0;const value=root(A);
 Object.defineProperty(value,'revision',{enumerable:true,get(){reads++;return undefined;}});
 assert.throws(()=>api.validateSharedDirectoryRoot(value,A),/non-json-value/);
 assert.equal(reads,1,'context construction must not add a getter read before strictJSON rejects');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {emptyState,reduceCommand} from '../../src/data/state.mjs';
import {PartitionedState,PARTITION_FORMAT,partitionUnpack} from '../../src/data/partitioned.mjs';
import {stable} from '../../src/data/hash.mjs';
import {buildSharedRefDirectory} from '../../src/data/shared-ref-directory.mjs';
const baseline='8d89ebad91dfa87d34b9b7a20be7a624eba652d9',scope=normalizedScope(scopeOf('A')),saver=new PartitionedState({}),sourceURL=new URL('../../src/data/shared-directory-writer.mjs',import.meta.url);let serial=0;
async function measured(old=false){
 let source=old?execFileSync('git',['show',baseline+':src/data/shared-directory-writer.mjs'],{encoding:'utf8'}):await readFile(sourceURL,'utf8');
 assert(source.includes('import {validateSharedDirectoryRoot,'));source=source.replace('import {validateSharedDirectoryRoot,','import {validateSharedDirectoryRoot as originalValidate,');
 source+='\nlet validationCalls=0;const validateSharedDirectoryRoot=(...args)=>{validationCalls++;return originalValidate(...args);};export const validationCount=()=>validationCalls;\n// '+serial++;
 source=source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?`from '${new URL(path,sourceURL).href}'`:all);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
// Collecting transaction probes real writer and PartitionedState.saveMutation;
// they compare emitted records, not browser IDB durability or owner rollback.
function fixture(){
 const current=emptyState(scope);current.revision=64;
 current.refs.R={id:'R',nativeUrl:'https://fixture.test/c/R',nativeTitle:'Native R',projectId:null,available:true};
 current.identities.R={id:'R',title:'Human R',aliases:[],locked:true,owner:'human',revision:1};
 const piece={scopeKey:scope.key,refId:'R',revision:64,ref:current.refs.R,identity:current.identities.R,events:[],coverage:[],placements:[]};
 const changes=Array.from({length:64},(_,i)=>({revision:i+1,refs:Array.from({length:64},(_,j)=>'changed_'+i+'_'+j)}));
 const manifest={format:PARTITION_FORMAT,generation:'root_validation',scopeKey:scope.key,revision:64,channel:current.channel,sources:current.sources,workspaces:current.workspaces,preferences:current.preferences,refVersions:{R:64},humanRefs:['R'],units:stable(piece).length,changes};
 const next=reduceCommand(current,{type:'SET_TITLE',refId:'R',title:'Changed'},'human'),patch=[{table:'identities',key:'R',before:current.identities.R,after:next.identities.R}],built=buildSharedRefDirectory(manifest,scope),storage={manifest,pieces:new Map([['R',piece]]),directoryRecords:built.records},rows=[];
 const tx={objectStore(name){assert.equal(name,'b23_states');return {put:row=>rows.push(structuredClone(row))};}};
 return {current,next,patch,storage,root:built.root,rows,tx};
}
function save(api,f,writer=saver.saveMutation.bind(saver)){return api.saveSharedDirectoryMutation(f.tx,f.root,scope,f.storage,f.current,f.next,f.patch,'human',writer);}
test('synchronous shared writer validates original root once, preserving all output bytes and delta window',async t=>{
 const old=await measured(true),current=await measured(process.env.SHARED_ROOT_VALIDATION_BASELINE==='1'),a=fixture(),b=fixture();const oldRoot=save(old,a),newRoot=save(current,b);
 t.diagnostic(JSON.stringify({oldWriterValidationCalls:old.validationCount(),newWriterValidationCalls:current.validationCount(),changeRows:64,changeRefs:4096}));
 assert.equal(old.validationCount(),2);assert.equal(current.validationCount(),1);assert.deepEqual(newRoot,oldRoot);assert.deepEqual(b.rows,a.rows);assert.equal(newRoot.changes.length,64);assert.deepEqual(newRoot.changes.at(-1),{revision:65,refs:['R']});for(const row of b.rows)assert.deepEqual(partitionUnpack(row),row.payload);
});
for(const fault of ['negative-units','invalid-change-id','too-many-changes','invalid-preference','schema'])test('invalid root '+fault+' rejects before any write',async()=>{
 const api=await measured(),f=fixture();if(fault==='negative-units')f.root.units=-1;if(fault==='invalid-change-id')f.root.changes[0].refs[0]='__proto__';if(fault==='too-many-changes')f.root.changes.push({revision:64,refs:[]});if(fault==='invalid-preference')f.root.preferences.workingSet={id:'workingSet',value:{refs:['R'],current:'absent'}};if(fault==='schema')f.root.extra=true;
 assert.throws(()=>save(api,f));assert.equal(f.rows.length,0);
});
test('public sharedMutationManifest retains independent root validation',async()=>{const api=await measured(),f=fixture();api.sharedMutationManifest(f.root,scope,['R'],f.storage.directoryRecords);assert.equal(api.validationCount(),1);f.root.changes[0].refs[0]='__proto__';assert.throws(()=>api.sharedMutationManifest(f.root,scope,['R'],f.storage.directoryRecords));});
for(const fault of ['units','changes','scope'])test('external legacy callback mutation '+fault+' is rejected after callback returns',async()=>{
 const api=await measured(),f=fixture();let invoked=false;
 const writer=(...args)=>{const result=saver.saveMutation(...args);invoked=true;if(fault==='units')f.root.units=-1;if(fault==='changes')f.root.changes[0].refs[0]='__proto__';if(fault==='scope')f.root.scopeKey='foreign';return result;};
 assert.throws(()=>save(api,f,writer));assert(invoked);assert(!f.rows.some(row=>row.key===scope.key),'invalid directory root must not be published');
});
test('patch getter cannot mutate root between the remaining validation and publication',async()=>{
 const api=await measured(),f=fixture();let observed=false;
 Object.defineProperty(f.patch[0],'key',{get(){observed=true;f.root.units=-1;return 'R';},enumerable:true});
 assert.throws(()=>save(api,f));assert(observed);assert.equal(f.rows.length,0);
});

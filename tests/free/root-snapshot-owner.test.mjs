import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {PartitionedState,partitionRecord,PARTITION_FORMAT} from '../../src/data/partitioned.mjs';
import {buildNativeVersionIndex} from '../../src/data/native-version-index.mjs';
import {buildSharedRefDirectory} from '../../src/data/shared-ref-directory.mjs';
import {nativeRecord,NATIVE_PARTITION_FORMAT} from '../../src/data/native-partitions.mjs';
import {emptyState} from '../../src/data/state.mjs';
const scope=normalizedScope(scopeOf('A'));
function native(){return buildNativeVersionIndex({format:NATIVE_PARTITION_FORMAT,scopeKey:scope.key,revision:1,sources:{},projects:{},refs:{R:1},units:100,changes:[{revision:1,projects:[],refs:['R']}]},scope).root;}
function shared(){const state=emptyState(scope);return buildSharedRefDirectory({format:PARTITION_FORMAT,generation:'one',scopeKey:scope.key,revision:1,channel:state.channel,sources:state.sources,workspaces:state.workspaces,preferences:state.preferences,refVersions:{R:1},humanRefs:[],units:100,changes:[{revision:1,refs:['R']}]},scope).root;}
for(const name of ['native','shared'])test(name+' owner certifies only its immutable current read and rejects warm-cache corruption',()=>{
 const owner=name==='native'?new NativeRepository({baseRepository:{open(){},scopeOrThrow(){return scope;}}}):new PartitionedState({});
 const read=(name==='native'?owner.verifiedRoot:owner.verifiedDirectory).bind(owner);
 const record=name==='native'?nativeRecord:partitionRecord,row=record(scope.key,name==='native'?native():shared()),one=read(row,scope);
 assert(Object.isFrozen(one));assert(Object.isFrozen(one.changes));assert(Object.isFrozen(one.changes[0].refs));assert.notEqual(one,row.payload);
 const two=read(structuredClone(row),scope);assert.deepEqual(one,two);assert.notEqual(one,two,'each newly read record owns its own immutable snapshot');
 row.payload.changes[0].refs.push('tampered');assert.deepEqual(one.changes[0].refs,['R']);assert.throws(()=>read(row,scope));
 const malformed=record(scope.key,{...two,units:-1});assert.throws(()=>read(malformed,scope));
 assert.throws(()=>read(record('wrong-key',two),scope));assert.throws(()=>read(record(scope.key,two),normalizedScope(scopeOf('B'))));
});

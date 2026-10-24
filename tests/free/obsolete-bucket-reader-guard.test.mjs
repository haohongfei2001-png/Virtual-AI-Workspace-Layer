import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {createNativeIndexReader} from '../../src/data/native-index-reader.mjs';
import {buildNativeVersionIndex,nativeIndexBucket} from '../../src/data/native-version-index.mjs';
import {NATIVE_PARTITION_FORMAT} from '../../src/data/native-partitions.mjs';
import {createSharedDirectoryReader} from '../../src/data/shared-directory-reader.mjs';
import {buildSharedRefDirectory,sharedRefBucket} from '../../src/data/shared-ref-directory.mjs';
import {manifest_PARTITION_FORMAT} from '../../src/data/partition-manifest.mjs';
const scope=normalizedScope({verified:true,provider:'synthetic',accountId:'A',organizationId:'fixture'});
for(const kind of ['native','shared'])for(const secondEvent of ['success','error'])for(const revoke of [false,true])test(`${kind} queued ${secondEvent} after data failure still checks owner: revoked=${revoke}`,()=>{
 const built=kind==='native'?buildNativeVersionIndex({format:NATIVE_PARTITION_FORMAT,scopeKey:scope.key,revision:1,sources:{},projects:{},refs:{R:1,S:1},units:0,changes:[]},scope):buildSharedRefDirectory({format:manifest_PARTITION_FORMAT,scopeKey:scope.key,generation:'g',revision:1,channel:'synthetic',sources:{},workspaces:{},preferences:{},refVersions:{R:1,S:1},humanRefs:[],units:0,changes:[]},scope);
 const byKey=new Map(built.records.map(row=>[row.key,row])),requests=[],dataFailures=[],guardFailures=[];let allowed=true,guardCalls=0,deliveries=0;
 const store={get(key){const q={key};requests.push(q);return q;}};
 const ownerGuard={check(){guardCalls++;if(!allowed)throw Error('owner-lost');},fail(error){guardFailures.push(error.message);}};
 const reader=kind==='native'?createNativeIndexReader(store,built.root,scope,e=>dataFailures.push(e),ownerGuard):createSharedDirectoryReader(store,built.root,scope,e=>dataFailures.push(e),ownerGuard);
 for(const id of ['R','S'])if(kind==='native')reader.readBucket('refs',nativeIndexBucket(id),()=>deliveries++);else reader.readBucket(sharedRefBucket(id),()=>deliveries++);
 assert.equal(requests.length,2);const [first,second]=requests;first.result={...structuredClone(byKey.get(first.key)),checksum:'0'.repeat(64)};first.onsuccess();assert.equal(dataFailures.length,1);assert.equal(guardCalls,1);
 allowed=!revoke;if(secondEvent==='success'){second.result=structuredClone(byKey.get(second.key));second.onsuccess();}else{second.error=Error('old-read-error');second.onerror();}
 assert.equal(guardCalls,2,'failed reader must still fence each already queued event');assert.deepEqual(guardFailures,revoke?['owner-lost']:[]);assert.equal(dataFailures.length,1,'abandoned data reader remains fail-once');assert.equal(deliveries,0);
});

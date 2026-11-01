import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../src/data/hash.mjs';
import {FREE_INSTALLATION_KEY,freePolicyInitializationKey,freshInstallationRecord,isFreshInstallationRecord,freePolicyInitializationRecord,validFreePolicyInitializationRecord} from '../../src/data/free-policy-initialization.mjs';
test('fresh database envelope is exact, independent, and checksummed',()=>{
 const first=freshInstallationRecord(),second=freshInstallationRecord();assert.deepEqual(first,{key:JSON.stringify(['vaiwl-free-installation',1]),payload:{version:1,kind:'fresh-database'},checksum:digest({version:1,kind:'fresh-database'})});assert.equal(first.key,FREE_INSTALLATION_KEY);assert.notEqual(first.payload,second.payload);assert.equal(isFreshInstallationRecord(first),true);first.payload.kind='legacy';assert.equal(isFreshInstallationRecord(first),false);assert.equal(isFreshInstallationRecord(second),true);
});
test('missing, malformed, extra, wrong key/version/kind and tampered checksum cannot prove new installation',()=>{
 for(const row of [undefined,null,[],{},false,'fresh'])assert.equal(isFreshInstallationRecord(row),false);
 for(const modify of [r=>r.key='elsewhere',r=>r.payload.version=2,r=>r.payload.kind='existing-database',r=>r.payload.extra=true,r=>r.extra=true,r=>delete r.payload.kind,r=>r[Symbol('extra')]=true]){const row=freshInstallationRecord();modify(row);if(row.payload)row.checksum=digest(row.payload);assert.equal(isFreshInstallationRecord(row),false);}
 const row=freshInstallationRecord();row.checksum='bad';assert.equal(isFreshInstallationRecord(row),false);
});
test('scope initialization modes bind exact scope and cannot collide with database provenance',()=>{
 for(const mode of ['auto','fixed','existing']){const row=freePolicyInitializationRecord('scope-A',mode);assert.equal(row.key,freePolicyInitializationKey('scope-A'));assert.deepEqual(row.payload,{version:1,scopeKey:'scope-A',mode});assert.equal(row.checksum,digest(row.payload));assert.equal(validFreePolicyInitializationRecord(row,'scope-A'),true);assert.equal(validFreePolicyInitializationRecord(row,'scope-B'),false);assert.equal(isFreshInstallationRecord(row),false);assert.notEqual(row.key,FREE_INSTALLATION_KEY);}
 assert.notEqual(freePolicyInitializationKey('a,b'),freePolicyInitializationKey('a"b'));
});
test('invalid scoped records are diagnostic failures, never inferred fresh markers',()=>{
 for(const modify of [r=>r.key=FREE_INSTALLATION_KEY,r=>r.payload.scopeKey='other',r=>r.payload.mode='fresh',r=>r.payload.version=2,r=>r.payload.extra=null,r=>r.extra=null,r=>delete r.payload.mode,r=>r.payload[Symbol('extra')]=true]){const row=freePolicyInitializationRecord('scope-A','auto');modify(row);row.checksum=digest(row.payload);assert.equal(validFreePolicyInitializationRecord(row,'scope-A'),false);}
 const row=freePolicyInitializationRecord('scope-A','auto');row.payload.mode='fixed';assert.equal(validFreePolicyInitializationRecord(row,'scope-A'),false);
 for(const row of [null,undefined,[],{},42,freshInstallationRecord()])assert.equal(validFreePolicyInitializationRecord(row,'scope-A'),false);
});
test('factory rejects invalid modes/scopes; validators fail closed on malformed shapes',()=>{
 for(const mode of ['AUTO',null,undefined,{},0])assert.throws(()=>freePolicyInitializationRecord('scope-A',mode),/invalid-free-policy-initialization/);
 for(const scope of ['',null,undefined,{},5]){assert.throws(()=>freePolicyInitializationRecord(scope,'auto'),/invalid-free-policy-initialization/);assert.equal(validFreePolicyInitializationRecord(freePolicyInitializationRecord('scope-A','auto'),scope),false);}
 const throwing={get key(){throw Error('fixture');},payload:{},checksum:''};assert.equal(isFreshInstallationRecord(throwing),false);assert.equal(validFreePolicyInitializationRecord(throwing,'scope-A'),false);
 const inherited=Object.create(freshInstallationRecord());assert.equal(isFreshInstallationRecord(inherited),false);
});

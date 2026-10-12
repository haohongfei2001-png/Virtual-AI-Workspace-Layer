import test from 'node:test';
import assert from 'node:assert/strict';
import {VerifiedRecordCache} from '../../src/data/verified-record-cache.mjs';
import {digest} from '../../src/data/hash.mjs';
const context='scope-A/native-root/v1';
const record=(key='root',extra={})=>{const payload={kind:'valid',scope:'A',value:'original',...extra};return {key,payload,checksum:digest(payload)};};
function verifier(expectedScope='A'){
 let calls=0;const verify=(payload,row)=>{calls++;if(row.checksum!==digest(payload))throw Error('corrupt-record');if(payload.kind!=='valid'||payload.scope!==expectedScope)throw Error('invalid-schema');};return {verify,calls:()=>calls};
}
test('identical body in a fresh object hits validation cache and returns the current payload identity',()=>{
 const cache=new VerifiedRecordCache(),v=verifier(),first=record(),second=structuredClone(first);
 assert.equal(cache.read(first,context,v.verify),first.payload);assert.equal(cache.read(second,context,v.verify),second.payload);assert.equal(v.calls(),1);assert.notEqual(first.payload,second.payload);
});
test('same key/checksum with changed payload never bypasses hash validation',()=>{
 const cache=new VerifiedRecordCache(),v=verifier(),first=record();cache.read(first,context,v.verify);const changed=structuredClone(first);changed.payload.value='tampered';
 assert.throws(()=>cache.read(changed,context,v.verify),/corrupt/);assert.equal(v.calls(),2);assert.equal(cache.read(structuredClone(first),context,v.verify).value,'original');
});
test('a correctly re-signed invalid schema is rejected and failed verification is never cached',()=>{
 const cache=new VerifiedRecordCache(),v=verifier();cache.read(record(),context,v.verify);const invalid=record('root',{kind:'invalid'});
 for(let i=0;i<2;i++)assert.throws(()=>cache.read(invalid,context,v.verify),/invalid-schema/);assert.equal(v.calls(),3);
});
for(const [name,validValue,invalidValue] of [['Date','2026-10-13T00:00:00.000Z',()=>new Date('2026-10-13T00:00:00.000Z')],['NaN',null,()=>NaN],['Infinity',null,()=>Infinity],['undefined-array',null,()=>undefined]])test(`JSON serialization collision cannot authenticate ${name}`,()=>{
 const cache=new VerifiedRecordCache(),v=verifier(),row=record('root',{nested:[validValue]});cache.read(row,context,v.verify);const collision=structuredClone(row);collision.payload.nested[0]=invalidValue();assert.equal(JSON.stringify(collision.payload),JSON.stringify(row.payload));assert.throws(()=>cache.read(collision,context,v.verify));
});
test('undefined object members, nonplain objects and custom toJSON cannot exploit a prior JSON body',()=>{
 const cache=new VerifiedRecordCache(),v=verifier(),row=record();cache.read(row,context,v.verify);
 const undefinedField=structuredClone(row);undefinedField.payload.extra=undefined;assert.equal(JSON.stringify(undefinedField.payload),JSON.stringify(row.payload));assert.throws(()=>cache.read(undefinedField,context,v.verify));
 const custom={...row,payload:Object.assign(Object.create({inherited:true}),row.payload)};assert.equal(JSON.stringify(custom.payload),JSON.stringify(row.payload));assert.throws(()=>cache.read(custom,context,v.verify));
 const customJSON={...row,payload:{...row.payload,toJSON(){return row.payload;}}};assert.equal(JSON.stringify(customJSON.payload),JSON.stringify(row.payload));assert.throws(()=>cache.read(customJSON,context,v.verify));
});
test('scope/schema context and record key are part of validation identity',()=>{
 const cache=new VerifiedRecordCache(),a=verifier(),b=verifier('B'),row=record();cache.read(row,context,a.verify);
 assert.throws(()=>cache.read(structuredClone(row),'scope-B/native-root/v1',b.verify),/invalid-schema/);assert.equal(b.calls(),1);
 cache.read({...structuredClone(row),key:'other-root'},context,a.verify);assert.equal(a.calls(),2);
 cache.read(structuredClone(row),'scope-A/new-schema/v2',a.verify);assert.equal(a.calls(),3);
});
test('mutating returned payload cannot poison cached evidence or authorize an altered object',()=>{
 const cache=new VerifiedRecordCache(),v=verifier(),row=record(),pristine=structuredClone(row);const returned=cache.read(row,context,v.verify);returned.value='mutated';
 assert.throws(()=>cache.read(row,context,v.verify),/corrupt/);const copy=structuredClone(pristine);assert.equal(cache.read(copy,context,v.verify),copy.payload);assert.equal(copy.payload.value,'original');assert.equal(v.calls(),2);
});
test('entry LRU promotes hits and evicts the least recently read record',()=>{
 const cache=new VerifiedRecordCache({maxEntries:2,maxChars:8192}),v=verifier(),a=record('a'),b=record('b'),c=record('c');cache.read(a,context,v.verify);cache.read(b,context,v.verify);cache.read(structuredClone(a),context,v.verify);cache.read(c,context,v.verify);assert.equal(v.calls(),3);cache.read(b,context,v.verify);assert.equal(v.calls(),4);
});
test('oversized bodies still verify every read and never enter the cache',()=>{
 const cache=new VerifiedRecordCache({maxEntries:2,maxChars:64}),v=verifier(),row=record('large',{value:'x'.repeat(512)});cache.read(row,context,v.verify);cache.read(structuredClone(row),context,v.verify);assert.equal(v.calls(),2);
});
test('aggregate character budget evicts old strings even below maxEntries',()=>{
 const cache=new VerifiedRecordCache({maxEntries:10,maxChars:8192}),v=verifier(),a=record('a',{value:'a'.repeat(5000)}),b=record('b',{value:'b'.repeat(5000)});cache.read(a,context,v.verify);cache.read(b,context,v.verify);cache.read(structuredClone(b),context,v.verify);assert.equal(v.calls(),2);cache.read(a,context,v.verify);assert.equal(v.calls(),3);
});

test('sparse array holes cannot hit an explicitly null JSON array body',()=>{
 const cache=new VerifiedRecordCache(),v=verifier(),row=record('root',{nested:[null]});cache.read(row,context,v.verify);const hole=structuredClone(row);delete hole.payload.nested[0];assert.equal(JSON.stringify(hole.payload),JSON.stringify(row.payload));assert.throws(()=>cache.read(hole,context,v.verify));
});

test('self-deleting toJSON is never invoked and cannot leave unverified contents after a cache hit',()=>{
 const cache=new VerifiedRecordCache(),v=verifier(),row=record();cache.read(row,context,v.verify);let invoked=false;
 const changed={...row,payload:{...row.payload,toJSON(){invoked=true;delete this.toJSON;this.value='unverified mutation';return row.payload;}}};
 assert.throws(()=>cache.read(changed,context,v.verify));assert.equal(invoked,false);assert.equal(changed.payload.value,'original');assert.equal(typeof changed.payload.toJSON,'function');
});
test('array custom iterator cannot serialize altered indexed values as a previously verified array',()=>{
 const cache=new VerifiedRecordCache(),v=verifier(),row=record('root',{nested:['safe']});cache.read(row,context,v.verify);const changed=structuredClone(row);changed.payload.nested[0]='altered';let invoked=false;
 changed.payload.nested[Symbol.iterator]=function*(){invoked=true;yield 'safe';};
 assert.throws(()=>cache.read(changed,context,v.verify));assert.equal(invoked,false,'strict serialization does not invoke user-defined iteration');
});

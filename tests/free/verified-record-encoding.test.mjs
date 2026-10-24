import test from 'node:test';
import assert from 'node:assert/strict';
import {VerifiedRecordCache} from '../../src/data/verified-record-cache.mjs';
import {digest} from '../../src/data/hash.mjs';
function roundTripHit(payload){
 const cache=new VerifiedRecordCache(),row={key:'record',payload,checksum:digest(payload)},copy={key:row.key,payload:JSON.parse(JSON.stringify(payload)),checksum:row.checksum};let calls=0;
 const verify=(value,envelope)=>{calls++;assert.equal(digest(value),envelope.checksum);};
 assert.equal(cache.read(row,'scope/schema-v1',verify),row.payload);assert.equal(cache.read(copy,'scope/schema-v1',verify),copy.payload);assert.equal(calls,1,'JSON-roundtrip equivalent values with the same key order must reuse validation');assert.equal(digest(copy.payload),row.checksum);
}
function exactJSONBudget(payload){
 const size=JSON.stringify(payload).length,row={key:'record',payload,checksum:digest(payload)};
 for(const maxChars of [size,size-1]){
  const cache=new VerifiedRecordCache({maxEntries:1,maxChars});let calls=0;
  const verify=(value,envelope)=>{calls++;assert.equal(digest(value),envelope.checksum);};
  cache.read(row,'scope',verify);cache.read({...row,payload:JSON.parse(JSON.stringify(payload))},'scope',verify);
  assert.equal(calls,maxChars===size?1:2,`cache boundary must equal JSON.stringify length ${size}`);
 }
}
const numbers=[0,-0,1,-1,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,Number.EPSILON,-Number.EPSILON,1e-7,1e-6,1e20,1e21,1.2345678901234567e-200,1.2345678901234567e200];
for(const value of numbers)test(`finite numeric encoding parity: ${Object.is(value,-0)?'-0':value}`,()=>roundTripHit({number:value,nested:[value,{number:value}]}));
for(const value of numbers)test(`scalar numeric JSON budget parity: ${Object.is(value,-0)?'-0':value}`,()=>exactJSONBudget(value));
test('escaped Unicode keys and nested values use exactly the JSON code-unit budget',()=>{
 exactJSONBudget({'"\\\n汉😀\ud800':[null,true,false,'\u0000\u2028\udfff',numbers,{deep:[{},[],{negativeZero:-0}]}]});
});
test('escaped keys, full Unicode, lone surrogates and nested arrays survive JSON-roundtrip cache hits',()=>{
 const values=['','"','\\','\b\f\n\r\t','\u0000\u001f','汉字😀é','\u2028\u2029','\ud800','\udfff','A\ud800B\udfffC'];
 const payload=Object.create(null);for(const value of values)payload[value]=[value,{[value]:value},null,true,false,[],{}];payload.numbers=numbers;payload['0']='numeric-key-zero';payload['10']='numeric-key-ten';payload['2']='numeric-key-two';roundTripHit(payload);
});
test('null/booleans and deeply mixed scalar structure preserve exact wire encoding',()=>roundTripHit({first:null,second:true,third:false,nested:[{},[],[null,false,0,-0,Number.MIN_VALUE],{empty:'',arr:[{a:1},[2,3]]}]}));
test('same bytes with another checksum must verify and reject; another context must independently verify',()=>{
 const cache=new VerifiedRecordCache(),row={key:'record',payload:{number:Number.MIN_VALUE},checksum:digest({number:Number.MIN_VALUE})};let calls=0;
 const verify=(payload,record)=>{calls++;if(digest(payload)!==record.checksum)throw Error('checksum-mismatch');};
 cache.read(row,'scope-A/schema1',verify);assert.throws(()=>cache.read({...row,checksum:'f'.repeat(64)},'scope-A/schema1',verify),/checksum-mismatch/);assert.equal(calls,2);
 cache.read(structuredClone(row),'scope-B/schema1',verify);assert.equal(calls,3);cache.read(structuredClone(row),'scope-B/schema1',verify);assert.equal(calls,3);
});
test('different insertion order is a safe verification miss even with identical canonical checksum',()=>{
 const cache=new VerifiedRecordCache(),a={key:'record',payload:{z:1,a:2},checksum:digest({z:1,a:2})},b={...a,payload:{a:2,z:1}};let calls=0;
 const verify=(payload,row)=>{calls++;assert.equal(digest(payload),row.checksum);};cache.read(a,'scope',verify);cache.read(b,'scope',verify);assert.equal(calls,2);
});
for(const value of [NaN,Infinity,-Infinity])test(`nonfinite ${value} cannot collide with a warmed null body`,()=>{
 const cache=new VerifiedRecordCache(),row={key:'record',payload:{value:null},checksum:digest({value:null})};let calls=0;const verify=()=>calls++;
 cache.read(row,'scope',verify);assert.throws(()=>cache.read({...row,payload:{value}},'scope',verify),/non-json/);assert.equal(calls,1,'nonfinite rejection occurs before any cached success or schema verification');
});

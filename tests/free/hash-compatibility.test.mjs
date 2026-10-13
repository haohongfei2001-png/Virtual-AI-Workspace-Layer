import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256,stable,digest} from '../../src/data/hash.mjs';
const oracle=value=>createHash('sha256').update(new TextEncoder().encode(value)).digest('hex');
const match=value=>{const actual=sha256(value);assert.equal(actual,oracle(value));assert.match(actual,/^[0-9a-f]{64}$/);};
test('SHA256 matches published empty and abc vectors',()=>{
 assert.equal(sha256(''),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
 assert.equal(sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('padding boundary lengths and multi-block lengths match independent crypto',()=>{
 for(const length of [0,1,2,7,31,32,54,55,56,57,62,63,64,65,66,118,119,120,121,126,127,128,129,255,256,257,511,512,513,1023,1024,4095,4096])match(Array.from({length},(_,i)=>String.fromCharCode(32+i%95)).join(''));
});
test('Chinese astral and unpaired surrogates preserve TextEncoder UTF8 replacement semantics',()=>{
 for(const value of ['中文标题与活动记录','😀🚀𐀀𠮷','\ud800','\udfff','a\ud800b\udcffc','\ud800\ud800\udc00','\u0000\u007f\u0080\u07ff\u0800\uffff','\ufeff','é','e\u0301'])match(value);
 // Padding is based on encoded byte count, including replacement characters.
 for(const length of [55,56,63,64,65,119,120,127,128]){match('a'.repeat(length-3)+'中');match('a'.repeat(length-4)+'😀');match('a'.repeat(length-3)+'\ud800');}
});
test('large ASCII and mixed Unicode payloads match crypto and sequential calls do not share state',()=>{
 const values=['a'.repeat(1024*1024),'中文😀\ud800'.repeat(12000),'first','second','first'];for(const value of values)match(value);
});
test('supported TextEncoder input coercions and thrown conversions remain unchanged',()=>{
 for(const value of [undefined,null,true,false,0,-0,42,-7.25,NaN,Infinity,-Infinity,123n,[],['a','中'],new String('wrapped'),{toString:()=> 'coerced中文'}])match(value);
 assert.equal(sha256(undefined),sha256(''));
 let reads=0;const value={toString(){reads++;return 'once';}};assert.equal(sha256(value),oracle('once'));assert.equal(reads,1);
 assert.throws(()=>sha256(Symbol('unsupported')),TypeError);
 const failure=Error('conversion failed');assert.throws(()=>sha256({toString(){throw failure;}}),error=>error===failure);
});
test('deterministic pseudo-random UTF16 and varied block lengths match crypto',()=>{
 let seed=0x12345678;const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
 for(let sample=0;sample<180;sample++){const length=sample<130?sample:next()%6000;let value='';for(let i=0;i<length;i++)value+=String.fromCharCode(next()&0xffff);match(value);}
});
test('stable key ordering and digest remain byte-compatible including sparse-array legacy semantics',()=>{
 const a={z:[-0,true,null,'中'],a:{'10':'ten','2':'two',b:2,a:1}},b={a:{a:1,b:2,'2':'two','10':'ten'},z:[0,true,null,'中']};
 const encoded='{"a":{"10":"ten","2":"two","a":1,"b":2},"z":[0,true,null,"中"]}';
 assert.equal(stable(a),encoded);assert.equal(stable(b),encoded);assert.equal(digest(a),oracle(encoded));assert.equal(digest(a),digest(b));
 const plain=Object.create(null);plain.b=2;plain.a=1;assert.equal(digest(plain),oracle('{"a":1,"b":2}'));
 const holes=new Array(3);holes[1]='x';assert.equal(stable(holes),'[,"x",]');assert.equal(digest(holes),oracle('[,"x",]'));
});
test('stable and digest retain non-JSON rejection and do not invoke toJSON hooks',()=>{
 for(const value of [undefined,()=>{},Symbol('x'),1n,NaN,Infinity,-Infinity,{a:undefined},{a:1n},[undefined]])for(const fn of [stable,digest])assert.throws(()=>fn(value),/non-json-value/);
 for(const value of [new Date(),new Map(),new Set(),new Uint8Array([1]),Object.create({custom:true})])for(const fn of [stable,digest])assert.throws(()=>fn(value),/non-json-object/);
 let called=0;const hooked={toJSON(){called++;return 'replacement';}};assert.throws(()=>digest(hooked),/non-json-value/);assert.equal(called,0);
});

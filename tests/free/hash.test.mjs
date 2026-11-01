import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256,digest,stable} from '../../src/data/hash.mjs';
const standard=text=>createHash('sha256').update(text,'utf8').digest('hex');
function parity(text){const actual=sha256(text);assert.match(actual,/^[0-9a-f]{64}$/);assert.equal(actual,standard(text));}
for(const [name,text,expected] of [
 ['empty','','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
 ['abc','abc','ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
 ['two-block standard','abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq','248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
 ['million a','a'.repeat(1000000),'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0']
])test(`SHA-256 fixed vector ${name}`,()=>{assert.equal(sha256(text),expected);assert.equal(standard(text),expected);});
for(const bytes of [1,2,7,31,32,54,55,56,57,62,63,64,65,66,119,120,127,128,129,255,256,257,511,512,513,1023,1024,1025,4095,4096,4097])test(`SHA-256 ASCII padding/block boundary ${bytes} bytes`,()=>parity('0123456789abcdef'.repeat(Math.ceil(bytes/16)).slice(0,bytes)));
test('SHA-256 UTF8 multibyte padding boundaries agree with crypto',()=>{
 for(const bytes of [55,56,63,64,65,119,120,127,128,129])for(const prefix of ['é','汉','😀','\ud800']){
  const text=prefix+'a'.repeat(bytes-Buffer.byteLength(prefix));assert.equal(Buffer.byteLength(text),bytes);parity(text);
 }
});
test('SHA-256 Unicode normalization, control chars and lone UTF16 surrogates preserve native UTF8 behavior',()=>{
 for(const text of ['汉字😀é','e\u0301','é','\u0000\u0001\u007f\u0080\uffff','\u2028\u2029','\ud800','\udfff','\ud800a\udfff','\ud800\ud800\udfff','\udfff\ud800','A\ud800B\udfffC','"\\\n\r\t'])parity(text);
 assert.notEqual(sha256('é'),sha256('e\u0301'),'hashing must not normalize text');assert.equal(sha256('\ud800'),sha256('\ufffd'),'TextEncoder replaces a lone surrogate');
});
test('SHA-256 multi-MiB ASCII and UTF8 inputs retain exact digests',()=>{
 parity('A'.repeat(3*1024*1024+65));parity('汉😀é\u0000'.repeat(262145));
});
test('SHA-256 deterministic pseudorandom UTF16 differential corpus exercises all code-unit classes',()=>{
 let seed=0x7b1d9c31;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
 for(let sample=0;sample<160;sample++){const length=random()%4097,units=Array.from({length},()=>random()&65535);parity(String.fromCharCode(...units));}
});
test('digest retains canonical old object/key/numeric encoding and standard SHA bytes',()=>{
 const value={z:[-0,Number.MIN_VALUE,1e21,true,null,'\ud800'],a:{'汉':'😀','"\\':'\n'}},canonical='{"a":{"\\"\\\\":"\\n","汉":"😀"},"z":[0,5e-324,1e+21,true,null,"\\ud800"]}';
 assert.equal(stable(value),canonical);assert.equal(digest(value),standard(canonical));assert.equal(digest({a:value.a,z:value.z}),digest(value));
 for(const value of [null,false,true,0,-0,Number.MIN_VALUE,Number.MAX_VALUE,[],{},[{},[],[1,2]]])assert.equal(digest(value),standard(stable(value)));
});

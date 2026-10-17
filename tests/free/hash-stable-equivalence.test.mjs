import test from 'node:test';
import assert from 'node:assert/strict';
import {stable} from '../../src/data/hash.mjs';

// Frozen pre-optimization algorithm, intentionally independent of production helpers.
function oldStable(value){
 if(['function','symbol','bigint','undefined'].includes(typeof value))throw Error('non-json-value');
 if(value&&typeof value==='object'&&!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('non-json-object');
 if(Array.isArray(value))return '['+value.map(oldStable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+oldStable(value[k])).join(',')+'}';
 if(value===undefined||(typeof value==='number'&&!Number.isFinite(value)))throw Error('non-json-value');
 return JSON.stringify(value);
}
function outcome(encode,make){const events=[];try{return {value:encode(make(encode,events)),events};}catch(error){return {error:{name:error?.name,message:error?.message},events};}}
function equivalent(make){assert.deepEqual(outcome(stable,make),outcome(oldStable,make));}

test('fixed-seed nested JSON agrees byte-for-byte with original stable algorithm',()=>{
 let seed=0x715a038d;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
 const strings=['','中文','🙂','"\\\n\r\t\b\f','\ud800','\udfff','a\u2028b','__proto__','0','10'];
 function value(depth){const type=Math.floor(random()*(depth?7:4));if(type===0)return null;if(type===1)return random()<.5;if(type===2)return random()<.1?-0:(random()-.5)*1e12;if(type===3)return strings[Math.floor(random()*strings.length)];if(type===4)return Array.from({length:Math.floor(random()*8)},()=>value(depth-1));const result=type===5?{}:Object.create(null);for(let i=0,n=Math.floor(random()*8);i<n;i++)Object.defineProperty(result,strings[Math.floor(random()*strings.length)]+i,{value:value(depth-1),enumerable:true,configurable:true});return result;}
 for(let i=0;i<1500;i++){const input=value(5);assert.equal(stable(input),oldStable(input),'seeded case '+i);}
});

test('long Unicode, escaped keys, lone surrogates and null prototypes preserve exact encoding',()=>{
 const input=Object.create(null);input['中文"\\\n']=('文字🙂\ud800\udfff\n\t"\\').repeat(12000);input.z=[null,-0,1e-300,1e300];input.a=Object.assign(Object.create(null),{nested:'\u0000\u2028\u2029'});assert.equal(stable(input),oldStable(input));
});

for(const name of ['holes','inherited-index','custom-map','subclass-species'])test('array native map semantics remain unchanged: '+name,()=>{
 equivalent((encode,events)=>{
  if(name==='holes'){const a=new Array(8);a[2]='present';a[6]=[,,null];return a;}
  if(name==='inherited-index'){const a=new Array(4),proto=Object.create(Array.prototype);Object.defineProperty(proto,'1',{get(){events.push('inherited:1');return {z:2,a:1};}});Object.setPrototypeOf(a,proto);a[3]=null;return a;}
  if(name==='custom-map'){const a=[1,2];a.map=function(callback){events.push('custom-map');assert.equal(this,a);return {join(separator){events.push('join:'+separator);return callback({z:2,a:1})+'|'+callback('中文');}};};return a;}
  class Mapped extends Array{join(separator){events.push('species-join:'+separator);return super.join(separator);}}
  class Input extends Array{static get [Symbol.species](){events.push('species');return Mapped;}}
  const a=new Input(4);a[1]={b:2,a:1};a[3]='tail';return a;
 });
});

test('object getters reenter safely and preserve sorted evaluation order',()=>{
 equivalent((encode,events)=>{const object={};Object.defineProperty(object,'z',{enumerable:true,get(){events.push('z');return encode({y:'nested',a:[3,2]});}});Object.defineProperty(object,'a',{enumerable:true,get(){events.push('a');return {z:encode([null,'中文']),a:0};}});return object;});
});

test('getter deleting later property keeps the original snapshotted-key failure',()=>{
 equivalent((encode,events)=>{const object={b:2};Object.defineProperty(object,'a',{enumerable:true,get(){events.push('delete-b');delete object.b;return 1;}});return object;});
 assert.throws(()=>stable({get a(){delete this.b;return 1;},b:2}),/non-json-value/);
});

test('getter added key is not retroactively serialized and overwritten later value is current',()=>{
 equivalent((encode,events)=>{const object={z:2};Object.defineProperty(object,'a',{enumerable:true,get(){events.push('change');object.b=3;object.z={changed:true};return 1;}});return object;});
});

for(const source of ['getter','custom-map','species','prototype-trap'])test('original thrown object propagates unchanged from '+source,()=>{
 for(const encode of [stable,oldStable]){
  const sentinel={identity:source};let input;
  if(source==='getter')input={get a(){throw sentinel;}};
  if(source==='custom-map'){input=[];input.map=()=>{throw sentinel;};}
  if(source==='species'){class Broken extends Array{static get [Symbol.species](){throw sentinel;}}input=new Broken(1);}
  if(source==='prototype-trap')input=new Proxy({},{getPrototypeOf(){throw sentinel;}});
  assert.throws(()=>encode(input),error=>error===sentinel);
 }
});

test('unsupported primitive and object kinds preserve original rejection behavior',()=>{
 for(const make of [()=>undefined,()=>Symbol('s'),()=>1n,()=>()=>1,()=>NaN,()=>Infinity,()=>-Infinity,()=>new Date(0),()=>new Number(1),()=>new Map(),()=>({nested:undefined}),()=>[undefined]])equivalent(make);
});

import {stable,sha256} from '/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer/src/data/hash.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
function candidate(value){
 if(['function','symbol','bigint','undefined'].includes(typeof value))throw Error('non-json-value');
 if(value&&typeof value==='object'&&!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('non-json-object');
 if(Array.isArray(value)){let result='[';const length=value.length;for(let i=0;i<length;i++){if(i)result+=',';if(i in value)result+=candidate(value[i]);}return result+']';}
 if(value&&typeof value==='object'){let result='{',separator='';for(const key of Object.keys(value).sort()){result+=separator+JSON.stringify(key)+':'+candidate(value[key]);separator=',';}return result+'}';}
 if(value===undefined||(typeof value==='number'&&!Number.isFinite(value)))throw Error('non-json-value');
 return JSON.stringify(value);
}
const sparse=Array(4);sparse[1]='x';sparse[3]=null;
const inherited=Array(3);const proto=Object.create(Array.prototype);proto[1]='inherited';Object.setPrototypeOf(inherited,proto);
let deep='leaf';for(let i=0;i<75;i++)deep={z:i,a:[deep,'字😀']};
const row=i=>({scopeKey:'chatgpt:account:personal',kind:'refs',id:'conversation_'+i,revision:7,row:{id:'conversation_'+i,nativeTitle:'Native title 中文 😀 '+i,nativeUrl:'https://chatgpt.com/c/'+i,availability:'available',sourceId:'source',generation:'one',sourceRevision:7,observedAt:'2026-10-14T00:00:00.000Z',validUntil:'2026-10-15T00:00:00.000Z',nativeAliases:['Previous title']},membership:{id:'conversation_'+i,state:'PROJECT',projectId:'project_'+Math.floor(i/100),sourceId:'source',generation:'one',sourceRevision:7,observedAt:'2026-10-14T00:00:00.000Z',validUntil:'2026-10-15T00:00:00.000Z'}});
const valid=[null,true,false,0,-0,1e-300,Number.MAX_VALUE,Number.MIN_VALUE,Number.MAX_SAFE_INTEGER,'','汉字😀\ud800\udfff\n\"\\',{},[],sparse,inherited,deep,Object.assign(Object.create(null),{b:2,a:1}),{10:'ten',2:'two',a:0},Array(10),row(1)];
let seed=1;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
function generated(depth){if(depth===0)return [null,random(),String(random())+'文😀',false][Math.floor(random()*4)];if(random()<.5)return Array.from({length:Math.floor(random()*7)},()=>generated(depth-1));return Object.fromEntries(Array.from({length:Math.floor(random()*7)},(_,i)=>['key_'+(10-i),generated(depth-1)]));}
for(let i=0;i<500;i++)valid.push(generated(4));
const invalid=[undefined,()=>{},Symbol('s'),1n,NaN,Infinity,-Infinity,new Date(),new Map(),{x:undefined},[undefined],{x:1n}];
for(const value of valid)assert.equal(candidate(value),stable(value));
for(const value of invalid){let a,b;try{stable(value);}catch(e){a=e.message;}try{candidate(value);}catch(e){b=e.message;}assert.ok(a);assert.equal(b,a);}
const rows=Array.from({length:1000},(_,i)=>row(i));
const workloads={nativeDigest:rows,native:rows,nested:valid.slice(-500),manifest:[{projects:Object.fromEntries(Array.from({length:1000},(_,i)=>['p'+i,7])),refs:Object.fromEntries(Array.from({length:10000},(_,i)=>['c'+i,7]))}]};
let sink=0;const samples={};
for(const [name,values] of Object.entries(workloads)){
 const iterations=name==='native'?30:name==='nested'?8:15;
 for(const fn of [stable,candidate])for(let i=0;i<2;i++)for(const value of values)sink+=fn(value).length;
 const times={baseline:[],candidate:[]};
 for(let round=0;round<9;round++)for(const which of round%2?['candidate','baseline']:['baseline','candidate']){
  const encode=which==='baseline'?stable:candidate,fn=name==='nativeDigest'?value=>sha256(encode(value)):encode,start=performance.now();for(let i=0;i<iterations;i++)for(const value of values)sink+=fn(value).length;times[which].push(performance.now()-start);
 }
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];samples[name]={iterations,values:values.length,...times,baselineMedian:median(times.baseline),candidateMedian:median(times.candidate),ratio:median(times.candidate)/median(times.baseline)};
}
const report={evidence:'NODE_CANONICAL_DIAGNOSTIC_NOT_BROWSER_OR_PRODUCT_LATENCY',node:process.version,valid:valid.length,invalid:invalid.length,scope:'plain JSON/native rows plus legacy sparse/inherited array behavior; no production changes',samples,sink};
await writeFile('/private/tmp/free-stable-diagnostic.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

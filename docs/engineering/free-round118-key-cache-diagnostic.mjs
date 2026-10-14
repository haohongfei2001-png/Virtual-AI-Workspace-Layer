import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const path='/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer/src/data/hash.mjs';
const source=await readFile(path,'utf8');
const fields=['scopeKey','kind','id','revision','row','membership','state','projectId','nativeTitle','nativeUrl','nativeName','availability','sourceId','generation','sourceRevision','observedAt','validUntil','nativeAliases','memberCount','format','sources','projects','refs','units','changes','revoked','admission','profileId','profileVersion','evidenceClass','semanticFingerprint','acceptedAt'];
const prefix='const encodedSchemaKeys = new Map('+JSON.stringify(fields.map(key=>[key,JSON.stringify(key)]))+');\n';
assert(source.includes('JSON.stringify(k)'));
const candidateSource=prefix+source.replace('JSON.stringify(k)', '(encodedSchemaKeys.get(k) ?? JSON.stringify(k))');
await writeFile('/private/tmp/free-key-cache-candidate.mjs',candidateSource);
const baseline=await import(path),candidate=await import('/private/tmp/free-key-cache-candidate.mjs');
const inputs=['',null,undefined,true,0,-0,123,1n,'\ud800','\udfff','汉字😀\ud800end','\u0000\uffff\n'];
for(let i=0;i<=260;i++)for(const pattern of ['a','汉','😀','\ud800'])inputs.push(pattern.repeat(i));
for(const length of [4095,4096,65535,65536,1000000])for(const pattern of ['a','汉','😀'])inputs.push(pattern.repeat(length));
let count=0;for(const value of inputs){const bytes=new TextEncoder().encode(value),oracle=createHash('sha256').update(bytes).digest('hex');assert.equal(baseline.sha256(value),oracle);assert.equal(candidate.sha256(value),oracle);count++;}
for(const value of [Symbol('x'),Object.create(null)]){assert.throws(()=>baseline.sha256(value));assert.throws(()=>candidate.sha256(value));}
let nested=0;const reentrant={toString(){assert.equal(candidate.sha256('nested'),baseline.sha256('nested'));nested++;return 'outer😀';}};assert.equal(candidate.sha256(reentrant),baseline.sha256('outer😀'));assert.equal(nested,1);
const rows=Array.from({length:1000},(_,i)=>({scopeKey:'chatgpt:account:personal',kind:'refs',id:'conversation_'+i,revision:7,row:{id:'conversation_'+i,nativeTitle:'Native title 中文 😀 '+i,nativeUrl:'https://chatgpt.com/c/'+i,availability:'available',sourceId:'source',generation:'one',sourceRevision:7,observedAt:'2026-10-14T00:00:00.000Z',validUntil:'2026-10-15T00:00:00.000Z',nativeAliases:['Previous title']},membership:{id:'conversation_'+i,state:'PROJECT',projectId:'project_'+Math.floor(i/100),sourceId:'source',generation:'one',sourceRevision:7,observedAt:'2026-10-14T00:00:00.000Z',validUntil:'2026-10-15T00:00:00.000Z'}}));
for(const row of rows)assert.equal(candidate.digest(row),baseline.digest(row));
const sparse=Array(4);sparse[2]='字😀';let deep='leaf';for(let i=0;i<60;i++)deep={row:[deep],scopeKey:i};
const canonical=[null,true,false,0,-0,Number.MIN_VALUE,Number.MAX_VALUE,'\ud800😀',sparse,deep,{id:1,'未知😀':2,'quote"':3},Object.assign(Object.create(null),{id:'null-prototype'})];
for(const value of canonical)assert.equal(candidate.stable(value),baseline.stable(value));
for(const value of [undefined,Symbol('s'),()=>{},1n,NaN,Infinity,new Date(),{id:undefined},[undefined]]){let a,b;try{baseline.stable(value);}catch(e){a=e.message;}try{candidate.stable(value);}catch(e){b=e.message;}assert.ok(a);assert.equal(b,a);}
let sink=0;const samples={};
for(const mode of ['nativeDigest','nativeEncoded','asciiLarge','unicodeLarge','unknownManifest']){
 const values=mode==='unknownManifest'?[{projects:Object.fromEntries(Array.from({length:1000},(_,i)=>['project_'+i,i+1])),refs:Object.fromEntries(Array.from({length:10000},(_,i)=>['未知😀_'+i,i+1]))}]:mode==='nativeDigest'?rows:mode==='nativeEncoded'?rows.map(baseline.stable):[mode==='asciiLarge'?'a'.repeat(65536):'汉😀'.repeat(22000)];
 for(const value of values)assert.equal(['nativeDigest','unknownManifest'].includes(mode)?candidate.digest(value):candidate.sha256(value),['nativeDigest','unknownManifest'].includes(mode)?baseline.digest(value):baseline.sha256(value));
 const iterations=values.length===1?100:12,times={baseline:[],candidate:[]};
 for(const mod of [baseline,candidate])for(const value of values)sink+=(['nativeDigest','unknownManifest'].includes(mode)?mod.digest(value):mod.sha256(value)).length;
 for(let round=0;round<9;round++)for(const which of round%2?['candidate','baseline']:['baseline','candidate']){const mod=which==='baseline'?baseline:candidate,start=performance.now();for(let i=0;i<iterations;i++)for(const value of values)sink+=(['nativeDigest','unknownManifest'].includes(mode)?mod.digest(value):mod.sha256(value)).length;times[which].push(performance.now()-start);}
 const median=a=>[...a].sort((a,b)=>a-b)[4];samples[mode]={iterations,values:values.length,...times,baselineMedian:median(times.baseline),candidateMedian:median(times.candidate),ratio:median(times.candidate)/median(times.baseline)};
}
const report={evidence:'NODE_MICRO_DIAGNOSTIC_NOT_PRODUCT_LATENCY',node:process.version,sourceHash:createHash('sha256').update(source).digest('hex'),candidateHash:createHash('sha256').update(candidateSource).digest('hex'),oracleCount:count,nativeDigestEquivalence:1000,reentrancy:'PASS',invalid:'PASS',cache:'Fixed '+fields.length+' schema keys only; all unknown keys fall back; no user value or ID cache',samples,sink};
await writeFile('/private/tmp/free-key-cache-diagnostic.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

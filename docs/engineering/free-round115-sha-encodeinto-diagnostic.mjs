import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const path='/Users/hhf/Documents/GitHub/Virtual-AI-Workspace-Layer/src/data/hash.mjs';
const source=await readFile(path,'utf8');
const from=`  const bytes = encoder.encode(text), length = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(length); data.set(bytes); data[bytes.length] = 128;
  const dv = new DataView(data.buffer); dv.setUint32(length-8, Math.floor(bytes.length / 0x20000000)); dv.setUint32(length-4, bytes.length * 8 >>> 0);`;
const to=`  text = text === undefined ? '' : \`\${text}\`;
  const capacity = Math.ceil((3 * text.length + 9) / 64) * 64;
  const data = new Uint8Array(capacity);
  const {read, written} = encoder.encodeInto(text, data);
  if (read !== text.length) throw Error('incomplete-encoding');
  const length = Math.ceil((written + 9) / 64) * 64;
  data[written] = 128;
  const dv = new DataView(data.buffer); dv.setUint32(length-8, Math.floor(written / 0x20000000)); dv.setUint32(length-4, written * 8 >>> 0);`;
assert(source.includes(from));const candidateSource=source.replace(from,to);
await writeFile('/private/tmp/free-sha-encodeinto-candidate.mjs',candidateSource);
const baseline=await import(path),candidate=await import('/private/tmp/free-sha-encodeinto-candidate.mjs');
const inputs=['',null,undefined,true,0,-0,123,1n,'\ud800','\udfff','汉字😀\ud800end','\u0000\uffff\n'];
for(let i=0;i<=260;i++)for(const pattern of ['a','汉','😀','\ud800'])inputs.push(pattern.repeat(i));
for(const length of [4095,4096,65535,65536,1000000])for(const pattern of ['a','汉','😀'])inputs.push(pattern.repeat(length));
let count=0;for(const value of inputs){const bytes=new TextEncoder().encode(value),oracle=createHash('sha256').update(bytes).digest('hex');assert.equal(baseline.sha256(value),oracle);assert.equal(candidate.sha256(value),oracle);count++;}
for(const value of [Symbol('x'),Object.create(null)]){assert.throws(()=>baseline.sha256(value));assert.throws(()=>candidate.sha256(value));}
let nested=0;const reentrant={toString(){assert.equal(candidate.sha256('nested'),baseline.sha256('nested'));nested++;return 'outer😀';}};assert.equal(candidate.sha256(reentrant),baseline.sha256('outer😀'));assert.equal(nested,1);
const rows=Array.from({length:1000},(_,i)=>({scopeKey:'chatgpt:account:personal',kind:'refs',id:'conversation_'+i,revision:7,row:{id:'conversation_'+i,nativeTitle:'Native title 中文 😀 '+i,nativeUrl:'https://chatgpt.com/c/'+i,availability:'available',sourceId:'source',generation:'one',sourceRevision:7,observedAt:'2026-10-14T00:00:00.000Z',validUntil:'2026-10-15T00:00:00.000Z',nativeAliases:['Previous title']},membership:{id:'conversation_'+i,state:'PROJECT',projectId:'project_'+Math.floor(i/100),sourceId:'source',generation:'one',sourceRevision:7,observedAt:'2026-10-14T00:00:00.000Z',validUntil:'2026-10-15T00:00:00.000Z'}}));
for(const row of rows)assert.equal(candidate.digest(row),baseline.digest(row));
let sink=0;const samples={};
for(const mode of ['nativeDigest','nativeEncoded','asciiLarge','unicodeLarge']){
 const values=mode==='nativeDigest'?rows:mode==='nativeEncoded'?rows.map(baseline.stable):[mode==='asciiLarge'?'a'.repeat(65536):'汉😀'.repeat(22000)];
 const iterations=values.length===1?100:12,times={baseline:[],candidate:[]};
 for(const mod of [baseline,candidate])for(const value of values)sink+=(mode==='nativeDigest'?mod.digest(value):mod.sha256(value)).length;
 for(let round=0;round<9;round++)for(const which of round%2?['candidate','baseline']:['baseline','candidate']){const mod=which==='baseline'?baseline:candidate,start=performance.now();for(let i=0;i<iterations;i++)for(const value of values)sink+=(mode==='nativeDigest'?mod.digest(value):mod.sha256(value)).length;times[which].push(performance.now()-start);}
 const median=a=>[...a].sort((a,b)=>a-b)[4];samples[mode]={iterations,values:values.length,...times,baselineMedian:median(times.baseline),candidateMedian:median(times.candidate),ratio:median(times.candidate)/median(times.baseline)};
}
const report={evidence:'NODE_MICRO_DIAGNOSTIC_NOT_PRODUCT_LATENCY',node:process.version,sourceHash:createHash('sha256').update(source).digest('hex'),candidateHash:createHash('sha256').update(candidateSource).digest('hex'),oracleCount:count,nativeDigestEquivalence:1000,reentrancy:'PASS',invalid:'PASS',allocation:'Per call 3*UTF16 upper bound padded; SHA processes actual written block count',samples,sink};
await writeFile('/private/tmp/free-sha-encodeinto-diagnostic.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

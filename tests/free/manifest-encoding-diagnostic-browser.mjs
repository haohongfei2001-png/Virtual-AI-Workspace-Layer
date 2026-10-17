/** Fixed baseline and memory-only candidate; isolated compute, not product acceptance. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const baselineCommit='315db11',path='src/data/partitioned.mjs',source=execFileSync('git',['show',`${baselineCommit}:${path}`],{encoding:'utf8'}),hash=s=>createHash('sha256').update(s).digest('hex'),runtimeBeforeHash=hash(await readFile(path));
const encoder=`function encodeManifestContainers(value){
 let encoded='',units=0;const active=new Set(),stack=[];
 const append=text=>{units+=text.length;if(units>16*1024*1024)throw Error('state-too-large');encoded+=text;};
 const emit=v=>{const type=typeof v;if(['function','symbol','bigint','undefined'].includes(type)||type==='number'&&!Number.isFinite(v))throw Error('non-json-value');
  if(v&&type==='object'){const array=Array.isArray(v);if(!array&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('non-json-object');if(active.has(v))throw Error('non-json-value');active.add(v);const keys=array?null:Object.keys(v).sort();stack.push({value:v,array,keys,index:0,length:array?v.length:keys.length});append(array?'[':'{');}else append(JSON.stringify(v));};
 emit(value);while(stack.length){const f=stack[stack.length-1];if(f.index===f.length){append(f.array?']':'}');active.delete(f.value);stack.pop();continue;}const i=f.index++,key=f.array?i:f.keys[i];if(i)append(',');if(!f.array)append(JSON.stringify(key)+':');if(f.array&&!Object.hasOwn(f.value,key))continue;emit(f.value[key]);}return encoded;
}`;
const target='const encoded=finish(manifestSize(payload,true));';assert(source.includes(target));
const candidate=source.replace(target,'const encoded=encodeManifestContainers(payload);')+'\n'+encoder+'\nexport const diagnosticEncode=encodeManifestContainers;';
const baseline=source+'\nexport const diagnosticEncode=value=>finish(manifestSize(value,true));';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();for(const [name,body] of [['baseline',baseline],['candidate',candidate]])await page.route(`**/src/data/manifest-encoding-${name}.mjs`,route=>route.fulfill({status:200,contentType:'text/javascript',body}));await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 const result=await page.evaluate(async()=>{
  const baseline=await import('/src/data/manifest-encoding-baseline.mjs'),candidate=await import('/src/data/manifest-encoding-candidate.mjs'),modules={baseline,candidate},checks=[];
  const equal=(a,b,message)=>{if(a!==b)throw Error(message);};
  const outcome=(encode,value)=>{try{return {value:encode(value)};}catch(e){return {error:e.message};}};
  function compare(name,value){equal(JSON.stringify(outcome(baseline.diagnosticEncode,value)),JSON.stringify(outcome(candidate.diagnosticEncode,value)),name);checks.push(name);}
  compare('unicode-escapes-keys',{'10':'你好\ud800','2':'"\\\n',z:-0,a:null});compare('null-prototype',Object.assign(Object.create(null),{b:2,a:1}));compare('sparse-array',[,1,,]);const shared={x:1};compare('shared-not-cycle',[shared,shared]);const cyclic={};cyclic.self=cyclic;compare('cycle',cyclic);
  for(const [name,value] of [['undefined',undefined],['NaN',NaN],['Infinity',Infinity],['bigint',1n],['function',()=>1],['symbol',Symbol()],['date',new Date()],['toJSON',{toJSON(){return 1;}}]])compare(name,value);
  const iterable=[1,2];iterable[Symbol.iterator]=function*(){yield 99;};compare('array-custom-iterator-ignored',iterable);
  compare('exact-16Mi-codeunits','界'.repeat(16*1024*1024-2));compare('over-16Mi-codeunits','界'.repeat(16*1024*1024-1));
  const scope='["synthetic_fixture","A","test_org"]',manifest={format:'vaiwl-partitioned-v1',generation:'gen',scopeKey:scope,revision:1,channel:'none',sources:{},workspaces:{},preferences:{},refVersions:Object.fromEntries(Array.from({length:100000},(_,i)=>['R'+i,1])),humanRefs:[],units:0,changes:[]};
  const next={revision:2,channel:'none',sources:{},workspaces:{},preferences:{},refs:{},events:{},coverage:{},identities:{},placements:{}},storage={manifest,pieces:new Map()};
  function run(module){let saved;const tx={objectStore:()=>({put:record=>saved=record})};new module.PartitionedState({}).saveMutation(tx,storage,null,next,[],'evidence');return saved;}
  const a=run(baseline),b=run(candidate);equal(JSON.stringify(a),JSON.stringify(b),'complete-root-payload-checksum-equivalence');checks.push('complete-root-payload-checksum-equivalence');
  for(let i=0;i<2;i++){run(baseline);run(candidate);}const timings=[];
  for(let round=0;round<6;round++)for(const variant of round%2?['candidate','baseline']:['baseline','candidate']){const start=performance.now(),record=run(modules[variant]),elapsedMs=performance.now()-start;equal(record.checksum,a.checksum,'timed-checksum');timings.push({round,variant,elapsedMs});}
  return {checks,refs:100000,timings,rootChecksum:a.checksum};
 });
 const runtimeAfterHash=hash(await readFile(path));assert.equal(runtimeBeforeHash,runtimeAfterHash);const report={evidence:'ISOLATED_HEADLESS_MANIFEST_ENCODING_DIAGNOSTIC_NOT_PRODUCT_ACCEPTANCE',baselineCommit,baseHash:hash(source),candidateHash:hash(candidate),runtimeBeforeHash,runtimeAfterHash,browser:browser.version(),encoder,result};await writeFile(process.argv[2]??'/private/tmp/free-manifest-encoding-diagnostic.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

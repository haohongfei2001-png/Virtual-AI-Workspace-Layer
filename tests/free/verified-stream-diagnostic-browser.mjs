import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const baselineCommit='315db11',path='src/data/verified-record-cache.mjs',source=execFileSync('git',['show',`${baselineCommit}:${path}`],{encoding:'utf8'}),hash=x=>createHash('sha256').update(x).digest('hex'),runtimeBeforeHash=hash(await readFile(path));
const helper=`function streamJSON(value,prior,fields,counts){
 let offset=0,captured=null;
 const append=token=>{if(captured!==null)captured+=token;else if(!prior.startsWith(token,offset))captured=prior.slice(0,offset)+token;offset+=token.length;};
 function visit(value,onKeys=null,fields=null,counts=null){
  if(onKeys&&(value===null||typeof value!=='object'||Array.isArray(value)))onKeys=null;
  const type=typeof value;
  if(type==='number'){if(!Number.isFinite(value))throw Error('non-json-value');append(String(value));return;}
  if(type==='string'||type==='boolean'||value===null){append(JSON.stringify(value));return;}
  if(type!=='object')throw Error('non-json-value');
  if(Array.isArray(value)){append('[');for(let index=0;index<value.length;index++){if(index)append(',');visit(value[index]);}append(']');return;}
  if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('non-json-object');
  append('{');let separator='';const keys=Object.keys(value);if(onKeys)onKeys(keys.length);
  for(const key of keys){const capture=fields?.has(key)?size=>{counts[key]=size;}:null;append(separator+JSON.stringify(key)+':');visit(value[key],capture);separator=',';}append('}');
 }
 visit(value,null,fields,counts);return captured!==null?captured:offset===prior.length?prior:prior.slice(0,offset);
}`;
const original="if(!row||typeof row.key!=='string'||typeof row.checksum!=='string'||typeof context!=='string'||typeof verify!=='function')throw Error('invalid-validation-cache-record');";
assert(source.includes(original));
const candidate=source.replace(original,"let initialKey,initialChecksum;\n  if(!row||typeof (initialKey=row.key)!=='string'||typeof (initialChecksum=row.checksum)!=='string'||typeof context!=='string'||typeof verify!=='function')throw Error('invalid-validation-cache-record');\n  const hint=this.#entries.get(JSON.stringify([context,initialKey]));")
 .replace('const encoded=strictJSON(row.payload,null,fields,counts),key=',"const encoded=hint&&hint.checksum===initialChecksum?streamJSON(row.payload,hint.encoded,fields,counts):strictJSON(row.payload,null,fields,counts),key=")+'\n'+helper;
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();for(const [name,body] of [['baseline',source],['candidate',candidate]])await page.route(`**/src/data/verified-stream-${name}.mjs`,route=>route.fulfill({status:200,contentType:'text/javascript',body}));await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 const result=await page.evaluate(async()=>{
  const modules={baseline:await import('/src/data/verified-stream-baseline.mjs'),candidate:await import('/src/data/verified-stream-candidate.mjs')},checks=[],timings=[];
  function traceCase(Module,mode){const cache=new Module.VerifiedRecordCache(),trace=[];cache.read({key:'A',checksum:'sum',payload:{refs:{one:1,two:2},tail:'same'}},'scope',()=>{});cache.read({key:'B',checksum:'sum',payload:{refs:{one:1,two:2},tail:'same'}},'scope',()=>{});let keyReads=0;const body={};Object.defineProperty(body,'refs',{enumerable:true,get(){trace.push('refs');return {get one(){trace.push('one');return mode==='mismatch'?9:1;},get two(){trace.push('two');return 2;}};}});Object.defineProperty(body,'tail',{enumerable:true,get(){trace.push('tail');return mode==='long'?'same-long':mode==='short'?'s':mode==='non-json'?undefined:'same';}});
   const row={get key(){trace.push('key');return ++keyReads===1||mode!=='key-switch'?'A':'B';},get checksum(){trace.push('checksum');return mode==='checksum-miss'?'different':'sum';},get payload(){trace.push('payload');return body;}};let output;try{const r=cache.readWithCounts(row,'scope',()=>trace.push('verify'),['refs']);output={counts:r.counts};}catch(e){output={error:e.message};}return {trace,output};}
  for(const mode of ['same','mismatch','long','short','non-json','key-switch','checksum-miss']){const a=traceCase(modules.baseline,mode),b=traceCase(modules.candidate,mode);if(JSON.stringify(a)!==JSON.stringify(b))throw Error('access-order-mismatch:'+mode+' '+JSON.stringify({a,b}));checks.push(mode);}
  // Each timed hit still traverses 100k data rows; repeated strings never become identity shortcuts.
  for(const distribution of ['same','mixed','unique','numbersame','numbermixed','numberunique']){const numeric=distribution.startsWith('number'),payload={refs:Object.fromEntries(Array.from({length:100000},(_,i)=>['R'+i,numeric?(distribution==='numbersame'?1:distribution==='numbermixed'?i%1024:i+1):{title:distribution==='same'?'same':distribution==='mixed'?'title'+i%1024:'title'+i,revision:1}]))};const row={key:'root',checksum:'fixed',payload},caches={};for(const variant of ['baseline','candidate']){caches[variant]=new modules[variant].VerifiedRecordCache({maxChars:16*1024*1024});caches[variant].read(row,'scope',()=>{});for(let i=0;i<2;i++)caches[variant].readWithCounts(row,'scope',()=>{throw Error('unexpected-verify');},['refs']);}
   for(let round=0;round<6;round++)for(const variant of round%2?['candidate','baseline']:['baseline','candidate']){const start=performance.now(),r=caches[variant].readWithCounts(row,'scope',()=>{throw Error('warm-hit-missed');},['refs']);timings.push({distribution,round,variant,elapsedMs:performance.now()-start});if(r.counts.refs!==100000||r.payload!==payload)throw Error('bad-warm-result');}
   if(numeric){if(payload.refs.R50000===2)throw Error('tamper-must-change');payload.refs.R50000=2;}else payload.refs.R50000.revision=2;for(const variant of ['baseline','candidate']){let verified=0;caches[variant].read(row,'scope',()=>verified++);if(verified!==1)throw Error('mid-payload-tamper-not-verified');}checks.push(distribution+'-middle-tamper');
  }return {checks,timings};
 });
 const runtimeAfterHash=hash(await readFile(path));assert.equal(runtimeBeforeHash,runtimeAfterHash);await writeFile(process.argv[2]??'/private/tmp/free-verified-stream-diagnostic.json',JSON.stringify({evidence:'ISOLATED_HEADLESS_CACHE_STREAM_DIAGNOSTIC_NOT_PRODUCT_ACCEPTANCE',baselineCommit,baseHash:hash(source),candidateHash:hash(candidate),runtimeBeforeHash,runtimeAfterHash,browser:browser.version(),candidate,result},null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

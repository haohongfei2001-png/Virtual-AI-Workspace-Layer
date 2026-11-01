/** Diagnostic only: frozen baseline and candidate are served in memory, never installed. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const path='src/data/verified-record-cache.mjs',baselineCommit=execFileSync('git',['rev-parse','315db11^{commit}'],{encoding:'utf8'}).trim();
const baseline=execFileSync('git',['show',`${baselineCommit}:${path}`],{encoding:'utf8'}),hash=s=>createHash('sha256').update(s).digest('hex'),runtimeBeforeHash=hash(await readFile(path));
const old="let encoded='{',separator='';const keys=Object.keys(value);if(onKeys)onKeys(keys.length);\n for(const key of keys){const capture=fields?.has(key)?size=>{counts[key]=size;}:null;encoded+=separator+JSON.stringify(key)+':'+strictJSON(value[key],capture);separator=',';}";
const replacement=`let encoded='{',separator='',previousNumber,previousEncoding;const keys=Object.keys(value);if(onKeys)onKeys(keys.length);
 for(const key of keys){
  const capture=fields?.has(key)?size=>{counts[key]=size;}:null;
  const encodedKey=JSON.stringify(key),child=value[key];let encodedChild;
  if(typeof child==='number'){
   if(!Number.isFinite(child))throw Error('non-json-value');
   if(child===previousNumber)encodedChild=previousEncoding;
   else {previousNumber=child;previousEncoding=encodedChild=String(child);}
  }else encodedChild=strictJSON(child,capture);
  encoded+=separator+encodedKey+':'+encodedChild;separator=',';
 }`;
assert.equal(baseline.split(old).length,2,'frozen baseline replacement must be exact');
const candidate=baseline.replace(old,replacement),output=process.argv[2]??'/private/tmp/free-verified-numeric-diagnostic.json';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 for(const [name,source] of [['baseline',baseline],['candidate',candidate]])await page.route(`**/src/data/verified-numeric-${name}.mjs`,route=>route.fulfill({status:200,contentType:'text/javascript',body:source+'\nexport {strictJSON as diagnosticEncode};\n'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 const result=await page.evaluate(async()=>{
  const modules={baseline:await import('/src/data/verified-numeric-baseline.mjs'),candidate:await import('/src/data/verified-numeric-candidate.mjs')},{digest}=await import('/src/data/hash.mjs');
  const equivalence=[],samples=[],assert=(v,message)=>{if(!v)throw Error(message);};
  function outcome(fn){try{return {ok:true,value:fn()};}catch(error){return {ok:false,error:error.message};}}
  function compare(name,factory,fields=null){const observations=[];for(const variant of ['baseline','candidate']){const effects=[],input=factory(effects),counts=Object.create(null),value=outcome(()=>modules[variant].diagnosticEncode(input,null,fields?new Set(fields):null,counts));observations.push({value,counts,effects});}assert(JSON.stringify(observations[0])===JSON.stringify(observations[1]),'encoding/effects-mismatch:'+name);equivalence.push(name);return observations[0];}
  compare('finite-numeric-spellings',()=>({negativeZero:-0,zero:0,tiny:1e-7,small:1e-6,big:1e21,max:Number.MAX_VALUE,min:Number.MIN_VALUE,negative:-1.25,repeated:-1.25,array:[-0,1e21,1e-7]}));
  for(const invalid of [NaN,Infinity,-Infinity])compare('reject:'+String(invalid),()=>({versions:{first:1,bad:invalid,last:1}}));
  compare('nested-number-and-non-number',()=>({versions:{a:1,b:'1',c:true,d:null,e:{v:1},f:[1,1]},empty:{}}),['versions','empty']);
  compare('non-map-count-field',()=>({versions:1}),['versions']);
  compare('getter-once-in-key-order',effects=>{const v={};for(const [key,n] of [['z',1],['a',1],['quote"',2]])Object.defineProperty(v,key,{enumerable:true,get(){effects.push(key);return n;}});return {versions:v};},['versions']);
  compare('getter-mutation-later-field',effects=>{const v={};Object.defineProperty(v,'first',{enumerable:true,get(){effects.push('first');v.later=2;return 1;}});v.later=1;return {versions:v};});
  compare('throwing-getter-order',effects=>{const v={};Object.defineProperty(v,'a',{enumerable:true,get(){effects.push('a');return 1;}});Object.defineProperty(v,'b',{enumerable:true,get(){effects.push('b');throw Error('getter-stop');}});return v;});
  const hooks=compare('no-toJSON-or-iterator-hooks',effects=>({versions:{a:1,toJSON(){effects.push('toJSON');return 1;}},array:{[Symbol.iterator](){effects.push('iterator');return [1][Symbol.iterator]();}}}));assert(hooks.effects.length===0,'serialization-hooks-called');
  compare('array-iterator-not-used',effects=>{const array=[1,1];array[Symbol.iterator]=()=>{effects.push('iterator');throw Error('hook');};return {array};});
  const cacheEffects=[];
  for(const variant of ['baseline','candidate']){
   const effects=[],versions={};for(const key of ['z','a','middle'])Object.defineProperty(versions,key,{enumerable:true,get(){effects.push(key);return 7;}});
   const payload={versions},row={key:'getter-root',checksum:'test-owner-proof',payload},cache=new modules[variant].VerifiedRecordCache();let verifies=0;
   const verify=()=>{verifies++;};assert(cache.read(row,'scope',verify)===payload,'getter-read-identity');
   const result=cache.readWithCounts(row,'scope',verify,['versions']);assert(result.payload===payload&&result.counts.versions===3,'getter-count-result');
   assert(JSON.stringify(effects)===JSON.stringify(['z','a','middle','z','a','middle']),'getter-read-count-order');assert(verifies===1,'getter-warm-hit');cacheEffects.push({effects,verifies,counts:result.counts});
  }
  assert(JSON.stringify(cacheEffects[0])===JSON.stringify(cacheEffects[1]),'cache-effects-mismatch');equivalence.push('actual-cache-getter-once-per-read-and-counts');
  for(const variant of ['baseline','candidate']){
   const Cache=modules[variant].VerifiedRecordCache,cache=new Cache();let verifications=0;
   const verify=(payload,row)=>{verifications++;if(row.checksum!==digest(payload))throw Error('checksum-mismatch');};
   const payload={versions:{a:1,b:1},nested:{number:-0}},row={key:'root',payload,checksum:digest(payload)};
   assert(cache.read(row,'scope',verify)===payload,'payload-identity');const fresh=structuredClone(row);assert(cache.read(fresh,'scope',verify)===fresh.payload,'fresh-payload-identity');assert(verifications===1,'warm-hit-reverified');
   const counts=cache.readWithCounts(structuredClone(row),'scope',verify,['versions']);assert(counts.counts.versions===2,'counts');
   for(const change of ['bytes','checksum']){const altered=structuredClone(row);if(change==='bytes')altered.payload.versions.b=2;else altered.checksum='0'.repeat(64);const result=outcome(()=>cache.read(altered,'scope',verify));assert(!result.ok&&result.error==='checksum-mismatch','tamper-accepted:'+change);}
   const invalid=structuredClone(row);invalid.payload.versions.b=Infinity;assert(!outcome(()=>cache.read(invalid,'scope',verify)).ok,'nonfinite-collision');
   const scalar={key:'scalar',payload:{versions:1},checksum:digest({versions:1})};const absent=outcome(()=>cache.readWithCounts(scalar,'scope',verify,['versions']));assert(!absent.ok&&absent.error==='invalid-cache-count-table','invalid-count-map');
   equivalence.push(variant+':cache-hit-identity-counts-tampering');
  }
  for(const distribution of ['same','mixed','unique']){
   const versions={};for(let i=0;i<100000;i++)versions['ref_'+i]=distribution==='same'?1:distribution==='mixed'?(i%13===0?i+1:1):i+1;
   const payload={scopeKey:'synthetic-scope',versions},row={key:'numeric-root',payload,checksum:digest(payload)},encoded=modules.baseline.diagnosticEncode(payload);
   assert(encoded===modules.candidate.diagnosticEncode(payload),'100k-full-encoding:'+distribution);
   const caches={},verifyCounts={baseline:0,candidate:0};
   for(const variant of ['baseline','candidate']){const verify=(p,r)=>{verifyCounts[variant]++;assert(digest(p)===r.checksum,'benchmark-checksum');};caches[variant]={cache:new modules[variant].VerifiedRecordCache(),verify};caches[variant].cache.read(row,'synthetic-scope',verify);}
   for(const mode of ['read','readWithCounts']){
    const run=variant=>{const {cache,verify}=caches[variant];return mode==='read'?cache.read(row,'synthetic-scope',verify):cache.readWithCounts(row,'synthetic-scope',verify,['versions']);};
    for(let warm=0;warm<3;warm++){run('baseline');run('candidate');}
    for(let round=0;round<8;round++)for(const variant of round%2?['candidate','baseline']:['baseline','candidate']){const began=performance.now(),value=run(variant),elapsedMs=performance.now()-began;assert((mode==='read'?value:value.payload)===payload,'output-identity');if(mode!=='read')assert(value.counts.versions===100000,'lost-count');samples.push({distribution,mode,round,variant,elapsedMs});}
   }
   assert(verifyCounts.baseline===1&&verifyCounts.candidate===1,'benchmark-not-cache-hit');equivalence.push(distribution+':full-encoding-and-cache-results');
  }
  return {rows:100000,equivalence,samples};
 });
 const runtimeAfterHash=hash(await readFile(path));assert.equal(runtimeAfterHash,runtimeBeforeHash,'runtime modified during diagnostic');const report={evidence:'ISOLATED_HEADLESS_VRC_DIAGNOSTIC_NOT_PRODUCT_ACCEPTANCE',browser:browser.version(),baselineCommit,baselineHash:hash(baseline),candidateHash:hash(candidate),runtimeBeforeHash,runtimeAfterHash,baseline,candidate,result};await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,equivalence:result.equivalence,samples:result.samples}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

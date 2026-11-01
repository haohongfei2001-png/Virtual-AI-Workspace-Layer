/** Isolated headless compute diagnostic, not end-to-end acceptance. No runtime edits. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const path='src/data/native-version-index.mjs',baselineCommit='02458611c3f38ca59f15f34d56ded5089c4da71b',baseline=execFileSync('git',['show',`${baselineCommit}:${path}`],{encoding:'utf8'}),hash=s=>createHash('sha256').update(s).digest('hex'),runtimeBeforeHash=hash(await readFile(path));
const start=baseline.indexOf(' for(const kind of kinds){const ordered=[];'),end=baseline.indexOf('\n if(byKey.size!==expected)',start);assert(start>=0&&end>start);
const candidate=baseline.slice(0,start)+` for(const kind of kinds){
 const buckets=Object.keys(root[kind]),count=buckets.reduce((sum,b)=>sum+root[kind][b].count,0),keys=new Array(count),versions=new Array(count);let orderError=false;
 for(const bucket of buckets){expected++;const pointer=root[kind][bucket],physicalKey=nativeIndexKey(root.scopeKey,kind,bucket,pointer.revision),piece=verifyNativeIndexPiece(byKey.get(physicalKey),root,kind,bucket);
 const names=Object.keys(piece.versions);for(let i=0;i<names.length;i++){const ordinal=piece.ordinals[i];if(ordinal>=count||keys[ordinal]!==undefined){orderError=true;continue;}keys[ordinal]=names[i];versions[ordinal]=piece.versions[names[i]];}}
 if(orderError)throw Error('invalid-native-index-order');for(let i=0;i<count;i++){if(keys[i]===undefined)throw Error('invalid-native-index-order');manifest[kind][keys[i]]=versions[i];}}
`+baseline.slice(end);
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();for(const [variant,source] of [['baseline',baseline],['candidate',candidate]])await page.route(`**/src/data/materialize-${variant}.mjs*`,route=>route.fulfill({status:200,contentType:'text/javascript',body:source}));await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 const result=await page.evaluate(async()=>{
 const base=await import('/src/data/materialize-baseline.mjs'),candidate=await import('/src/data/materialize-candidate.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{emptyNativeFacts}=await import('/src/data/native-facts.mjs'),{nativeRecord,NATIVE_PARTITION_FORMAT}=await import('/src/data/native-partitions.mjs'),scope=scopeOf('A'),key=emptyNativeFacts(scope).scopeKey,samples=[],equivalence=[];
 const check=(v,m)=>{if(!v)throw Error(m);},outcome=fn=>{try{return {value:fn()};}catch(e){return {error:e.message};}};
 for(const count of [1000,10000,100000]){
 const refs={};for(let i=0;i<count;i++)refs['R_'+((i*7919)%count)+'_'+i]=1;const input={format:NATIVE_PARTITION_FORMAT,scopeKey:key,revision:1,sources:{},projects:{Z:1,A:1,_:1},refs,units:count*200,changes:[]},built=base.buildNativeVersionIndex(input,scope);
 for(const kind of ['projects','refs'])built.root[kind]=Object.fromEntries(Object.entries(built.root[kind]).reverse());built.records.reverse();
 const expected=JSON.stringify(input);for(const [variant,module] of [['baseline',base],['candidate',candidate]]){const materialized=module.materializeNativeVersionIndex(built.root,scope,built.records);check(JSON.stringify(materialized)===expected,'full-order-output:'+variant+count);}equivalence.push('full-nondictionary-order-shuffled-buckets:'+count);
 // Each cold module has its own empty validation cache. Import/setup is outside timed work.
 for(let round=0;round<4;round++)for(const variant of round%2?['candidate','baseline']:['baseline','candidate']){const module=await import('/src/data/materialize-'+variant+'.mjs?cold='+count+'_'+round),began=performance.now(),value=module.materializeNativeVersionIndex(built.root,scope,built.records),elapsedMs=performance.now()-began;check(JSON.stringify(value)===expected,'cold-output');samples.push({count,phase:'cold',round,variant,elapsedMs});}
 const modules={baseline:base,candidate};for(let warm=0;warm<2;warm++){base.materializeNativeVersionIndex(built.root,scope,built.records);candidate.materializeNativeVersionIndex(built.root,scope,built.records);}
 for(let round=0;round<8;round++)for(const variant of round%2?['candidate','baseline']:['baseline','candidate']){const began=performance.now(),value=modules[variant].materializeNativeVersionIndex(built.root,scope,built.records),elapsedMs=performance.now()-began;check(JSON.stringify(value)===expected,'warm-output');samples.push({count,phase:'warm',round,variant,elapsedMs});}
 if(count===1000)for(const mode of ['duplicate','gap','out-of-bounds','missing-piece','tampered-checksum']){const records=structuredClone(built.records),pieces=records.filter(r=>r.payload.kind==='refs');if(mode==='duplicate')pieces[1].payload.ordinals[0]=pieces[0].payload.ordinals[0];if(mode==='gap')pieces[0].payload.ordinals[0]=count;if(mode==='out-of-bounds')pieces[0].payload.ordinals[0]=100000;if(['duplicate','gap','out-of-bounds'].includes(mode))for(const piece of pieces)Object.assign(piece,nativeRecord(piece.key,piece.payload));if(mode==='missing-piece')records.splice(records.indexOf(pieces[0]),1);if(mode==='tampered-checksum')pieces[0].payload.ordinals[0]=0;const a=outcome(()=>base.materializeNativeVersionIndex(built.root,scope,records)),b=outcome(()=>candidate.materializeNativeVersionIndex(built.root,scope,records));check(a.error&&a.error===b.error,'error-equivalence:'+mode+JSON.stringify([a,b]));equivalence.push(mode+':'+a.error);}
 }
 return {samples,equivalence};
 });const runtimeAfterHash=hash(await readFile(path)),baselineHash=hash(baseline);assert.equal(runtimeAfterHash,runtimeBeforeHash);const output=process.argv[2]??'/private/tmp/free-native-index-materialize-diagnostic.json';await writeFile(output,JSON.stringify({evidence:'ISOLATED_HEADLESS_COMPUTE_DIAGNOSTIC_NOT_PRODUCT_ACCEPTANCE',baselineCommit,baselineHash,candidateHash:hash(candidate),runtimeBeforeHash,runtimeAfterHash,browser:browser.version(),baseline,candidate,...result},null,2));console.log(JSON.stringify({output,...result}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

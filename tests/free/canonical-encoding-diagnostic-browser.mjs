import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const baselineCommit='6e88ce53c51afc22c67ca6aeeda85acdf8d92e2d',path='src/data/hash.mjs';
const baseline=execFileSync('git',['show',`${baselineCommit}:${path}`],{encoding:'utf8'}),hash=x=>createHash('sha256').update(x).digest('hex'),before=hash(await readFile(path));
const old="if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';";
const replacement="if (value && typeof value === 'object') {let encoded='{',separator='';for(const key of Object.keys(value).sort()){encoded+=separator+JSON.stringify(key)+':'+stable(value[key]);separator=',';}return encoded+'}';}";
assert.equal(baseline.split(old).length,2);const candidate=baseline.replace(old,replacement);
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();
for(const [variant,body] of [['baseline',baseline],['candidate',candidate]])await page.route(`**/src/data/canonical-${variant}.mjs`,route=>route.fulfill({status:200,contentType:'text/javascript',body}));
await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
const result=await page.evaluate(async()=>{
 const modules={baseline:await import('/src/data/canonical-baseline.mjs'),candidate:await import('/src/data/canonical-candidate.mjs')},checks=[],timings=[];
 const encode=(module,factory)=>{const effects=[];try{return {encoded:module.stable(factory(effects)),effects};}catch(e){return {error:e.message,effects};}};
 const cases={unicode:()=>({'10':'界😀\ud800','2':'a\n',a:-0,z:[1e-7,1e21,null,true]}),sparse:()=>[,1,,],nullPrototype:()=>Object.assign(Object.create(null),{z:1,a:2}),getter:effects=>{const row={};for(const key of ['z','a','b'])Object.defineProperty(row,key,{enumerable:true,get(){effects.push(key);return key;}});return row;},getterMutation:effects=>{const row={z:1};Object.defineProperty(row,'a',{enumerable:true,get(){effects.push('a');row.z=2;return 0;}});return row;},throwing:effects=>({get a(){effects.push('a');throw Error('getter-failure');},get z(){effects.push('z');return 1;}}),invalid:()=>({a:NaN}),undefined:()=>({a:undefined}),prototype:()=>new Date(),toJSON:()=>({toJSON(){throw Error('must-not-call');}})};
 for(const [name,factory] of Object.entries(cases)){if(JSON.stringify(encode(modules.baseline,factory))!==JSON.stringify(encode(modules.candidate,factory)))throw Error('mismatch:'+name);checks.push(name);}
 for(const distribution of ['same','mixed','unique','rows']){
 const payload={versions:Object.fromEntries(Array.from({length:100000},(_,i)=>['R'+i,distribution==='same'?1:distribution==='mixed'?i%1024:distribution==='unique'?i+1:{version:i+1,title:'原生聊天'+i}]))};
 const expected=modules.baseline.stable(payload);if(modules.candidate.stable(payload)!==expected)throw Error('encoding:'+distribution);if(modules.candidate.digest(payload)!==modules.baseline.digest(payload))throw Error('digest:'+distribution);checks.push(distribution+'-full-bytes-and-digest');
 for(let i=0;i<2;i++){modules.baseline.stable(payload);modules.candidate.stable(payload);}
 for(let round=0;round<8;round++)for(const variant of round%2?['candidate','baseline']:['baseline','candidate']){const start=performance.now(),value=modules[variant].stable(payload),elapsedMs=performance.now()-start;if(value!==expected)throw Error('timed-mismatch');timings.push({distribution,round,variant,elapsedMs});}
 }return {checks,timings};
});assert.equal(hash(await readFile(path)),before);await writeFile(process.argv[2]??'/private/tmp/free-canonical-diagnostic.json',JSON.stringify({evidence:'ISOLATED_HEADLESS_CANONICAL_ENCODING_NOT_PRODUCT_ACCEPTANCE',baselineCommit,baselineHash:hash(baseline),candidateHash:hash(candidate),runtimeHash:before,browser:browser.version(),candidate,result},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

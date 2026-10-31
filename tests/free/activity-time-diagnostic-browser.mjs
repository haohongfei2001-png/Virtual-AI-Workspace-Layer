/** Isolated aggregation compute only; candidate is never written to runtime files. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const path='src/data/free-activity.mjs',baselineCommit='486dacd0e41ba94626aa43cfeffdb6e5f25e619f',source=execFileSync('git',['show',`${baselineCommit}:${path}`],{encoding:'utf8'}),baseHash=createHash('sha256').update(source).digest('hex'),runtimeBeforeHash=createHash('sha256').update(await readFile(path)).digest('hex');
const output=process.argv[2]??'/private/tmp/free-activity-time-diagnostic-fixed-baseline.json';
assert.notEqual(output,'/private/tmp/free-activity-time-diagnostic.json','preserve the original diagnostic report');
const anchor='export function aggregateFreeActivity(snapshot) {';
assert.equal(source.split(anchor).length,2);assert.equal(source.split('instant(d.candidateTime)').length,2);
const candidate=source.replace(anchor,anchor+`\n  const timeCache=new Map();\n  const cachedInstant=value=>{if(typeof value!=='string')return instant(value);if(timeCache.has(value))return timeCache.get(value);const parsed=instant(value);if(timeCache.size<256)timeCache.set(value,parsed);return parsed;};`).replace('instant(d.candidateTime)','cachedInstant(d.candidateTime)');
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.route('**/src/data/activity-time-baseline.mjs',route=>route.fulfill({status:200,contentType:'text/javascript',body:source}));await page.route('**/src/data/activity-time-candidate.mjs',route=>route.fulfill({status:200,contentType:'text/javascript',body:candidate}));await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 const result=await page.evaluate(async()=>{
  const {aggregateFreeActivity:baseline}=await import('/src/data/activity-time-baseline.mjs'),{aggregateFreeActivity:candidate}=await import('/src/data/activity-time-candidate.mjs');
  const functions={baseline,candidate},results=[],equivalence=[];
  function fixture(times,count=times.length){const refs=Array.from({length:count},(_,i)=>({id:'R'+i,scope:'A',membership:i%5===0?'PROJECT':i%5===1?'UNKNOWN':'NONE',activityDecision:{objectKey:'R'+i,basis:'provisional',candidateDay:times[i%times.length]===null?null:20000,candidateTime:times[i%times.length],segment:times[i%times.length]===null?null:1,reason:'unchanged',evidenceRevision:1}}));return {scope:'A',evidenceRevision:1,refs,projects:[{id:'P',scope:'A',members:refs.filter(r=>r.membership==='PROJECT'),membershipComplete:false}],noProject:refs.filter(r=>r.membership==='NONE'),unknown:refs.filter(r=>r.membership==='UNKNOWN')};}
  function compare(name,input){const before=JSON.stringify(input),a=JSON.stringify(baseline(input)),b=JSON.stringify(candidate(input));if(a!==b)throw Error('full-output-mismatch:'+name);if(before!==JSON.stringify(input))throw Error('input-mutated:'+name);equivalence.push(name);}
  const strict=[null,'invalid','2026-02-30T00:00:00Z','2026-10-13T00:00:00Z','2026-10-13T08:00:00+08:00','2026-10-12T20:00:00-04:00','2026-10-13','2026-10-13T00:00:00','2026-10-13T00:00:00.000Z','2026-10-13T24:00:00Z','2026-10-13T00:00:60Z'];
  compare('strict-dates-offsets-invalid-null',fixture(strict,110));
  const stable=fixture(['2026-10-13T00:00:00Z','2026-10-13T08:00:00+08:00',null,'invalid'],32);compare('stable-ties',stable);const a=baseline(stable),b=candidate(stable);for(const kind of ['noProject','unknown'])if(JSON.stringify(a[kind].map(r=>r.id))!==JSON.stringify(b[kind].map(r=>r.id)))throw Error('unstable-tie');
  const unique=Array.from({length:100000},(_,i)=>new Date(Date.UTC(2026,0,1)+i*1000).toISOString());
  const distributions={highRepeat:['2026-10-13T00:00:00Z',null,'invalid'],partialRepeat:unique.slice(0,1024),allUnique:unique};
  compare('capacity-full-then-invalid-null',fixture([...unique.slice(0,256),'invalid','invalid',null],520));
  for(const [distribution,times] of Object.entries(distributions)){
   const input=fixture(times,100000);compare(distribution,input);
   for(let warm=0;warm<2;warm++){baseline(input);candidate(input);}
   for(let round=0;round<6;round++)for(const variant of round%2?['candidate','baseline']:['baseline','candidate']){const began=performance.now(),out=functions[variant](input),elapsedMs=performance.now()-began;if(out.refs.length!==100000)throw Error('lost-refs');results.push({distribution,round,variant,elapsedMs});}
  }
  return {equivalence,rows:100000,cacheCapacity:256,results};
 });
 const runtimeAfterHash=createHash('sha256').update(await readFile(path)).digest('hex');assert.equal(runtimeAfterHash,runtimeBeforeHash);const report={evidence:'ISOLATED_HEADLESS_ACTIVITY_COMPUTE_DIAGNOSTIC_NOT_PRODUCT_ACCEPTANCE',browser:browser.version(),baselineCommit,baseHash,runtimeBeforeHash,runtimeAfterHash,candidateHash:createHash('sha256').update(candidate).digest('hex'),candidate,result};await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({equivalence:result.equivalence,results:result.results}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

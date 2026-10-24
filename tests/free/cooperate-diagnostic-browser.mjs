/** Isolated compute comparison only; in-memory candidate, not product latency evidence. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const candidate=`export async function finishAsync(iterator,guard=()=>true){let step,began=performance.now();do{if(guard()!==true)throw Error('stale-client-response');step=iterator.next();if(!step.done&&performance.now()-began>=4){if(globalThis.scheduler?.postTask)await globalThis.scheduler.postTask(()=>{}, {priority:'user-visible'});else await new Promise(resolve=>setTimeout(resolve,0));began=performance.now();}}while(!step.done);if(guard()!==true)throw Error('stale-client-response');return step.value;}`;
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
try{browser=await chromium.launch({headless:true});
 for(const variant of ['baseline','budget','baseline','budget']){
  const context=await browser.newContext(),page=await context.newPage();if(variant==='budget')await page.route('**/src/data/cooperate.mjs',async route=>{const response=await route.fetch(),source=await response.text();await route.fulfill({response,body:source.slice(0,source.indexOf('export async function finishAsync'))+candidate});});
  await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
  const result=await page.evaluate(async()=>{const {currentIndexAsync}=await import('/src/navigation/current-index.mjs');const snapshot={scope:'A',refs:Array.from({length:100000},(_,i)=>({id:'R'+i,nativeUrl:location.origin+'/hf/A/c/R'+i,nativeTitle:'Title '+i}))};let tasks=0;const post=scheduler.postTask.bind(scheduler);scheduler.postTask=(...args)=>{tasks++;return post(...args);};const start=performance.now(),index=await currentIndexAsync(snapshot,[],()=>true),buildMs=performance.now()-start,buildTasks=tasks;tasks=0;const next={...snapshot,refs:snapshot.refs.map(r=>({...r,nativeTitle:r.nativeTitle+' updated'}))},began=performance.now(),updated=await index.rebindCompatibleAsync(next,[],()=>true);return {buildMs,buildTasks,rebindMs:performance.now()-began,rebindTasks:tasks,latest:updated.byId('R99999').nativeTitle==='Title 99999 updated'};});results.push({variant,...result});await context.close();
 }
 const report={evidence:'ISOLATED_HEADLESS_COMPUTE_CANDIDATE_NOT_PRODUCT_ACCEPTANCE',browser:browser.version(),baseHash:createHash('sha256').update(await readFile('src/data/cooperate.mjs')).digest('hex'),candidate,results};await writeFile('/private/tmp/free-cooperate-diagnostic.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

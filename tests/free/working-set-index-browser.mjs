/** Real DOM renderer; synthetic prepared data, no account or persistence claims. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const files=['src/navigation/navigation.mjs','src/navigation/current-index.mjs','src/navigation/free-view.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);await page.waitForFunction(()=>globalThis.HF);
 const result=await page.evaluate(async()=>{
  const {freeNavigationSnapshot}=await import('/src/navigation/free-view.mjs'),{createNavigation}=await import('/src/navigation/navigation.mjs'),{createAdapter}=await import('/simulator/adapter.mjs');
  const refs=Array.from({length:100000},(_,i)=>({scope:'A',id:i===0?'T0':'r'+i,nativeTitle:'Native '+i,nativeUrl:location.origin+'/hf/A/c/'+(i===0?'T0':i===99998?'r99999':'r'+i),membership:i===99999?'UNKNOWN':'NONE',activityDecision:{segment:i===99999?null:0}}));
  const order=refs.slice(-999).reverse().map(r=>r.id);order.splice(3,0,'missing');
  const raw={viewMode:'free',scope:'A',refs,projects:[],preferences:{workingSet:{value:{refs:order,current:null}}},viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0}},prepared=freeNavigationSnapshot(raw);
  let comparisons=0;prepared.refs.find=function(predicate){return Array.prototype.find.call(this,(r,i,a)=>{comparisons++;return predicate(r,i,a);});};
  const navigation=createNavigation({document,adapter:createAdapter()});navigation.updatePreparedFree(prepared,'2026-10-13T12:00:00Z','UTC');const native=HF.getView(),input=native.input;input.value='unsubmitted working set draft';
  const before=comparisons,start=performance.now();navigation.roots().sidebar.shadow.querySelector('button[aria-label="当前工作集"]').click();const renderMs=performance.now()-start,findComparisons=comparisons-before;
  const content=()=>navigation.roots().workspace.shadow.querySelector('.working-set');
  const links=[...content().querySelectorAll('[data-ref-id]')];
  const checks={order:JSON.stringify(links.map(n=>n.dataset.refId))===JSON.stringify(order.filter(id=>id!=='missing')),duplicateURLIds:links[0].dataset.refId==='r99999'&&links[1].dataset.refId==='r99998',missing:content().querySelector('.failed-ref')?.textContent.includes('missing'),unknown:links[0].textContent.includes('Native 99999')};
  navigation.enterReading();input.focus();const next=freeNavigationSnapshot({...raw,refs:refs.map(r=>r.id==='r99999'?{...r,nativeTitle:'Renamed unknown'}:r)});navigation.updatePreparedFree(next,'2026-10-13T12:00:00Z','UTC');checks.renamed=content().querySelector('[data-ref-id="r99999"]').textContent.includes('Renamed unknown');checks.nativePreserved=navigation.view().mode==='reading'&&HF.getView().input===input&&input.value==='unsubmitted working set draft'&&document.activeElement===input;
  navigation.invalidate();navigation.updatePreparedFree(freeNavigationSnapshot({viewMode:'free',scope:'B',refs:[],projects:[],preferences:{workingSet:{value:{refs:['r99999'],current:null}}}}),'2026-10-13T12:00:00Z','UTC');navigation.roots().sidebar.shadow.querySelector('button[aria-label="当前工作集"]').click();checks.scopeIsolated=!content().querySelector('[data-ref-id]')&&content().querySelector('.failed-ref').textContent.includes('r99999');navigation.stop();return {checks,refs:refs.length,workingSet:order.length,findComparisons,renderMs};
 });
 const report={evidence:'REAL_HEADLESS_DOM_SYNTHETIC_PREPARED_100K_WORKING_SET',measurement:'INSTRUMENTED_RENDER_DIAGNOSTIC_NOT_LATENCY_CERTIFICATION',browser:browser.version(),sourceHashes,...result};await writeFile(process.argv[2]??'/private/tmp/free-working-set-index.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));assert(Object.values(result.checks).every(Boolean));assert.equal(result.findComparisons,0,'working-set render must not rescan all refs for each saved ID');
}finally{await browser?.close();await new Promise(r=>server.close(r));}

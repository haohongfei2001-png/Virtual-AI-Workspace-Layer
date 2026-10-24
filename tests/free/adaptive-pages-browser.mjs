import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const results=[];
try{
 browser=await chromium.launch({headless:true});
 for(const scenario of ['native-page-too-large','free-evidence-page-too-large','single-item']){
  const context=await browser.newContext(),page=await context.newPage();
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);await page.waitForFunction(()=>globalThis.HF);
   await page.getByRole('textbox',{name:'消息输入',exact:true}).fill('缩页时保留原生草稿');
   await page.evaluate(async scenario=>{
    const {createFixtureService}=await import('/simulator/service.mjs'),{startClient}=await import('/simulator/client.mjs');
    const id='adaptive_page_browser',documentId='adaptive_document',trace=[];let expectedRefs=[],expectedProjects=[];
    const service=createFixtureService({indexedDB,extensionId:id,getFrame:async()=>({documentId,documentLifecycle:'active',url:location.href})});
    const client=startClient({subscribe:listener=>service.subscribe(listener),readControls:()=>HF.state,invalidateRemote:()=>service.broker.invalidate({tabId:1}),send:async message=>{
     const result=await service.broker.handle(message,{id,tab:{id:1},frameId:0,documentId,documentLifecycle:'active',url:location.href});
     if(message.type==='B23_FREE_HEADER'&&result.ok){expectedRefs=Object.keys(result.header.manifest.refVersions);expectedProjects=Object.keys(result.header.manifest.projectVersions);}
     if(message.type==='B23_FREE_PAGE'){
      const bytes=new TextEncoder().encode(JSON.stringify(result.page)).byteLength,forced=result.ok&&(scenario==='single-item'||bytes>30000);
      trace.push({ids:message.ids,bytes,forced,omittedRefs:result.page?.omittedRefs??[]});if(forced)return {ok:false,reason:scenario==='single-item'?'native-page-too-large':scenario};
     }
     return result;
    }});
    globalThis.adaptivePages={service,client,trace,expected:()=>({refs:expectedRefs,projects:expectedProjects})};
   },scenario);
   if(scenario==='single-item'){
    await page.waitForFunction(()=>adaptivePages.client.status().reason==='free-single-item-too-large');
    const calls=await page.evaluate(()=>adaptivePages.trace.length);await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>adaptivePages.trace.length),calls);assert.ok(calls<=14);
    assert.equal(await page.locator('[data-vaiwl-owned="connection-status"]').isVisible(),true);
    assert.equal(await page.getByRole('textbox',{name:'消息输入',exact:true}).inputValue(),'缩页时保留原生草稿');results.push({scenario,calls,pass:true,checks:['explicit-single-item-failure','no-retry-loop-after-heartbeat-period','native-draft-retained']});
   }else{
    await page.waitForFunction(()=>adaptivePages.client.status().state==='ACTIVE').catch(async e=>{console.error(JSON.stringify(await page.evaluate(()=>({status:adaptivePages.client.status(),trace:adaptivePages.trace.map(t=>({count:t.ids.projects.length+t.ids.refs.length,bytes:t.bytes,forced:t.forced}))}))));throw e;});
    await page.evaluate(()=>adaptivePages.client.showWorkspace());
    await page.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
    for(let i=0;i<100;i++){const more=page.getByRole('button',{name:'显示更多查找结果',exact:true});if(!await more.count())break;await more.click();}
    const observed=await page.evaluate(()=>{const t=adaptivePages;return {expected:t.expected(),trace:t.trace,visibleRefs:[...t.client.navigation.roots().workspace.shadow.querySelectorAll('.search-results [data-ref-id]')].map(n=>n.dataset.refId)};});
    const omitted=new Set(observed.trace.filter(t=>!t.forced).flatMap(t=>t.omittedRefs));assert.deepEqual([...omitted],['T401']);const expectedVisible=observed.expected.refs.filter(id=>!omitted.has(id));assert.deepEqual([...observed.visibleRefs].sort(),[...expectedVisible].sort());assert.equal(new Set(observed.visibleRefs).size,expectedVisible.length);
    const accepted=observed.trace.filter(t=>!t.forced);assert.deepEqual(accepted.flatMap(t=>t.ids.projects),observed.expected.projects);assert.deepEqual(accepted.flatMap(t=>t.ids.refs),observed.expected.refs);assert.ok(observed.trace.some(t=>t.forced));assert.ok(accepted.length>1);assert.ok(observed.trace.length<=129);
    assert.equal(await page.getByRole('textbox',{name:'消息输入',exact:true}).inputValue(),'缩页时保留原生草稿');results.push({scenario,calls:observed.trace.length,successfulPages:accepted.length,refs:observed.expected.refs.length,reachableRefs:expectedVisible.length,tombstones:[...omitted],projects:observed.expected.projects.length,pass:true,checks:['smaller-byte-budget-splits','all-known-refs-reachable','project-and-ref-order-preserved','no-duplicate-refs','native-draft-retained']});
   }
  }finally{await context.close();}
 }
 const report={evidence:'REAL_BROWSER_INDEXEDDB_DOM_WITH_SIMULATED_PAGE_BYTE_LIMIT',actual16MiBBoundary:'NOT_TESTED_BY_THIS_FIXTURE',fixtureByteBudget:30000,browser:browser.version(),results,fail:0};await writeFile('/private/tmp/free-adaptive-pages-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

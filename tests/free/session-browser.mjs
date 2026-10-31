import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';import assert from 'node:assert/strict';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=page`);await page.waitForFunction(()=>HFextension.status().state==='ACTIVE');await page.evaluate(()=>HFextension.showWorkspace());
 await page.getByRole('button',{name:'较早的30日',exact:true}).click();
 const readView=()=>page.evaluate(async()=>{const {scopeOf}=await import('/simulator/data.mjs');return (await HFextension.service.workspaces.read(scopeOf('A'))).view?.value;});
 await page.waitForTimeout(350);const initial=await readView();assert.equal(initial.segment,1);assert.equal(initial.freeSession.H,30);
 await page.evaluate(async()=>{const {scopeOf}=await import('/simulator/data.mjs'),{initialFreeTimePolicy,setFreeHorizon}=await import('/src/data/free-time-policy.mjs'),scope=scopeOf('A'),{state}=await HFextension.service.workspaces.read(scope);await HFextension.service.workspaces.command(scope,{operationId:'session_external_policy',expectedRevision:state.revision,command:{type:'SET_PREFERENCE',id:'freeTimePolicy',value:setFreeHorizon(initialFreeTimePolicy(),7,0)}});await HFextension.refresh();});
 assert.equal(await page.getByRole('button',{name:'较近的30日',exact:true}).count(),1);
 await page.reload();await page.waitForFunction(()=>HFextension.status().state==='ACTIVE');await page.evaluate(()=>HFextension.showWorkspace());assert.equal(await page.getByRole('button',{name:'较近的30日',exact:true}).count(),1);
 await page.evaluate(()=>HF.control('now','2026-10-12T04:00:00Z'));await page.waitForFunction(()=>HFextension.status().state==='ACTIVE');await page.waitForTimeout(350);
 const held=await readView();assert.equal(held.freeSession.T,initial.freeSession.T);assert.equal(held.segment,1);
 await page.getByRole('button',{name:'较近的30日',exact:true}).click();await page.getByRole('button',{name:'较早的7日',exact:true}).waitFor();await page.waitForTimeout(350);
 const fresh=await readView();assert.equal(fresh.segment,0);assert.equal(fresh.freeSession.H,7);assert.equal(fresh.freeSession.T,initial.freeSession.T+1);
 console.log(JSON.stringify({evidence:'REAL_BROWSER_SYNTHETIC_SESSION',browser:browser.version(),checks:['history-session-freezes-external-policy','reload-restores-frozen-session','midnight-does-not-reinterpret-history','safe-current-entry-updates-date-and-policy'],fail:0}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

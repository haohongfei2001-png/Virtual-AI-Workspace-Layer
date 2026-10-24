import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';import {createServer} from '../../simulator/server.mjs';import assert from 'node:assert/strict';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=page`);await page.waitForFunction(()=>HFextension.status().state==='ACTIVE');
 const setup=await page.evaluate(async()=>{
   const {scopeOf,FIXTURE_NOW}=await import('/simulator/data.mjs'),{createFreeViewSession}=await import('/src/data/free-time-policy.mjs'),scope=scopeOf('A'),service=HFextension.service,facts=await service.native.read(scope),day=createFreeViewSession({now:FIXTURE_NOW,timeZone:'Asia/Shanghai'}).T;
   const projects=Array.from({length:10},(_,i)=>({id:'auto_project_'+i,nativeName:'范围合成项目'+i,memberCount:1,nativeUrl:location.origin+'/hf/A/project/auto_project_'+i,availability:'available'}));
   const refs=projects.map((p,i)=>({id:'auto_ref_'+i,nativeTitle:'范围合成聊天'+i,nativeUrl:location.origin+'/hf/A/c/auto_ref_'+i,availability:'available'}));
   const nativeResult=await service.native.apply(scope,{operationId:'auto_fixture_inventory',expectedRevision:facts.revision,batch:{scopeKey:facts.scopeKey,sourceRevision:facts.sources.native_fixture_v1.sourceRevision+1,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z',
     projects:[...Object.values(facts.projects).map(p=>({id:p.id,nativeName:p.nativeName,nativeUrl:p.nativeUrl,availability:'unavailable'})),...projects],
     refs:[...Object.values(facts.refs).map(r=>({id:r.id,nativeTitle:r.nativeTitle,nativeUrl:r.nativeUrl,availability:'unavailable'})),...refs],
     membership:refs.map((r,i)=>({id:r.id,state:'PROJECT',projectId:projects[i].id})),inventory:{projects:'complete',conversations:'complete',cursor:null}}});
   if(!nativeResult.ok)throw Error(nativeResult.reason);
   let {state}=await service.workspaces.read(scope);
   const ingested=await service.workspaces.ingest(scope,{operationId:'auto_fixture_activity',expectedRevision:state.revision,batch:{schema:'vaiwl-internal-evidence-v1',refs:[],sources:[],events:refs.map((r,i)=>({id:'auto_event_'+i,sourceId:'fixture_v1',conversationId:r.id,messageId:'auto_message_'+i,branchId:'auto_branch',role:'user',kind:'new-send',sendState:'committed',sentAt:new Date(Date.parse(FIXTURE_NOW)-(i<2?10:45)*86400000).toISOString(),precision:'second',observedAt:FIXTURE_NOW})),coverage:refs.map((r,i)=>({id:'auto_coverage_'+i,sourceId:'fixture_v1',conversationId:r.id,from:'2024-01-01T00:00:00Z',through:FIXTURE_NOW,observedAt:FIXTURE_NOW,completeness:'complete',branches:'all',gaps:[]}))}});
   if(!ingested.ok)throw Error(ingested.reason);({state}=await service.workspaces.read(scope));
   const policy={mode:'auto',H:30,revision:7,lastChangedDay:day-20,lastEvaluatedDay:day-7,recommendation:60,confirmations:1,cooldownUntil:0};
   const result=await service.workspaces.command(scope,{operationId:'auto_fixture_policy',expectedRevision:state.revision,command:{type:'SET_PREFERENCE',id:'freeTimePolicy',value:policy}});if(!result.ok)throw Error(result.reason);await HFextension.refresh();return {day};
 });
 await page.waitForFunction(()=>HFextension.status().state==='ACTIVE');await page.evaluate(()=>HFextension.showWorkspace());
 await page.locator('[data-vaiwl-owned="auto-range-notice"]').waitFor();
 const policy=()=>page.evaluate(async()=>{const {scopeOf}=await import('/simulator/data.mjs');return (await HFextension.service.workspaces.read(scopeOf('A'))).state.preferences.freeTimePolicy.value;});
 assert.equal((await policy()).H,60);await page.locator('[data-vaiwl-owned="auto-range-notice"]').getByRole('button',{name:'撤销',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('[data-vaiwl-owned="auto-range-notice"]'));const restored=await policy();assert.equal(restored.H,30);assert.equal(restored.mode,'fixed');assert.equal(restored.cooldownUntil,setup.day+14);
 console.log(JSON.stringify({evidence:'REAL_BROWSER_SYNTHETIC_AUTO_POLICY',browser:browser.version(),checks:['complete-native-inventory-only','two-confirmation-auto-60','transient-undo-control','undo-fixed30-and14day-cooldown'],fail:0}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

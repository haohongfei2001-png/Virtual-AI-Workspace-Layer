import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';import {createServer} from '../../simulator/server.mjs';import assert from 'node:assert/strict';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=page`);await page.waitForFunction(()=>HFextension.status().state==='ACTIVE');
 const old=await page.evaluate(async()=>{const {scopeOf,FIXTURE_NOW}=await import('/simulator/data.mjs'),scope=scopeOf('A'),service=HFextension.service,facts=await service.native.read(scope),ref=facts.refs.T0,project=facts.projects[facts.membership.T0.projectId];
  const {state}=await service.workspaces.read(scope);const pro=await service.workspaces.command(scope,{operationId:'alias_pro_overlay',expectedRevision:state.revision,command:{type:'SET_TITLE',refId:'T0',title:'Pro别名隔离反例',locked:true}});if(!pro.ok)throw Error(pro.reason);
  const result=await service.native.apply(scope,{operationId:'alias_native_rename',expectedRevision:facts.revision,batch:{scopeKey:facts.scopeKey,sourceRevision:facts.sources.native_fixture_v1.sourceRevision+1,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z',projects:project?[{id:project.id,nativeName:'更新后的原生项目名',nativeUrl:project.nativeUrl,availability:'available'}]:[],refs:[{id:ref.id,nativeTitle:'更新后的原生聊天名',nativeUrl:ref.nativeUrl,availability:'available'}],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}}});if(!result.ok)throw Error(result.reason);await HFextension.refresh();return {title:ref.nativeTitle,project:project?.nativeName};});
 await page.waitForFunction(()=>HFextension.status().state==='ACTIVE');await page.evaluate(()=>HFextension.showWorkspace());await page.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();const search=page.getByRole('searchbox',{name:'已知聊天查找输入'});
 await search.fill(old.title);assert.equal(await page.locator('.search-results a[data-ref-id="T0"]').count(),1);
 if(old.project){await search.fill(old.project);assert.equal(await page.locator('.search-results a[data-ref-id="T0"]').count(),1);}
 await search.fill('更新后的原生聊天名');assert.equal(await page.locator('.search-results a[data-ref-id="T0"]').count(),1);
 await search.fill('Pro别名隔离反例');assert.equal(await page.locator('.search-results a[data-ref-id="T0"]').count(),0);
 console.log(JSON.stringify({evidence:'REAL_BROWSER_SYNTHETIC_NATIVE_ALIASES',browser:browser.version(),checks:['trusted-rename-retains-prior-native-title','trusted-project-alias-reaches-members','current-native-title-search','pro-derived-title-excluded'],fail:0}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

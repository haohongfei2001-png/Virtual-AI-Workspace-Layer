import {readUi10Geometry,inspectUi10Search} from './ui10-interaction-readiness.mjs';
import {assertUi10ReadingReturn} from './ui10-dom-contract.mjs';
/** Actual controls only. Reconstructed from task-visible history; not full v2.7. */
import assert from 'node:assert/strict';
export const UI10_H_POLICIES=Object.freeze(['7','14','30','60','90','auto']);
export const UI10_INTERACTION_VIEWS=Object.freeze(['home','sidebar-closed','sidebar-open','H-settings','working-set','snippets','search','reading-unique-return']);
export function assertUi10InteractionCoverage(r){assert.equal(r.views.length,8);assert.deepEqual([...new Set(r.views.map(x=>x.view))].sort(),[...UI10_INTERACTION_VIEWS].sort());assert(r.views.every(x=>x.status==='PASS'&&x.continuity===true));assert.deepEqual(r.hPolicies,UI10_H_POLICIES);for(const k of ['searchFocusRestored','uniqueReadingReturn','nativeActionsUnchanged'])assert.equal(r[k],true);assert.equal(r.fullV27Acceptance,'NOT_ESTABLISHED');return true;}
export async function exerciseUi10Interactions({page,frames,workspace,continuity,capture,nativeActions}){
 const actionsBefore=structuredClone(nativeActions()),r={kind:'ACTUAL_MV3_CONTROL_INTERACTION_SUBMATRIX',views:[],hPolicies:[],fullV27Acceptance:'NOT_ESTABLISHED',coverageLimits:['search matrix waits for initial owner result; early-input race is a separate regression','empty assets only; populated mutations not accepted','approved baseline comparison not performed','physical input and real ChatGPT not run']};
 async function record(view,detail={}){await continuity();r.views.push({view,status:'PASS',continuity:true,...detail,screenshot:await capture(view)});}
 const geometry=readUi10Geometry;
 const button=(name)=>frames.workspace.getByRole('button',{name,exact:true});
 await record('home',{geometry:await geometry(frames.workspace.locator('.workspace'))});
 for(const [view,visible]of [['sidebar-closed',false],['sidebar-open',true]]){await frames.sidebar.getByRole('button',{name:'折叠主题导航',exact:true}).click();assert.equal(await frames.sidebar.locator('.themes').isVisible(),visible);await record(view);}
 if(await button('工作空间设置').getAttribute('aria-expanded')!=='true')await button('工作空间设置').click();
 const select=()=>frames.workspace.getByRole('combobox',{name:'工作空间时间范围',exact:true});assert.deepEqual(await select().locator('option').evaluateAll(ns=>ns.map(n=>n.value)),['auto','7','14','30','60','90']);
 async function committed(value){await frames.workspace.waitForFunction(value=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot,n=root?.querySelector('select[aria-label="工作空间时间范围"]');return n?.value===value&&n.getAttribute('aria-disabled')==='false'&&!root.textContent.includes('时间范围更新失败');},value,{timeout:6000});}
 for(const value of UI10_H_POLICIES){await select().selectOption(value);await committed(value);r.hPolicies.push(value);await continuity();}
 await record('H-settings',{geometry:await geometry(frames.workspace.getByRole('region',{name:'工作空间设置',exact:true}))});await select().selectOption('30');await committed('30');await button('关闭设置').click();
 await frames.sidebar.getByRole('button',{name:'当前工作集',exact:true}).click();const working=frames.workspace.getByRole('region',{name:'当前工作集',exact:true});await frames.workspace.getByText('当前工作集尚未保存窗口。',{exact:true}).waitFor();await record('working-set',{geometry:await geometry(working)});await working.getByRole('button',{name:'返回主题视图',exact:true}).click();
 if(await button('工作空间设置').getAttribute('aria-expanded')!=='true')await button('工作空间设置').click();await button('已保存片段').click();const snippets=frames.workspace.getByRole('region',{name:'片段管理',exact:true});await record('snippets',{geometry:await geometry(snippets)});await snippets.getByRole('button',{name:'返回工作空间',exact:true}).click();frames=await workspace();if(await button('工作空间设置').getAttribute('aria-expanded')==='true')await button('关闭设置').click();
 await frames.sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
 // Opening search starts its own initial owner read. Do not type into the
 // pre-commit input that the initial projection is still allowed to replace.
 try{await frames.workspace.waitForFunction(()=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot,input=root?.querySelector('input[aria-label="已知聊天查找输入"]'),results=root?.querySelector('.search-results');return input?.isConnected&&input.value===''&&results&&!results.textContent.includes('正在查找已知记录…');},null,{timeout:6000});
 await frames.workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).fill('UI10 definitely absent query');
 await frames.workspace.getByText('未找到已知记录。可以继续使用原生搜索。',{exact:true}).waitFor({timeout:6000});
 const searchState=await frames.workspace.evaluate(inspectUi10Search);assert.equal(searchState.value,'UI10 definitely absent query');assert.equal(searchState.loading,false);
 }catch(error){try{error.ui10SearchDiagnostics=await frames.workspace.evaluate(inspectUi10Search);}catch{}throw error;}await record('search',{geometry:await geometry(frames.workspace.locator('.search'))});await button('关闭派生查找').focus();await button('关闭派生查找').press('Enter');
 await frames.workspace.waitForFunction(()=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot;return root?.activeElement===root?.querySelector('.workspace')&&document.hasFocus();},null,{timeout:6000});r.searchFocusRestored=true;
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();const back=page.getByRole('button',{name:'返回工作空间',exact:true});await back.waitFor();assertUi10ReadingReturn({count:await back.count(),text:await back.innerText(),label:await back.getAttribute('aria-label')});await record('reading-unique-return');r.uniqueReadingReturn=true;await back.focus();await back.press('Enter');frames=await workspace();await continuity();assert.deepEqual(nativeActions(),actionsBefore);r.nativeActionsUnchanged=true;assertUi10InteractionCoverage(r);return r;
}

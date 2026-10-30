import {waitForUi10Snippets} from './ui10-capture-preparation.mjs';
import {installSnippetsQueryProbe} from './snippets-query-probe.mjs';
import {selectUi10Horizon} from './ui10-horizon-commit.mjs';
import {readUi10Geometry,inspectUi10Search} from './ui10-interaction-readiness.mjs';
import {assertUi10ReadingReturn,observeUi10ReadingReturn} from './ui10-dom-contract.mjs';
/** Actual controls only. Reconstructed from task-visible history; not full v2.7. */
import assert from 'node:assert/strict';
export const UI10_H_POLICIES=Object.freeze(['7','14','30','60','90','auto']);
export const UI10_INTERACTION_VIEWS=Object.freeze(['home','sidebar-closed','sidebar-open','H-settings','working-set','snippets','search','reading-unique-return']);
export async function ensureUi10QueryProbe(frame,role,seen){
 if(!frame||seen.has(frame))return;
 // Same-document SPA navigation keeps its probe; a new execution context does
 // not. Never wrap the original transport twice after a history navigation.
 if(!await frame.evaluate(()=>!!globalThis.__vaiwlSnippetQueryProbe))await frame.evaluate(installSnippetsQueryProbe,{role});
 seen.add(frame);
}
/** Click must establish focus itself; keyboard.type cannot refocus a locator. */
export async function typeUi10SearchQuery({page,frame,query}){
 await frame.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).click({timeout:6000});
 const focus=await frame.evaluate(inspectUi10Search);
 assert.equal(focus.present,true);assert.equal(focus.connected,true);assert.equal(focus.focused,true);assert.equal(focus.documentHasFocus,true);
 assert.equal(focus.value,'');assert.equal(focus.loading,false);
 await page.keyboard.type(query);
 return {clickedCurrentInput:true,clickedInputFocused:true,documentHasFocus:true,operation:'ONE_KEYBOARD_TYPE_NO_REFOCUS'};
}
export function assertUi10InteractionCoverage(r){assert(['FORMAL','NATIVE_RETAINED'].includes(r.sidebarMode));const expected=UI10_INTERACTION_VIEWS.filter(v=>r.sidebarMode==='FORMAL'||!v.startsWith('sidebar-'));assert.equal(r.views.length,expected.length);assert.deepEqual([...new Set(r.views.map(x=>x.view))].sort(),[...expected].sort());assert(r.views.every(x=>x.status==='PASS'&&x.continuity===true));assert.deepEqual(r.hPolicies,UI10_H_POLICIES);for(const k of ['searchFocusRestored','uniqueReadingReturn','nativeActionsUnchanged'])assert.equal(r[k],true);assert.equal(r.fullV27Acceptance,'NOT_ESTABLISHED');return true;}
export async function exerciseUi10Interactions({page,frames,workspace,continuity,capture,nativeActions,diagnosticContext=null}){
 const actionsBefore=structuredClone(nativeActions()),r={kind:'ACTUAL_MV3_CONTROL_INTERACTION_SUBMATRIX',views:[],sidebarMode:frames.sidebar?'FORMAL':'NATIVE_RETAINED',hPolicies:[],fullV27Acceptance:'NOT_ESTABLISHED',coverageLimits:['search matrix waits for initial owner result; early-input race is a separate regression','empty assets only; populated mutations not accepted','approved baseline comparison not performed','physical input and real ChatGPT not run']};
 async function record(view,detail={}){await continuity();r.views.push({view,status:'PASS',continuity:true,...detail,screenshot:await capture(view)});}
 const geometry=readUi10Geometry;
 const button=(name)=>frames.workspace.getByRole('button',{name,exact:true});
 async function openWorkspaceTool(name){if(frames.sidebar)return frames.sidebar.getByRole('button',{name,exact:true}).click();if(await button('工作空间设置').getAttribute('aria-expanded')!=='true')await button('工作空间设置').click();await button(name).click();}
 await record('home',{geometry:await geometry(frames.workspace.locator('.workspace'))});
 for(const [view,visible]of (frames.sidebar?[['sidebar-closed',false],['sidebar-open',true]]:[])){await frames.sidebar.locator('summary[aria-label="项目导航设置"]').click();await frames.sidebar.getByRole('button',{name:visible?'显示项目导航':'隐藏项目导航',exact:true}).click();assert.equal(await frames.sidebar.locator('.themes').isVisible(),visible);await record(view);}
 if(await button('工作空间设置').getAttribute('aria-expanded')!=='true')await button('工作空间设置').click();
 const select=()=>frames.workspace.getByRole('combobox',{name:'工作空间时间范围',exact:true});assert.deepEqual(await select().locator('option').evaluateAll(ns=>ns.map(n=>n.value)),['auto','7','14','30','60','90']);
 for(const value of UI10_H_POLICIES){await selectUi10Horizon(frames.workspace,select,value,r.hPolicies);r.hPolicies.push(value);await continuity();}
 await record('H-settings',{geometry:await geometry(frames.workspace.getByRole('region',{name:'工作空间设置',exact:true}))});await selectUi10Horizon(frames.workspace,select,'30',r.hPolicies);await button('关闭设置').click();
 await openWorkspaceTool('当前工作集');const working=frames.workspace.getByRole('region',{name:'当前工作集',exact:true});await frames.workspace.getByText('当前工作集尚未保存聊天。',{exact:true}).waitFor();await record('working-set',{geometry:await geometry(working)});await working.getByRole('button',{name:'返回工作空间',exact:true}).click();
 if(await button('工作空间设置').getAttribute('aria-expanded')!=='true')await button('工作空间设置').click();await button('已保存片段').click();const snippets=frames.workspace.getByRole('region',{name:'片段管理',exact:true});const snippetsState=await waitForUi10Snippets(frames.workspace);assert.equal(snippetsState.total,0,'this matrix fixture has no saved snippets');await record('snippets',{geometry:await geometry(snippets),snippetsState});await snippets.getByRole('button',{name:'返回工作空间',exact:true}).click();frames=await workspace();if(await button('工作空间设置').getAttribute('aria-expanded')==='true')await button('关闭设置').click();
 await openWorkspaceTool('查找已知项目与聊天');
 const searchProbe=r.searchProbe={kind:'PASSIVE_QUERY_DIAGNOSTIC_NOT_ACCEPTANCE',context:diagnosticContext,operation:'initial-ready',observations:[]};
 async function searchSnapshot(phase){try{return await frames.workspace.evaluate(phase=>({phase,at:performance.timeOrigin+performance.now(),documentHasFocus:document.hasFocus(),visibility:document.visibilityState,probe:globalThis.__vaiwlSnippetQueryProbe?.snapshot(phase)??null}),phase);}catch(error){return {phase,unavailable:true,reason:String(error.message??error).slice(0,200)};}}
 // Opening search starts its own initial owner read. Do not type into the
 // pre-commit input that the initial projection is still allowed to replace.
 try{await frames.workspace.waitForFunction(()=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot,input=root?.querySelector('input[aria-label="已知聊天查找输入"]'),results=root?.querySelector('.search-results');return input?.isConnected&&input.value===''&&results&&!results.textContent.includes('正在查找已知记录…');},null,{timeout:6000});
 searchProbe.observations.push(await searchSnapshot('before-click'));searchProbe.operation='click-and-single-keyboard-type';
 searchProbe.clickedTyping=await typeUi10SearchQuery({page,frame:frames.workspace,query:'UI10 definitely absent query'});
 searchProbe.observations.push(await searchSnapshot('after-typing'));searchProbe.operation='no-result';
 await frames.workspace.getByText('未找到已知记录。可以继续使用原生搜索。',{exact:true}).waitFor({timeout:6000});
 searchProbe.operation='independent-value-assertion';
 const searchState=await frames.workspace.evaluate(inspectUi10Search);assert.equal(searchState.value,'UI10 definitely absent query');assert.equal(searchState.loading,false);
 searchProbe.observations.push(await searchSnapshot('success'));searchProbe.operation='complete';
 }catch(error){try{error.ui10SearchDiagnostics=await frames.workspace.evaluate(inspectUi10Search);}catch{}searchProbe.observations.push(await searchSnapshot('failure'));error.ui10SearchProbe=searchProbe;throw error;}await record('search',{geometry:await geometry(frames.workspace.locator('.search'))});await button('关闭已知查找').focus();await button('关闭已知查找').press('Enter');
 await frames.workspace.waitForFunction(()=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot;return root?.activeElement===root?.querySelector('.workspace')&&document.hasFocus();},null,{timeout:6000});r.searchFocusRestored=true;
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();const back=page.getByRole('button',{name:'返回工作空间',exact:true});await back.waitFor();assertUi10ReadingReturn({count:await back.count(),...await back.evaluate(observeUi10ReadingReturn)});await record('reading-unique-return');r.uniqueReadingReturn=true;await back.focus();await back.press('Enter');frames=await workspace();await continuity();assert.deepEqual(nativeActions(),actionsBefore);r.nativeActionsUnchanged=true;assertUi10InteractionCoverage(r);return r;
}

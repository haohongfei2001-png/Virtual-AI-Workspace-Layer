/** Real navigation DOM cache invalidation; synthetic native host, no account data. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';import {createServer} from '../../simulator/server.mjs';import assert from 'node:assert/strict';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 const checks=await page.evaluate(async()=>{
  const {createNavigation}=await import('/src/navigation/navigation.mjs'),{createAdapter}=await import('/simulator/adapter.mjs');
  const row=(id,projectId,segment)=>({id,scope:'A',nativeTitle:'Native '+id,nativeUrl:location.origin+'/hf/A/c/'+id,membership:'PROJECT',projectId,activityDecision:{basis:'exact',segment,candidateDay:20000-segment*30}});
  const refs=[row('T0','p',0),row('T1','q',1)],snapshot={scope:'A',viewMode:'free',revision:1,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},preferences:{},refs,projects:[{id:'p',scope:'A',nativeName:'Current Project',members:[refs[0]],activityDecision:refs[0].activityDecision},{id:'q',scope:'A',nativeName:'Older Project',members:[refs[1]],activityDecision:refs[1].activityDecision}],noProject:[],unknown:[]};
  const navigation=createNavigation({document,adapter:createAdapter()}),checks=[],check=(value,label)=>{if(!value)throw Error(label);checks.push(label);},panel=()=>navigation.roots().sidebar.shadow.querySelector('section'),click=(shadow,label)=>{const b=[...shadow.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')===label);if(!b)throw Error('missing '+label);b.click();};
  navigation.update(snapshot,'2026-10-13T12:00:00Z','UTC');navigation.showWorkspace();let previous=panel();
  click(navigation.roots().workspace.shadow,'较早的30日');check(panel()===previous&&navigation.view().segment===1,'history-keeps-unchanged-sidebar-DOM');
  click(navigation.roots().workspace.shadow,'较近的30日');check(panel()===previous,'return-keeps-sidebar-DOM');
  click(navigation.roots().sidebar.shadow,'侧栏主题 Current Project');check(panel()!==previous&&panel().querySelector('.theme-toggle').getAttribute('aria-expanded')==='false','disclosure-invalidates-cache');previous=panel();
  click(navigation.roots().sidebar.shadow,'折叠主题导航');check(panel()!==previous&&panel().querySelector('.themes').hidden,'sidebar-visibility-invalidates-cache');
  navigation.update({...snapshot,revision:2,projects:snapshot.projects.map(p=>({...p,nativeName:p.id==='p'?'Renamed Project':p.nativeName}))},'2026-10-13T12:00:00Z','UTC');check(panel().textContent.includes('Renamed Project')&&!panel().textContent.includes('Current Project'),'snapshot-revision-refreshes-native-title');
  previous=panel();history.replaceState({},'',location.pathname.replace('T0','T1'));navigation.showWorkspace();check(panel()!==previous&&panel().querySelector('[aria-current="page"]')?.dataset.refId==='T1','active-native-route-invalidates-cache');
  navigation.update({...snapshot,scope:'B',refs:[],projects:[],noProject:[],unknown:[]},'2026-10-13T12:00:00Z','UTC');check(!panel().textContent.includes('Project')&&!panel().querySelector('[data-ref-id]'),'scope-switch-removes-prior-rows');
  navigation.invalidate();check(!document.querySelector('[data-vaiwl-owned]')&&!document.querySelector('[data-vaiwl-mask]'),'authority-loss-removes-owned-roots');navigation.stop();return checks;
 });assert.equal(checks.length,8);console.log(JSON.stringify({evidence:'UI_SYNTHETIC_SIDEBAR_CACHE',checks,browser:browser.version(),fail:0}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

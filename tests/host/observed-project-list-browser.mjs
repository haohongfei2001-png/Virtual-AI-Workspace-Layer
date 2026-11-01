import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {observedProjectHTML} from './fixtures/observed-project.mjs';
import {observedDesktopHTML} from './fixtures/observed-desktop.mjs';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const baseline=process.env.FREE_PROJECT_BASELINE_REF;
const plugins=baseline?[{name:'saved-baseline',setup(build){build.onLoad({filter:/src\/host\/(native-surface-boundary|surface-discovery|chatgpt-observed-profile|chatgpt-adapter)\.mjs$/},args=>({contents:execFileSync('git',['show',`${baseline}:${args.path.slice(process.cwd().length+1)}`],{encoding:'utf8'}),loader:'js'}));}}]:[];
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {createNativeActions} from './src/host/native-actions.mjs';export {createSurfaceDiscovery} from './src/host/surface-discovery.mjs';export {createURLPolicy} from './src/host/url-policy.mjs';export {CHATGPT_OBSERVED_PROFILE} from './src/host/chatgpt-observed-profile.mjs';",resolveDir:process.cwd()},plugins,bundle:true,write:false,format:'iife',globalName:'observedModule'});
const project='g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',cid='44444444-4444-4444-8444-444444444444';
const projectHTML=`<main data-app-shell-main-surface><div data-app-shell-main-content-layout style="position:static"><div role="main"><h1><button>Native Project</button></h1><div role="tabpanel"><section><ol><li><a href="/g/${project}/c/${cid}"><div><div>Member title</div><div>DO NOT READ PREVIEW</div></div></a><div>Native actions</div></li></ol></section></div></div></div></main>`;
const browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>']}),results=[];
try{
 for(const mode of ['baseline','hidden-old-root','two-visible-roots','two-visible-panels','title-missing','title-hidden','title-complex','title-empty','title-over-limit','changed-title','changed-href','replace-root','leave-project','other-project-stale-list','preview-change','sidebar-conflict','editable-title','editable-panel','fake-member-attribute']){
  const page=await browser.newPage({viewport:{width:1000,height:800}}),url='https://chatgpt.com/g/'+project+'/project';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedDesktopHTML('33333333-3333-4333-8333-333333333333')+projectHTML}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(async({mode,cid})=>{
   const {createSurfaceDiscovery,createURLPolicy,createChatGPTAdapter,CHATGPT_OBSERVED_PROFILE:profile}=observedModule;
   const policy=createURLPolicy({profile:{projectId:({container})=>/^g-p-[a-f0-9]{32}$/.test(container)?container:null}}),binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
   const main=document.querySelector('main[data-app-shell-main-surface]'),panel=main.querySelector('[role="tabpanel"]'),a=panel.querySelector('a'),leaf=a.firstElementChild.firstElementChild,preview=a.firstElementChild.lastElementChild;
   let forbiddenReads=0;
   function guard(node){for(const name of ['textContent','innerText'])Object.defineProperty(node,name,{configurable:true,get(){forbiddenReads++;throw Error('preview-or-whole-row-read')}});}
   guard(a);guard(a.firstElementChild);guard(preview);
   const discovery=createSurfaceDiscovery({document,binding,profile,urlPolicy:policy}),first=discovery.scan(),handle=first.candidates.find(c=>c.target.nativeId===cid)?.target.liveHandle;
   if(mode==='hidden-old-root'||mode==='two-visible-roots'){const clone=main.cloneNode(true);if(mode==='hidden-old-root')clone.hidden=true;main.before(clone);for(const n of clone.querySelectorAll('a, a > div, a > div > div'))guard(n);}
   if(mode==='two-visible-panels')panel.after(panel.cloneNode(true));
   if(mode==='editable-title'){leaf.contentEditable='true';guard(leaf);}
   if(mode==='editable-panel'){panel.contentEditable='true';guard(leaf);}
   if(mode==='fake-member-attribute')panel.setAttribute('undefined',location.pathname.split('/')[2]);
   if(mode==='title-missing')leaf.remove();
   if(mode==='title-hidden')leaf.hidden=true;
   if(mode==='title-complex')leaf.append(document.createElement('span'));
   if(mode==='title-empty')leaf.replaceChildren();
   if(mode==='title-over-limit')leaf.replaceChildren('x'.repeat(201));
   if(mode==='changed-title')leaf.replaceChildren('Renamed title');
   if(mode==='changed-href')a.href='/c/55555555-5555-4555-8555-555555555555';
   if(mode==='replace-root')main.replaceWith(main.cloneNode(true));
   if(mode==='leave-project')history.pushState({},'', '/c/33333333-3333-4333-8333-333333333333');
   if(mode==='other-project-stale-list')history.pushState({},'', '/g/g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/project');
   if(mode==='preview-change')preview.replaceChildren('CHANGED PREVIEW DO NOT READ');
   if(mode==='sidebar-conflict'){const link=document.createElement('a');link.href='/c/'+cid;link.textContent='Conflicting sidebar title';document.querySelector('nav').append(link);}
   const all=discovery.scan(),members=all.candidates.filter(c=>c.evidence.fieldPaths.includes('members'));
   const expected=['two-visible-roots','two-visible-panels','title-missing','title-hidden','title-complex','title-empty','title-over-limit','leave-project','editable-title','editable-panel'].includes(mode)?0:1;
   const shouldKeepHandle=['baseline','hidden-old-root','preview-change','sidebar-conflict','fake-member-attribute'].includes(mode);
   const oldHandleValid=handle?!!discovery.getNode(handle):false;
   const labelsOK=members.every(c=>c.nativeTitle===(mode==='changed-title'?'Renamed title':'Member title'));
   const adapter=createChatGPTAdapter({document,profile,urlPolicy:policy});let emissions=0;
   await adapter.start({binding,phase:'observation',emit:()=>{emissions++;throw Error('preauthorization-emission')}});for(let i=0;i<40;i++)await Promise.resolve();
   const snapshot=adapter.observationStatus();await adapter.stop();const cleared=adapter.observationStatus();discovery.stop();
   return {mode,expected,members:members.length,labelsOK,oldHandleValid,shouldKeepHandle,forbiddenReads,unknownOnly:all.membershipClaims.every(c=>c.asserted==='UNKNOWN'&&c.projectId===null),noProject:all.candidates.every(c=>c.entity!=='project'),noCoverage:all.coverageClaims.length===0,sidebarPreserved:all.candidates.some(c=>c.nativeTitle==='Native A'),conflictPreserved:mode!=='sidebar-conflict'||all.candidates.filter(c=>c.target.nativeId===cid).length===2,preauthNoEmission:emissions===0,preauthCount:snapshot.candidates,expectedPreauth:expected+1,preauthCleared:cleared.candidates===0};
  },{mode,cid}).catch(e=>({mode,error:e.message}));
  result.passed=result.members===result.expected&&result.labelsOK&&result.oldHandleValid===result.shouldKeepHandle&&result.forbiddenReads===0&&result.unknownOnly&&result.noProject&&result.noCoverage&&result.sidebarPreserved&&result.conflictPreserved&&result.preauthNoEmission&&result.preauthCount===result.expectedPreauth&&result.preauthCleared;
  results.push(result);await page.close();
 }
 {
  const page=await browser.newPage({viewport:{width:1000,height:800}}),url='https://chatgpt.com/g/'+project+'/project';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedDesktopHTML('33333333-3333-4333-8333-333333333333')+projectHTML}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  await page.evaluate(async()=>{const {createChatGPTAdapter,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile}=observedModule;globalThis.projectAdapter=createChatGPTAdapter({document,profile,urlPolicy:createURLPolicy({profile:{projectId:({container})=>/^g-p-[a-f0-9]{32}$/.test(container)?container:null}})});await projectAdapter.start({binding:{documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()},phase:'observation'});});
  await page.waitForFunction(()=>projectAdapter.observationStatus().candidates===2,null,{timeout:1000});
  await page.evaluate(()=>document.querySelector('main[data-app-shell-main-surface]').hidden=true);
  await page.waitForFunction(()=>projectAdapter.observationStatus().candidates===1,null,{timeout:1000});
  await page.evaluate(()=>document.querySelector('main[data-app-shell-main-surface]').hidden=false);
  await page.waitForFunction(()=>projectAdapter.observationStatus().candidates===2,null,{timeout:1000});
  await page.evaluate(()=>{const root=document.querySelector('main[data-app-shell-main-surface]');root.after(root.cloneNode(true));});
  await page.waitForFunction(()=>projectAdapter.observationStatus().candidates===1,null,{timeout:1000});
  await page.evaluate(()=>document.querySelectorAll('main[data-app-shell-main-surface]')[1].remove());
  await page.waitForFunction(()=>projectAdapter.observationStatus().candidates===2,null,{timeout:1000});
  await page.evaluate(async()=>{await projectAdapter.stop();delete globalThis.projectAdapter;});
  results.push({mode:'preauthorization-root-hide-show-and-ambiguity',passed:true});await page.close();
 }
 // The same observed layout now proposes positive membership only when its
 // current route, unique panel and an actual Project-qualified row agree.
 for(const mode of ['positive','rename','title-span','title-hidden-span','title-complex-span','stale-route','conflicting-container','no-linked-row','hidden-panel','ambiguous-panel','no-selected-tab']){
  const page=await browser.newPage({viewport:{width:1000,height:800}}),url='https://chatgpt.com/g/'+project+'/project';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedProjectHTML(project,'33333333-3333-4333-8333-333333333333')}):r.abort());await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(({mode,project})=>{
   const {createSurfaceDiscovery,createURLPolicy,CHATGPT_OBSERVED_PROFILE:profile}=observedModule;
   const panel=document.querySelector('#project-panel'),first=panel.querySelector('a'),other=panel.querySelectorAll('a')[1];let reads=0;
   for(const node of panel.querySelectorAll('a,a>div,a>div>div:last-child'))Object.defineProperty(node,'textContent',{get(){reads++;throw Error('preview-read');}});
   if(mode==='rename')document.querySelector('#project-title h1 button').textContent='Renamed Project';
   if(mode.startsWith('title-')&&mode.endsWith('span')){const title=document.querySelector('#project-title h1 button');title.innerHTML='<span>Native Project</span>';if(mode==='title-hidden-span')title.firstChild.hidden=true;if(mode==='title-complex-span')title.firstChild.innerHTML='<span>Native Project</span>';Object.defineProperty(title,'textContent',{get(){reads++;throw Error('whole-heading-read');}});}
   if(mode==='stale-route')history.pushState({},'', '/g/g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/project');
   if(mode==='conflicting-container')other.href='/g/g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/c/55555555-5555-4555-8555-555555555555';
   if(mode==='no-linked-row')first.href='/c/44444444-4444-4444-8444-444444444444';
   if(mode==='hidden-panel')panel.hidden=true;
   if(mode==='ambiguous-panel')panel.after(panel.cloneNode(true));
   if(mode==='no-selected-tab')document.querySelector('#chats-tab').setAttribute('aria-selected','false');
   const d=createSurfaceDiscovery({document,profile,binding:{documentToken:'fixture',routeEpoch:1},urlPolicy:createURLPolicy({profile:{projectId:({container})=>/^g-p-[a-f0-9]{32}$/.test(container)?container:null}})}),result=d.scan();d.stop();
   const claims=result.membershipClaims.filter(c=>c.asserted==='PROJECT'),p=result.candidates.find(c=>c.entity==='project');
   return {positive:claims.length,projects:!!p,title:p?.nativeTitle,ids:claims.map(c=>c.projectId),reads,none:result.membershipClaims.some(c=>c.asserted==='NONE')};
  },{mode,project});
  const positive=['positive','rename','title-span'].includes(mode);assert.equal(result.positive,positive?2:0);assert.equal(result.projects,positive);assert.equal(result.reads,0);assert.equal(result.none,false);if(positive){assert(result.ids.every(p=>p===project));assert.equal(result.title,mode==='rename'?'Renamed Project':'Native Project');}
  results.push({mode:'membership-'+mode,passed:true,...result});await page.close();
 }
 // A page-specific member action must survive an equivalent sidebar entry;
 // uncertainty, draft protection and member ambiguity still fail closed.
 for(const mode of ['equivalent','conflict','duplicate-member','lost-association','changed-panel-relation','draft']){
  const memberId='33333333-3333-4333-8333-333333333333',page=await browser.newPage({viewport:{width:1000,height:800}}),url='https://chatgpt.com/g/'+project+'/project';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:observedProjectHTML(project,memberId)}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(({mode,memberId})=>{
   const {createSurfaceDiscovery,createURLPolicy,createNativeActions,CHATGPT_OBSERVED_PROFILE:profile}=observedModule;
   const panel=document.querySelector('#project-panel'),member=panel.querySelector('a'),sidebar=document.querySelector('nav a[href]');let forbiddenReads=0;
   sidebar.href=member.href;sidebar.textContent=mode==='conflict'?'Conflicting title':'Native A';
   if(mode==='duplicate-member')member.closest('li').after(member.closest('li').cloneNode(true));
   for(const node of panel.querySelectorAll('a,a>div,a>div>div:last-child'))Object.defineProperty(node,'textContent',{get(){forbiddenReads++;throw Error('preview-read');}});
   const policy=createURLPolicy({profile:{projectId:({container})=>/^g-p-[a-f0-9]{32}$/.test(container)?container:null}});
   const discovery=createSurfaceDiscovery({document,profile,binding:{documentToken:'fixture',routeEpoch:1},urlPolicy:policy});
   let page=discovery.scanPage();while(page.cursor)page=discovery.scanPage(page.cursor);
   if(mode==='lost-association')document.querySelector('#chats-tab').setAttribute('aria-selected','false');
   if(mode==='changed-panel-relation')document.querySelector('#chats-tab').setAttribute('aria-controls','another-panel');
   const descriptor={entity:'conversation',nativeId:memberId,navigationURL:member.href};
   const [liveHandle]=discovery.resolveLoadedTargets([descriptor]);
   const actions=createNativeActions({discovery,urlPolicy:policy,currentURL:()=>location.href,inputRisk:()=>({state:'unknown',flags:mode==='draft'?['composer']:[]})});
   const plan=actions.planNavigation({kind:'resolved',...descriptor,liveHandle});
   const result={memberSelected:!!liveHandle&&discovery.getNode(liveHandle)===member,mode:plan.mode,disposition:plan.disposition??null,forbiddenReads};
   discovery.stop();return result;
  },{mode,memberId});
  assert.equal(result.memberSelected,['equivalent','draft'].includes(mode));assert.equal(result.mode,mode==='equivalent'?'native-control':'href');
  if(mode!=='equivalent')assert.equal(result.disposition,'new-tab-preserve-current');assert.equal(result.forbiddenReads,0);
  results.push({mode:'member-action-'+mode,passed:true,...result});await page.close();
 }
 console.log(JSON.stringify({status:results.every(r=>r.passed)?'PASS_WEB_MECHANISM_ONLY':'FAIL',baseline:baseline??null,results}));assert(results.every(r=>r.passed));
}finally{await browser.close();}

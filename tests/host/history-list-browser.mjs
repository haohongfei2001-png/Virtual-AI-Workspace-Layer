import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../extension/tooling/package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export {createHistoryStructureDiagnostic,validHistoryStructureReport,readSidebarStructure,validSidebarStructure} from './src/host/history-structure-diagnostic.mjs';export {createChatGPTAdapter} from './src/host/chatgpt-adapter.mjs';export {LEGACY_SURFACE_PROFILE} from './src/host/surface-discovery.mjs';export {createMountSurface} from './src/navigation/mount-surface.mjs';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'historyModule'});
const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
try{
 if(process.argv.includes('--sidebar-structure-only')){
  const page=await browser.newPage({viewport:{width:1000,height:700}}),url='http://127.0.0.1:9000/';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:`<style>aside{width:240px;height:600px;overflow:auto}nav{width:220px}section{height:80px}</style><aside><nav id="source"><section><button aria-expanded="true" aria-controls="PRIVATE_ID">PRIVATE_PROJECT</button><ul><li><a href="/c/PRIVATE_ID">PRIVATE_TITLE</a><button>PRIVATE_MENU</button></li></ul></section><div data-app-action-sidebar-section><div id="history"><div role="list"><div data-sidebar-chatgpt-conversation-key="PRIVATE_ID"><a href="/c/PRIVATE_ID">PRIVATE_TITLE</a></div><button hidden>PRIVATE_PENDING</button></div></div></div><div contenteditable="true"><span>PRIVATE_BODY</span></div><svg><path d="PRIVATE_PATH"/></svg><div data-va-owned><button>PRIVATE_EXTENSION</button></div></nav></aside><main>PRIVATE_BODY</main>`}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const result=await page.evaluate(()=>{
   const {readSidebarStructure,validSidebarStructure}=historyModule;
   const profile={regions:{projects:'#source'}},before=document.body.innerHTML;
   const original=Element.prototype.getAttribute;
   Element.prototype.getAttribute=function(name){if(!['role','aria-hidden'].includes(name))throw Error('private attribute read');return original.call(this,name);};
   Object.defineProperty(Node.prototype,'textContent',{get(){throw Error('private text read');},configurable:true});
   const report=readSidebarStructure({document,profile});
   const root=report.rows[0],member=report.rows.find(r=>r[2]==='A'),section=report.rows.find(r=>r[4]&2);
   const safe=validSidebarStructure(report)&&report.reason==='complete'&&!JSON.stringify(report).includes('PRIVATE');
   const structure=root[2]==='NAV'&&member[0]>=0&&report.rows[member[0]][2]==='LI'&&section[0]===0&&report.ancestors[0][2]==='ASIDE';
   const excluded=report.rows.some(r=>(r[4]&64)&&r[8])&&report.rows.some(r=>(r[4]&128)&&r[8])&&!report.rows.some(r=>r[2]==='MAIN');
   const geometry=root[6][2]===220&&report.ancestors[0][7]===12&&report.rows.some(r=>r[2]==='BUTTON'&&(r[7]&1));
   const unchanged=before===document.body.innerHTML;
   const native=document.querySelector('#source');for(let i=0;i<300;i++)native.append(document.createElement('div'));
   const capped=readSidebarStructure({document,profile});
   const bounded=validSidebarStructure(capped)&&['capacity','budget'].includes(capped.reason)&&capped.rows.length<=256;
   native.remove();const missing=readSidebarStructure({document,profile});
   return {safe,structure,excluded,geometry,unchanged,bounded,missing:validSidebarStructure(missing)&&missing.reason==='boundary-unavailable'};
  });
  assert(Object.values(result).every(Boolean),JSON.stringify(result));
  console.log(JSON.stringify({status:'PASS_ANONYMOUS_SIDEBAR_SNAPSHOT_ONLY',result}));
 }else if(process.argv.includes('--diagnostic-only')){
  const page=await browser.newPage(),url='https://chatgpt.com/';
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:'<nav id="source"><div id="root"><div role="list"><div role="listitem"><a href="/c/PRIVATE_ID">PRIVATE_TITLE</a></div></div></div></nav>'}):r.abort());
  await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
  const results=await page.evaluate(async()=>{
   const {createHistoryStructureDiagnostic,validHistoryStructureReport}=historyModule,profile={regions:{history:'#source'},nativeHomeLayout:{historyList:'#root'}};
   const list=document.querySelector('[role="list"]'),first=list.firstElementChild;
   const read=Element.prototype.getAttribute;
   Element.prototype.getAttribute=function(name){if(['href','title','data-sidebar-chatgpt-conversation-key'].includes(name))throw Error('private attribute read');return read.call(this,name);};
   Object.defineProperty(Node.prototype,'textContent',{get(){throw Error('private text read');},configurable:true});
   const observe=createHistoryStructureDiagnostic({document,profile,readState:()=> 'layout-history-row-order',durationMs:220});
   const pending=observe();
   await new Promise(r=>setTimeout(r,25));first.setAttribute('data-sidebar-chatgpt-conversation-key','PRIVATE_ID');
   await new Promise(r=>setTimeout(r,25));const gap=document.createElement('button'),last=first.cloneNode(true);list.append(gap,last);
   await new Promise(r=>setTimeout(r,25));list.prepend(last);
   await new Promise(r=>setTimeout(r,25));first.replaceWith(first.cloneNode(true));
   const report=await pending,again=await observe();
   if(!validHistoryStructureReport(report))throw Error('invalid report');
   if(JSON.stringify(report).includes('PRIVATE'))throw Error('leak');
   const zero=report.snapshots[0].rows.every(r=>!r[3]),promoted=report.snapshots.some(s=>s.changes[1]>0&&s.rows[0][3]);
   const gapSeen=report.snapshots.some(s=>s.rows.length===3&&s.rows[0][3]&&!s.rows[1][3]&&s.rows[2][3]);
   const reordered=report.snapshots.some(s=>s.rows[0][0]===report.snapshots.find(s=>s.rows.length===3)?.rows[2][0]);
   const replaced=report.snapshots.at(-1).rows.some(r=>r[3]&&r[0]!==report.snapshots[0].rows[0][0]&&r[0]!==report.snapshots.find(s=>s.rows.length===3)?.rows[2][0]);
   const order=report.operations.filter(o=>o.kind==='children'),sameBatchOrder=order.some((o,i)=>o.removed.length===1&&order[i+1]?.added[0]===o.removed[0]);
   const source=document.querySelector('#source'),boundaryObserve=createHistoryStructureDiagnostic({document,profile,readState:()=> 'layout-history-row-order',durationMs:45}),boundaryPending=boundaryObserve();source.replaceWith(source.cloneNode(true));const boundaryChanged=(await boundaryPending).reason==='boundary-changed';
   const old=JSON.stringify(report);list.append(document.createElement('div'));await new Promise(r=>setTimeout(r,20));
   return {zero,promoted,gapSeen,reordered,replaced,sameBatchOrder,boundaryChanged,once:again===report,detached:JSON.stringify(report)===old,phase:report.snapshots.every(s=>s.phase==='preparation'),complete:report.reason==='complete'&&!report.truncated};
  });
  assert(Object.values(results).every(Boolean),JSON.stringify(results));
  console.log(JSON.stringify({status:'PASS_WEB_MECHANISM_ONLY',diagnostic:results}));
 }else{
 const page=await browser.newPage({viewport:{width:1000,height:700}}),url='https://chatgpt.com/c/33333333-3333-4333-8333-333333333333';
 await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{margin:0}#header{position:fixed;left:220px;top:0;width:780px;height:52px}#slot{width:40px;height:40px}#source{position:fixed;left:0;top:52px;width:200px;height:648px}#heading{height:100px}#list{height:400px}#reading{position:fixed;left:220px;top:60px;width:780px;height:400px}#composer{position:fixed;left:220px;top:500px;width:780px;height:80px}</style><nav id="source"><div id="heading"><button id="search">Native search</button><button id="project-create">Create project</button></div><div id="list" aria-hidden="false"><div data-sidebar-chatgpt-conversation-key="opaque-marker-not-membership" role="listitem"><div data-sidebar-cycle-item role="group"><a href="/c/33333333-3333-4333-8333-333333333333"><span data-thread-title>Native A</span></a><button aria-label="聊天操作" aria-haspopup="menu">…</button><button aria-label="置顶聊天">Pin</button></div></div></div></nav><header id="header"><div id="slot"></div></header><section id="reading"></section><form id="composer"><textarea>fixture draft</textarea></form>`}):r.abort());
 await page.goto(url);await page.addScriptTag({content:outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const {createChatGPTAdapter,LEGACY_SURFACE_PROFILE,createMountSurface}=historyModule,profile={...LEGACY_SURFACE_PROFILE,currentBody:undefined,regions:{...LEGACY_SURFACE_PROFILE.regions,history:'#source'},nativeLayout:{header:'#header',reading:'#reading',composer:'#composer',navigationSlot:'#slot',historyList:'#list'}};
  let surface;const emitted=[],adapter=createChatGPTAdapter({document,profile,isOwnedMask:n=>surface?.isMasked(n)===true});const binding={documentToken:'fixture',producerToken:'fixture',browserDocumentId:'fixture',routeEpoch:1,origin:location.origin,expiresAt:new Date(Date.now()+20000).toISOString()};
  await adapter.start({binding,emit:async p=>{emitted.push(p);return {state:'accepted',localSeq:p.localSeq,receiptId:'fixture'};}});for(let i=0;i<15;i++)await Promise.resolve();
  const first=adapter.inspect();if(!first.ok)throw Error(first.reason);const source=document.querySelector('#source'),list=document.querySelector('#list'),row=list.firstElementChild;
  surface=createMountSurface({document,createFrameURL:({role})=>'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'+role+'.html'});const handle=await surface.mount({binding},first);surface.showWorkspace(handle);
  const initial={separateSource:first.historySource===source&&first.history===list&&first.historyMaskRoots[0]===list,sidebarStartsBelowHeading:first.sidebarRect.y===152,onlyListMasked:getComputedStyle(list).visibility==='hidden'&&getComputedStyle(document.querySelector('#heading')).visibility==='visible',inspectOwnMask:adapter.inspect().ok,discoveryTitle:emitted.some(p=>p.payload?.candidates?.some(c=>c.nativeTitle==='Native A')),onlyUnknownMembership:emitted.every(p=>(p.payload?.membershipClaims??[]).every(c=>c.asserted==='UNKNOWN'&&c.projectId===null))};
  surface.suspend(handle);const variants={};
  const mutate=(name,apply)=>{const undo=apply();variants[name]=!adapter.inspect().ok;undo();};
  mutate('searchInsideList',()=>{const n=document.createElement('button');n.textContent='Search';list.append(n);return()=>n.remove();});
  mutate('searchInsideRow',()=>{const n=document.createElement('button');n.setAttribute('aria-label','Search');row.append(n);return()=>n.remove();});
  mutate('unknownNativeInput',()=>{const n=document.createElement('input');row.append(n);return()=>n.remove();});
  mutate('svgNativeLink',()=>{const n=document.createElementNS('http://www.w3.org/2000/svg','svg');n.innerHTML='<a href="/projects"><path d="M0 0h10v10z"/></a>';row.append(n);return()=>n.remove();});
  mutate('nativeSummary',()=>{const n=document.createElement('details');n.innerHTML='<summary>Native control</summary>';row.append(n);return()=>n.remove();});
  for(const role of ['checkbox','radio','switch','slider','menuitem','group checkbox'])mutate('role-'+role,()=>{const n=document.createElement('div');n.setAttribute('role',role);row.append(n);return()=>n.remove();});
  mutate('overlappingNativeHeading',()=>{list.style.cssText='position:relative;top:-100px';return()=>list.removeAttribute('style');});
  mutate('duplicateConversation',()=>{const n=row.cloneNode(true);list.append(n);return()=>n.remove();});
  mutate('unsupportedLink',()=>{const a=row.querySelector('a'),old=a.getAttribute('href');a.setAttribute('href','/projects');return()=>a.setAttribute('href',old);});
  mutate('nonRowNativeText',()=>{const n=document.createTextNode('Native search heading');list.append(n);return()=>n.remove();});
  mutate('hiddenList',()=>{list.setAttribute('aria-hidden','true');return()=>list.setAttribute('aria-hidden','false');});
  mutate('outsideSource',()=>{list.style.cssText='position:relative;left:30px';return()=>list.removeAttribute('style');});
  mutate('sourceInert',()=>{source.inert=true;return()=>{source.inert=false;};});
  mutate('sourceHidden',()=>{source.setAttribute('aria-hidden','true');return()=>source.removeAttribute('aria-hidden');});
  mutate('ambiguousList',()=>{const n=list.cloneNode(true);source.append(n);return()=>n.remove();});
  const sourceClone=source.cloneNode(false);source.replaceWith(sourceClone);sourceClone.append(list);const sourceIdentityRejected=!adapter.isSameNativeRegions(first);sourceClone.replaceWith(source);source.append(list);
  surface.showWorkspace(handle);const injected=document.createElement('button');injected.textContent='Native new control';list.append(injected);const changed=adapter.inspect(),surrendered=surface.refreshGeometry(handle,changed)===false;
  const closed={invalid:!changed.ok,surrendered,listVisible:getComputedStyle(list).visibility==='visible',searchVisible:getComputedStyle(document.querySelector('#search')).visibility==='visible',draftPreserved:document.querySelector('textarea').value==='fixture draft'};
  surface.dispose(handle);adapter.stop();return {initial,variants,sourceIdentityRejected,closed};
 });
 for(const [group,values]of Object.entries(result))if(typeof values==='object')for(const [key,value]of Object.entries(values))assert.equal(value,true,group+'.'+key);else assert.equal(values,true,group);
 console.log(JSON.stringify({result:'PASS_WEB_MECHANISM_ONLY',checks:result}));
 }
}finally{await browser.close();}

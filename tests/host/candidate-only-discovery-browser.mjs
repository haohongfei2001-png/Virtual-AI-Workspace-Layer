import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),scriptPath=fileURLToPath(import.meta.url),scriptHash=hash(await readFile(scriptPath));
const paths=['src/host/surface-discovery.mjs','src/host/bounded-handle-registry.mjs','src/host/contract.mjs','src/host/url-policy.mjs','src/b1/identity.mjs'];
const sources=new Map(await Promise.all(paths.map(async p=>[p,await readFile(p,'utf8')]))),sourceHashes=Object.fromEntries([...sources].map(([p,s])=>[p,hash(s)]));
const server=await createHostFixtureServer(),report={evidence:'WEB_MECHANISM_ONLY_REAL_HEADLESS_CHROME',scope:'Actual DOM TreeWalker and candidate-only traversal mechanism; not MV3, authenticated production profile, end-to-end 100k performance or latency-budget acceptance',realChatGPT:'NOT_RUN',scriptHash,sourceHashes,results:[],blockedExternal:[]};let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext();await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==server.origin){report.blockedExternal.push(u.origin);return r.abort();}const source=sources.get(u.pathname.slice(1));return source!==undefined?r.fulfill({contentType:'text/javascript',body:source}):r.continue();});
 const page=await context.newPage();await page.goto(server.url);report.externalBlocked=await page.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.externalBlocked);
 report.results=await page.evaluate(async()=>{
  const {createSurfaceDiscovery}=await import('/src/host/surface-discovery.mjs'),{createURLPolicy}=await import('/src/host/url-policy.mjs');
  const projects=document.querySelector('aside section[aria-label="Projects"]'),historyRoot=document.querySelector('aside nav[aria-label="Chat history"]'),reading=document.querySelector('main > #reading');
  const check=(ok,why)=>{if(!ok)throw Error(why);},results=[];
  function anchors(count,prefix){const frag=document.createDocumentFragment();for(let i=0;i<count;i++){const a=document.createElement('a');a.href='/c/'+prefix+i;a.textContent='Native '+prefix+i;frag.append(a);}return frag;}
  projects.replaceChildren();for(let i=0;i<600;i++){const button=document.createElement('button');button.textContent='Candidate '+i;projects.append(button);}const known=document.createElement('a');known.href='/g/known/project';known.textContent='Known Project';projects.append(known);
  historyRoot.replaceChildren(anchors(50000,'h'));reading.replaceChildren();const heading=document.createElement('h2');heading.textContent='Known Project';const members=document.createElement('nav');members.setAttribute('aria-label','Project conversations');members.dataset.projectId='known';members.append(anchors(50000,'m'));reading.append(heading,members);document.querySelector('main > header > h1').textContent='Known Project';history.pushState(null,'','/g/known/project');
  const make=()=>createSurfaceDiscovery({document,binding:{documentToken:'candidate-browser',routeEpoch:1},urlPolicy:createURLPolicy({origin:location.origin,profile:{conversationId:id=>id,projectId:({container})=>container}})});
  const walker=document.createTreeWalker,walked=[],visits=new Map();document.createTreeWalker=function(root,...args){walked.push(root===projects?'projects':root===historyRoot?'history':root===members?'members':'unexpected');const w=walker.call(this,root,...args);return {nextNode(){visits.set(root,(visits.get(root)??0)+1);return w.nextNode();}};};
  try{
   const d=make(),names=[];let cursor=null,pages=0,maxPage=0,lastPage=[];do{const before=visits.get(projects)??0,page=d.scanCandidatePage(cursor);check((visits.get(projects)??0)-before<=259,'candidate-page-walk-unbounded');check(page.payload.candidates.length<=256,'candidate-page-count-unbounded');check(page.payload.membershipClaims.length===0&&page.payload.coverageClaims.length===0,'candidate-only-created-facts');check(page.payload.candidates.every(c=>c.entity==='project'&&c.target.kind==='live-control'),'candidate-only-resolved-or-chat');lastPage=page.payload.candidates.map(c=>c.nativeTitle);names.push(...lastPage);maxPage=Math.max(maxPage,lastPage.length);cursor=page.cursor;check(++pages<10,'candidate-pages-unbounded');}while(cursor);
   check(names.length===600&&names.every((name,i)=>name==='Candidate '+i),'candidate-order-or-tail-missing');check(JSON.stringify(walked)==='["projects"]','general-regions-walked');check((visits.get(historyRoot)??0)===0&&(visits.get(members)??0)===0,'general-regions-inspected');check(d.handleStats().records===600,'general-controls-retained');
   results.push({name:'100k-mixed-loaded-chats-excluded-from-candidate-only-walk-with-600-IDless-projects',status:'PASS',history:50000,members:50000,candidates:600,pages,maxPage,tail:lastPage,walkerRoots:[...walked],visits:{projects:visits.get(projects),history:visits.get(historyRoot)??0,members:visits.get(members)??0},stats:d.handleStats()});d.stop();
   // Ordinary fact projection still receives a confirmed current Project and member-first order.
   historyRoot.replaceChildren(anchors(3,'h'));members.replaceChildren(anchors(3,'m'));walked.length=0;visits.clear();const ordinary=make(),first=ordinary.scanPage();
   check(first.payload.candidates[0]?.target.nativeId==='known','current-project-lost');check(first.payload.candidates.slice(1,4).every((r,i)=>r.target.nativeId==='m'+i),'member-priority-lost');check(first.payload.membershipClaims.filter(c=>c.asserted==='PROJECT'&&c.projectId==='known').length===3,'member-claims-lost');check(walked[0]==='members','ordinary-member-first-walker-lost');
   results.push({name:'ordinary-facts-retain-confirmed-current-project-and-member-first-evidence',status:'PASS',firstTargets:first.payload.candidates.slice(0,4).map(r=>r.target.nativeId),memberClaims:first.payload.membershipClaims.filter(c=>c.asserted==='PROJECT'),walkerRoots:[...walked]});ordinary.stop();
  }finally{document.createTreeWalker=walker;}
  return results;
 });
 report.browserVersion=browser.version();report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await browser?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(paths.map(async p=>hash(await readFile(p))!==sourceHashes[p]))).some(Boolean);report.scriptChangedDuringRun=hash(await readFile(scriptPath))!==scriptHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun){report.status='FAIL';report.error=(report.error??'')+' source-or-script-changed';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/free-candidate-only-discovery-browser.json',JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));

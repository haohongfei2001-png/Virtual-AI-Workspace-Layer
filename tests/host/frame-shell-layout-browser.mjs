import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';

// Real packaged HTML/client/worker/grants. Tall local DOM probes below test only
// shell overflow; they are not recovery, history completeness or native-action acceptance.
const scriptPath=fileURLToPath(import.meta.url),scriptHash=createHash('sha256').update(await readFile(scriptPath)).digest('hex'),mutation=process.env.FRAME_SHELL_MUTATION==='remove-css';
const output=process.argv[2]??'/private/tmp/free-frame-shell-layout-browser.json';
const server=await createHostFixtureServer(),dir=await mkdtemp('/private/tmp/vaiwl-frame-shell-');
const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});
const manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
if(mutation)await writeFile(join(built.unpacked,'extension/frame-shell.css'),'/* deliberate temporary-package layout mutation */');
const report={scriptHash,mutation:mutation?'temporary-package-remove-shell-css':null,evidence:'REAL_HEADLESS_MV3_PACKAGED_HOST_OFFLINE',realChatGPT:'NOT_RUN',sourceHashes:manifest.sourceHashes,results:[],measurements:[],package:built};let context,page;
const frameFor=async role=>{await page.waitForFunction(role=>[...document.querySelectorAll('iframe')].some(n=>n.src.endsWith('/'+role+'.html')),role);const url='/'+role+'.html';const deadline=Date.now()+15000;while(Date.now()<deadline){const f=page.frames().find(f=>f.url().endsWith(url)&&!f.isDetached());if(f&&await f.locator('[data-vaiwl-frame-root]').count())return f;await new Promise(r=>setTimeout(r,50));}throw Error('frame-not-ready:'+role);};
const measure=frame=>frame.evaluate(()=>{const root=document.documentElement,body=document.body,main=document.querySelector('main'),r=main.getBoundingClientRect();return {width:innerWidth,height:innerHeight,document:{clientWidth:root.clientWidth,clientHeight:root.clientHeight,scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight},body:{scrollWidth:body.scrollWidth,scrollHeight:body.scrollHeight},main:{x:r.x,y:r.y,width:r.width,height:r.height},scrollX,scrollY};});
function bounded(m){assert(m.width>0&&m.height>0);assert(m.document.scrollHeight<=m.height+1,JSON.stringify(m));assert(m.document.scrollWidth<=m.width+1,JSON.stringify(m));assert.equal(m.scrollX,0);assert.equal(m.scrollY,0);assert(m.main.height>0&&m.main.y>=-1&&m.main.y+m.main.height<=m.height+1,JSON.stringify(m));}
async function sample(frame,label){const m=await measure(frame);report.measurements.push({label,...m});bounded(m);const element=await frame.frameElement(),outer=await element.evaluate(n=>{const frame=n.getBoundingClientRect(),surface=n.parentElement.getBoundingClientRect(),close=n.previousElementSibling.getBoundingClientRect();return {frame:frame.toJSON(),surface:surface.toJSON(),close:close.toJSON()};});assert(outer.frame.top>=outer.close.bottom-1&&outer.frame.bottom<=outer.surface.bottom+1,JSON.stringify(outer));report.measurements.push({label:label+'-owned-surface',...outer});return m;}
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1280,height:720},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});page=await context.newPage();await page.goto(server.url);
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2||[...document.querySelectorAll('button')].some(n=>n.getAttribute('aria-label')==='返回工作空间'),null,{timeout:15000});
 const initialReturn=page.getByRole('button',{name:'返回工作空间',exact:true});if(await initialReturn.isVisible())await initialReturn.click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,null,{timeout:15000});
 let sidebar=await frameFor('sidebar'),workspace=await frameFor('workspace');await sidebar.locator('.toolbar').first().waitFor();await workspace.locator('.workspace').waitFor();
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id));assert(worker);report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert(report.workerNetworkBlocked);
 for(const [role,frame] of [['sidebar',sidebar],['workspace',workspace]])await sample(frame,role+'-initial');
 report.results.push({name:'packaged-HTML-real-client-and-grant-have-bounded-initial-shells',status:'PASS'});
 // Add native fixture controls without changing its previously inspected geometry.
 await page.evaluate(()=>{const section=document.querySelector('aside section[aria-label="Projects"]'),r=section.getBoundingClientRect();section.style.height=r.height+'px';section.style.flex='0 0 '+r.height+'px';section.style.overflow='auto';section.style.minHeight='0';for(let i=0;i<40;i++){const b=document.createElement('button');b.textContent='Shell candidate '+i;section.append(b);}});
 const returnControl=page.getByRole('button',{name:'返回工作空间',exact:true});if(await returnControl.isVisible())await returnControl.click();
 sidebar=await frameFor('sidebar');workspace=await frameFor('workspace');
 await sidebar.getByText('已观察的待识别项目 1–32 / 41',{exact:true}).waitFor({timeout:15000});
 for(const [role,frame] of [['sidebar',sidebar],['workspace',workspace]]){
  await sample(frame,role+'-candidate-page');
  const sizes=await frame.evaluate(()=>{const c=document.querySelector('[data-vaiwl-candidate-root]'),n=document.querySelector('[data-vaiwl-frame-root]'),list=c.querySelector('[data-vaiwl-candidates]').shadowRoot.querySelector('ul');const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};list.scrollTop=list.scrollHeight;return {candidate:box(c),navigation:box(n),list:{...box(list),clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,scrollTop:list.scrollTop}};});
  assert(sizes.candidate.height>0&&sizes.navigation.height>0);assert(sizes.list.clientHeight>0&&sizes.list.scrollTop>0);report.measurements.push({label:role+'-candidate-scroll',...sizes});
 }
 const toolbar=await sidebar.locator('.toolbar').evaluateAll(nodes=>{return {buttons:nodes.flatMap(n=>[...n.querySelectorAll('button')]).map(b=>{const q=b.getBoundingClientRect();return {label:b.getAttribute('aria-label')??b.textContent,left:q.left,right:q.right,top:q.top,bottom:q.bottom,width:q.width,height:q.height};}),width:innerWidth,viewportHeight:innerHeight};});
 assert(toolbar.buttons.length>=4);for(const b of toolbar.buttons)assert(b.width>0&&b.height>0&&b.left>=-1&&b.right<=toolbar.width+1&&b.top>=-1&&b.bottom<=toolbar.viewportHeight+1,JSON.stringify(b));report.measurements.push({label:'narrow-sidebar-toolbar',...toolbar});
 report.screenshot=output+'.png';await page.screenshot({path:report.screenshot});
 report.results.push({name:'native-fixture-candidate-page-and-sidebar-toolbar-fit-bounded-shell',status:'PASS'});
 // A pure overflow probe in the real sidebar history container: no fake refs or grants.
 const history=await sidebar.locator('.themes').evaluate(n=>{const p=document.createElement('div');p.dataset.shellProbe='history';p.style.height='1800px';p.textContent='LOCAL_LAYOUT_PROBE';n.append(p);n.scrollTop=n.scrollHeight;const r=n.getBoundingClientRect(),result={clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,scrollTop:n.scrollTop,top:r.top,bottom:r.bottom,viewport:innerHeight};p.remove();n.scrollTop=0;return result;});
 assert(history.clientHeight>0&&history.scrollTop>0&&history.bottom<=history.viewport+1);await sample(sidebar,'sidebar-history-overflow-probe');report.measurements.push({label:'history-overflow',...history});report.results.push({name:'history-container-scrolls-without-document-scroll',status:'PASS',evidence:'MECHANISM_ONLY_LOCAL_TALL_DOM_PROBE'});
 for(const [label,attribute] of [['本地数据恢复','data-vaiwl-frame-recovery'],['备份与导入','data-vaiwl-frame-backup'],['已保存片段','data-vaiwl-frame-snippets']]){
  await workspace.getByRole('button',{name:'工作空间设置',exact:true}).click();await workspace.getByRole('button',{name:label,exact:true}).click();const panel=workspace.locator('['+attribute+']');await panel.waitFor();await panel.getByRole('button',{name:'返回工作空间',exact:true}).waitFor({timeout:15000});
  const before=await sample(workspace,label+'-opened');const probe=await panel.evaluate(n=>{const empty=document.querySelector('[data-vaiwl-frame-root]');const p=document.createElement('div');p.dataset.shellProbe='auxiliary';p.style.height='1800px';p.textContent='LOCAL_LAYOUT_PROBE';n.insertBefore(p,n.firstChild);n.scrollTop=n.scrollHeight;const r=n.getBoundingClientRect();return {emptyNavigation:empty?.children.length===0,emptyNavigationHeight:empty?.getBoundingClientRect().height,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,scrollTop:n.scrollTop,top:r.top,bottom:r.bottom,viewport:innerHeight};});
  assert(probe.emptyNavigation);assert(probe.clientHeight>0&&probe.scrollTop>0&&probe.bottom<=probe.viewport+1);await sample(workspace,label+'-long-panel');report.measurements.push({label,...probe,before});
  await panel.locator('[data-shell-probe]').evaluate(n=>n.remove());await panel.getByRole('button',{name:'返回工作空间',exact:true}).click();await workspace.locator('.workspace').waitFor();await sample(workspace,label+'-resumed');
  report.results.push({name:label+'-real-open-empty-navigation-and-scrollable-owned-root',status:'PASS',evidence:'REAL_PANEL_OPEN_PLUS_MECHANISM_ONLY_LOCAL_TALL_DOM_PROBE',nativeWrite:'NONE'});
 }
 assert(!mutation,'layout mutation unexpectedly passed all geometry oracles');assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=context.browser().version();report.status='PASS';
}catch(error){if(mutation&&error.code==='ERR_ASSERTION'&&report.results.length===0&&report.measurements.length>0){report.status='EXPECTED_MUTATION_REJECTION';report.oracleError=error.message;report.results.push({name:'original-unbounded-shell-rejected-by-initial-geometry-oracle',status:'PASS',evidence:'MUTATED_TEMPORARY_PACKAGE_NOT_PRODUCT_ACCEPTANCE'});}else{report.status='FAIL';report.error=error.stack;process.exitCode=1;}}finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([path,hash])=>createHash('sha256').update(await readFile(path)).digest('hex')!==hash))).some(Boolean);report.scriptChangedDuringRun=createHash('sha256').update(await readFile(scriptPath)).digest('hex')!==scriptHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun){report.status='FAIL';report.error='source-or-test-changed-during-run';process.exitCode=1;}await writeFile(output,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));

/** Actual packaged renderer, real MV3 events, anonymous loopback host only.
 * Proves bounded layout reproof, not live ChatGPT/Mac acceptance. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {observedHomeHTML,materializePartitionedSidebar,materializeFlatHomeBranch} from './fixtures/observed-host-replay.mjs';
import partition from './fixtures/observed-sidebar-project-details-20261026.json' with {type:'json'};
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';
const C='33333333-3333-4333-8333-333333333333';
const report={status:'RUNNING',evidence:'PACKAGED_MV3_SYNTHETIC_HOST',realChatGPT:'NOT_RUN',checks:[]};
const directory=await mkdtemp(join(tmpdir(),'vaiwl-flow-boundary-mv3-'));report.directory=directory;
let server,guard,context,page;
try{
 server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(observedHomeHTML(C));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});report.package=packageHost(join(directory,'package'),{offlineOrigin:origin,browserLocal:true});
 context=await chromium.launchPersistentContext(join(directory,'profile'),{headless:true,viewport:{width:1400,height:900},executablePath:process.env.FREE_CHROME_EXECUTABLE,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
 report.browser=context.browser().version();await context.route('**/*',route=>route.request().url().startsWith(origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:report.package.unpacked});
 page=await context.newPage();report.browserErrors=[];page.on('pageerror',error=>report.browserErrors.push(error.message));
 await page.addInitScript({content:'if(window===window.top)document.addEventListener("DOMContentLoaded",()=>{('+materializePartitionedSidebar.toString()+')('+JSON.stringify(partition.sidebarStructure.rows)+');('+materializeFlatHomeBranch.toString()+')();},{once:true});'});
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  globalThis.boundaryJoins=0;globalThis.boundaryClicks=0;
  window.addEventListener('message',event=>{if(event.origin.startsWith('chrome-extension://')&&event.data?.type==='VAIWL_UI_JOIN'&&event.data?.role==='workspace')boundaryJoins++;});
  document.addEventListener('DOMContentLoaded',()=>{
   const island=document.createElement('section');island.id='boundary-native-island';island.style.cssText='height:24px;width:100%';
   const button=document.createElement('button');button.textContent='Native boundary action';button.addEventListener('click',()=>boundaryClicks++);island.append(button);document.querySelector('[role=main]').append(island);
  },{once:true});
 });
 await page.goto(origin+'/');
 const visible=()=>{const n=document.querySelector('[data-va-owned][id$="_workspace"]');return !!n&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility==='visible'&&n.getBoundingClientRect().height>=96;};
 await page.frameLocator('iframe[src="chrome-extension://'+id+'/workspace.html"]').locator('.workspace').waitFor({timeout:15000});await page.waitForFunction(visible,null,{timeout:15000});
 const original=await page.locator('iframe[src="chrome-extension://'+id+'/workspace.html"]').elementHandle(),joins=await page.evaluate(()=>boundaryJoins),draft=await page.locator('textarea').inputValue();
 assert(joins>0,'actual workspace JOIN observed');
 for(const mutation of ['cosmetic','button-replaced','island-hidden','island-shown','island-root-replaced','natural-height']){
  await page.locator('#boundary-native-island').evaluate((n,kind)=>{
   if(kind==='cosmetic'){n.className='native-current';n.style.boxShadow='inset 0 0 1px rgba(0,0,0,.15)';}
   if(kind==='button-replaced'){const old=n.querySelector('button'),button=old.cloneNode(true);button.addEventListener('click',()=>boundaryClicks++);old.replaceWith(button);}
   if(kind==='island-hidden')n.style.display='none';
   if(kind==='island-shown')n.style.display='block';
   if(kind==='island-root-replaced'){
    const replacement=document.createElement('section');replacement.id=n.id;replacement.style.cssText=n.style.cssText;
    const button=document.createElement('button');button.textContent='Native boundary action';button.addEventListener('click',()=>boundaryClicks++);replacement.append(button);n.replaceWith(replacement);
   }
   if(kind==='natural-height'){n.style.height='auto';const child=document.createElement('div');child.style.height='38px';child.textContent='Native additional status';n.append(child);}
  },mutation);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForFunction(visible,null,{timeout:6000});
  const row={mutation,visible:await page.evaluate(visible),sameFrame:await original.evaluate(node=>node.isConnected&&node===document.querySelector('iframe[src$="/workspace.html"]')),joins:await page.evaluate(()=>boundaryJoins),draft:await page.locator('textarea').inputValue()};
  report.checks.push(row);assert.equal(row.sameFrame,true,mutation+' frame continuity');assert.equal(row.joins,joins,mutation+' cannot require a new JOIN');assert.equal(row.draft,draft,mutation+' draft continuity');
  if(['button-replaced','island-root-replaced'].includes(mutation))await page.getByRole('button',{name:'Native boundary action',exact:true}).click();
 }
 report.nativeClicks=await page.evaluate(()=>boundaryClicks);assert.equal(report.nativeClicks,2);
 report.screenshot=join(directory,'final.png');await page.screenshot({path:report.screenshot});
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await page.locator('#boundary-native-island').evaluate(node=>node.classList.toggle('native-after-user-exit'));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
 report.explicitNativeReading={hidden:!await page.evaluate(visible),sameFrame:await original.evaluate(node=>node.isConnected&&node===document.querySelector('iframe[src$="/workspace.html"]')),joins:await page.evaluate(()=>boundaryJoins)};
 assert.equal(report.explicitNativeReading.hidden,true,'an explicit native-reading choice cannot be overwritten by layout reconciliation');assert.equal(report.explicitNativeReading.sameFrame,true);assert.equal(report.explicitNativeReading.joins,joins);
 assert.deepEqual(report.browserErrors,[]);report.verification=verifyHost(report.package.unpacked).status;report.status='PASS_LAYOUT_BOUNDARY_MV3';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;if(page)try{
 report.failureDOM=await page.evaluate(()=>({startup:document.documentElement.dataset.vaiwlStartup,state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,joins:globalThis.boundaryJoins,frames:[...document.querySelectorAll('iframe[src^="chrome-extension:"]')].map(node=>({src:node.src,connected:node.isConnected,parent:node.parentElement.id,visible:getComputedStyle(node.parentElement).display})),island:document.querySelector('#boundary-native-island')?.outerHTML}));
 report.failureScreenshot=join(directory,'failure.png');await page.screenshot({path:report.failureScreenshot});
}catch{}}
finally{await context?.close();await guard?.close();if(server)await new Promise(resolve=>server.close(resolve));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}

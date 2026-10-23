import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const files=['extension/frame-shell.css','src/navigation/navigation.mjs','src/navigation/styles.mjs','tests/host/frame-theme-menu-layout-browser.mjs'],hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')]))),out=process.argv[2]??'/private/tmp/free-frame-theme-menu-layout.json';
const report={kind:'SYNTHETIC_FRAME_DOM_LAYOUT_NOT_MV3',realChatGPT:'NOT_RUN',checks:[],sourceBefore:await hashes()};let browser;
const server=http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://127.0.0.1').pathname;if(path==='/frame'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><link rel="stylesheet" href="/extension/frame-shell.css"></head><body style="margin:0"><main id="mount" style="height:800px"></main></body></html>');return;}if(path==='/extension/frame-shell.css'){res.writeHead(200,{'Content-Type':'text/css'});res.end(await readFile('extension/frame-shell.css'));return;}if(!['/src/host/frame-resume-state.mjs','/src/host/frame-row-windows.mjs','/src/host/current-navigation-plan.mjs','/src/host/contract.mjs'].includes(path)&&!/^\/src\/(navigation|data|b1)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('not-allowed');res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(resolve('.'+path)));}catch{res.writeHead(404);res.end();}});
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});report.browser=browser.version();const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();
 for(const width of [160,240,420,1000])for(const scale of [1,2]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/frame');
  await page.evaluate(async scale=>{
   document.documentElement.style.setProperty('--vaiwl-font-scale',String(scale));const {createNavigation}=await import('/src/navigation/navigation.mjs'),p=(items=[])=>({items,total:items.length,offset:0,limit:5,hasMore:false}),title='长期研究项目与知识管理中文标题'.repeat(12);
   const group={id:'project',name:title,nativeName:title,icon:'◇',segment:0,nativeUrl:null,lists:{current:p(),old:p(),unknown:p()}};
   const nav=globalThis.menuLayoutNavigation=createNavigation({document,surface:{role:'workspace',root:document.querySelector('#mount')},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}}});
   nav.updateFrameProjection(globalThis.menuLayoutProjection={protocol:'vaiwl-free-frame/1',role:'workspace',scope:'scope',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:false,maxSegment:0},groups:{...p([group]),limit:24},entries:{noProject:{...p(),inventoryTotal:0},unknown:{...p(),inventoryTotal:0}},selection:null});
  },scale);
  const trigger=page.locator('.card-actions');await trigger.focus();await trigger.press('Enter');await page.getByRole('menu').waitFor();
  const measured=await page.evaluate(()=>{const shadow=menuLayoutNavigation.roots().workspace.shadow,head=shadow.querySelector('.card-head'),title=head.querySelector('h2'),text=title.querySelector('.theme-name'),glyph=title.querySelector('.theme-glyph'),menu=shadow.querySelector('.menu'),trigger=shadow.querySelector('.card-actions'),rect=n=>n.getBoundingClientRect().toJSON();return {head:rect(head),title:rect(title),text:rect(text),glyph:rect(glyph),menu:rect(menu),trigger:rect(trigger),workspace:rect(shadow.querySelector('.workspace')),glyphMinHeight:getComputedStyle(glyph).minHeight,titleFontSize:parseFloat(getComputedStyle(title).fontSize),focusedFirst:shadow.activeElement===menu.querySelector('[role="menuitem"]'),menuItems:menu.querySelectorAll('[role="menuitem"]').length,workspaceWidth:shadow.querySelector('.workspace').clientWidth,workspaceScroll:shadow.querySelector('.workspace').scrollWidth};});
  report.checks.push({width,scale,...measured,keyboardFocusRestored:false});
  await page.screenshot({path:out+`.${width}-${scale}.png`});
  assert(measured.menu.left>=measured.workspace.left&&measured.menu.right<=measured.workspace.right,'project menu must remain inside the owned workspace');
  assert(measured.menu.top>=measured.title.bottom-1,'menu must start below enlarged title');assert(measured.menu.top>=measured.head.bottom-1,'menu must anchor below the whole card header');assert(measured.text.right<=measured.trigger.left+1||measured.text.bottom<=measured.trigger.top+1,'long Chinese title must not obscure action, including wrapped headers');assert(measured.glyph.bottom<=measured.head.bottom+1&&measured.glyph.top>=measured.head.top-1,'glyph stays within expanded header');assert(Math.abs(measured.glyph.width-measured.glyph.height)<=1,'theme glyph remains square');assert(Math.abs(measured.glyph.width-25*scale)<=1,'glyph scales with 25px v2.7 baseline');assert.equal(measured.titleFontSize,15*scale);assert.equal(measured.focusedFirst,true);assert.equal(measured.menuItems,1);assert(measured.workspaceScroll<=measured.workspaceWidth+1);
  await page.keyboard.press('End');assert.equal(await page.evaluate(()=>{const s=menuLayoutNavigation.roots().workspace.shadow;return s.activeElement===s.querySelector('.menu').lastElementChild;}),true);await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>{const s=menuLayoutNavigation.roots().workspace.shadow;return s.activeElement===s.querySelector('.menu').firstElementChild;}),true);await page.keyboard.press('Escape');assert.equal(await page.getByRole('menu').count(),0);assert.equal(await trigger.evaluate(n=>n.getRootNode().activeElement===n),true);
  report.checks.at(-1).keyboardFocusRestored=true;
  if(width===420&&scale===1){
   // A following focusable element represents leaving this owned workspace.
   await page.evaluate(()=>{const next=document.createElement('button');next.id='after-workspace';next.textContent='After workspace';document.body.append(next);});
   await trigger.press('Enter');await page.keyboard.press('Shift+Tab');
   assert.equal(await page.getByRole('menu').count(),0,'Shift+Tab must dismiss the project menu');
   assert.equal(await trigger.evaluate(n=>n.getRootNode().activeElement===n),true,'Shift+Tab returns to the menu trigger');
   await trigger.press('Enter');await page.keyboard.press('Tab');
   assert.equal(await page.getByRole('menu').count(),0,'Tab must dismiss the project menu');
   assert.equal(await page.locator('#after-workspace').evaluate(n=>document.activeElement===n),true,'Tab continues after the trigger without trapping focus');
   report.checks.at(-1).tabDismissalAndFocus=true;
   await trigger.focus();await trigger.press('Enter');
   await page.evaluate(()=>menuLayoutNavigation.updateFrameProjection(menuLayoutProjection));
   await page.getByRole('menu').waitFor({state:'detached'});
   assert.equal(await trigger.evaluate(n=>n.getRootNode().activeElement===n),true,'same-scope update must return menu focus to its surviving project control');
   report.checks.at(-1).updateFocusRestored=true;
   await trigger.press('Enter');await page.locator('#after-workspace').focus();
   await page.evaluate(()=>menuLayoutNavigation.updateFrameProjection(menuLayoutProjection));
   await page.getByRole('menu').waitFor({state:'detached'});
   assert.equal(await page.locator('#after-workspace').evaluate(n=>document.activeElement===n),true,'update must not reclaim focus after the user leaves the menu');
   report.checks.at(-1).externalFocusPreserved=true;
  }
  await page.evaluate(()=>menuLayoutNavigation.stop());
 }
 report.ok=true;
}catch(error){report.ok=false;report.error=error.stack;process.exitCode=1;}finally{await browser?.close();if(server.listening)await new Promise(r=>server.close(r));report.sourceAfter=await hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);if(!report.sourceStable){report.ok=false;process.exitCode=1;}await writeFile(out,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report));

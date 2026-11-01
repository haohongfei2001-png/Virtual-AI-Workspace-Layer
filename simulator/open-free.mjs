// Operates the current MV3 package using the existing local host and approved
// sample data. There is no alternate renderer, page UI, or production profile.
// node simulator/open-free.mjs [--check]
import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const {chromium}=await import(new URL('../tests/b1/tooling/node_modules/playwright/index.mjs',import.meta.url));
const {approvedWorkspaceProjects}=await import(new URL('../tests/host/fixtures/approved-workspace-data.mjs',import.meta.url));
const {createHostFixtureServer}=await import(new URL('../tests/host/fixtures/server.mjs',import.meta.url));
const {packageHost,verifyHost}=await import(new URL('../extension/package.mjs',import.meta.url));
const {createHistoricalNetworkGuard,historicalNetworkGuardArgs}=await import(new URL('../tests/host/historical-network-guard.mjs',import.meta.url));
const run=await mkdtemp('/private/tmp/vaiwl-existing-ui-');
const server=await createHostFixtureServer({presentation:'approved-workspace'});
const guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
const built=packageHost(join(run,'package'),{offlineOrigin:server.origin,offlineSnippets:true});
let context,page;
const checked=process.argv.includes('--check');
const report={kind:'EXISTING_PRODUCT_UI_OFFLINE_INSTANCE',origin:server.origin,package:built.unpacked,syntheticHost:true,realChatGPT:false,checks:[]};
try{
 context=await chromium.launchPersistentContext(join(run,'profile'),{headless:checked,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',viewport:{width:1440,height:960},ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging','--no-first-run','--disable-background-networking',...historicalNetworkGuardArgs(guard.config)]});
 await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===server.origin||u.protocol==='chrome-extension:'?r.continue():r.abort();});
 const cdp=await context.browser().newBrowserCDPSession();
 const {id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(10000);
 const frame=()=>page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);
 const ready=async()=>{await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:20000});assert(frame());};
 const settledCards=async()=>{await frame().waitForFunction(()=>{const root=document.querySelector('[data-vaiwl-frame-root]')?.firstElementChild?.shadowRoot,w=root?.querySelector('.workspace'),grid=w?.querySelector('.cards'),cards=[...grid?.querySelectorAll('.card')??[]];if(cards.length!==6)return false;const count=Math.max(1,Math.min(3,cards.length,Math.floor((grid.clientWidth+18)/346)));if(new Set(cards.map(c=>Math.round(c.getBoundingClientRect().x))).size!==count||cards.some(c=>c.style.position!=='absolute')||w.scrollWidth>w.clientWidth)return false;return cards.slice(count).every((c,i)=>c.getBoundingClientRect().top>=cards[i].getBoundingClientRect().bottom+17);});};
 // Existing native fixture pages supply Project members to the unchanged owner.
 for(const project of approvedWorkspaceProjects.map(p=>p.id)){
   await page.goto(server.origin+'/g/'+project+'/project');await ready();
   await frame().locator(`[data-theme-id="${project}"]`).first().waitFor({timeout:15000});
 }
 await page.goto(server.url);await ready();
 await frame().getByText('开发 1.0',{exact:true}).first().waitFor({timeout:15000});
 await settledCards();
 report.checks.push('actual-extension-workspace-and-sidebar-mounted','synthetic-native-projects-and-chats-rendered');
 if(checked){
   const side=()=>page.frames().find(f=>f.url()===`chrome-extension://${id}/sidebar.html`);
   const geometry=await frame().locator('.workspace').evaluate(w=>{
     const cards=[...w.querySelectorAll('.card')],rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
     return {cards:cards.map(rect),padding:getComputedStyle(w).paddingLeft,font:getComputedStyle(cards[0].querySelector('.row')).fontSize,radius:getComputedStyle(cards[0]).borderRadius,header:getComputedStyle(cards[0].querySelector('.card-head')).backgroundColor,width:w.clientWidth,scrollWidth:w.scrollWidth};
   });
   assert.equal(geometry.cards.length,6);assert.equal(geometry.font,'14px');assert.equal(geometry.radius,'13px');assert.equal(geometry.padding,'24px');assert.equal(geometry.header,'rgb(244, 244, 244)');
   assert.equal(new Set(geometry.cards.map(c=>Math.round(c.x))).size,3);assert(geometry.scrollWidth<=geometry.width);
   for(let i=0;i<3;i++)assert(geometry.cards[i+3].y>=geometry.cards[i].y+geometry.cards[i].height+17);
   report.geometry=geometry;
   await side().getByRole('button',{name:'侧栏主题 PAIA',exact:true}).click();
   await side().getByText('开发 1.0',{exact:true}).waitFor();
   await side().getByRole('button',{name:'侧栏主题 PAIA',exact:true}).click();
   await side().getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
   await frame().getByRole('searchbox',{name:'已知聊天查找输入'}).fill('论文');
   await frame().getByText('硕士论文',{exact:true}).first().waitFor();
   await frame().getByRole('button',{name:'关闭派生查找',exact:true}).click();
   await frame().locator('.card').first().waitFor();
   const first=frame().locator('.working-set-inline').first();await first.hover();
   await first.getByRole('button',{name:'加入工作集',exact:true}).click();
   await side().getByRole('button',{name:'当前工作集',exact:true}).click();
   await frame().getByRole('button',{name:'从工作集移除',exact:true}).waitFor();
   await frame().getByRole('button',{name:'从工作集移除',exact:true}).click();
   await frame().getByRole('button',{name:'返回主题视图',exact:true}).click();
   await frame().getByText('开发 1.0',{exact:true}).first().click();
   await page.waitForURL(/\/c\//);await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await ready();
   report.checks.push('six-project-three-column-approved-metrics','sidebar-expand-and-collapse','formal-search-open-type-close','workset-add-remove-return','native-chat-navigation-and-workspace-return');
   await frame().getByRole('button',{name:'工作空间设置',exact:true}).click();
   await frame().getByRole('button',{name:'紧凑窗口',exact:true}).waitFor();
   await frame().getByRole('button',{name:'关闭设置',exact:true}).click();
   await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
   await page.locator('textarea').fill('LOCAL UNSENT DRAFT');
   await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await ready();
   assert.equal(await page.locator('textarea').inputValue(),'LOCAL UNSENT DRAFT');
   await page.locator('textarea').fill('');
   await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await ready();
   report.checks.push('formal-settings-open-close','native-reading-and-return-preserve-draft');
 }
 if(checked){
   await page.mouse.move(0,0);await page.screenshot({path:join(run,'desktop-light.png')});
   await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
   await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark');});
   await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await ready();
   await frame().waitForFunction(()=>document.documentElement.dataset.vaiwlTheme==='dark');
   await frame().locator('.card').nth(5).waitFor();await settledCards();
   await page.screenshot({path:join(run,'desktop-dark.png')});
   await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
   await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.classList.remove('dark');});
   await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await ready();
   await frame().waitForFunction(()=>document.documentElement.dataset.vaiwlTheme==='light');await frame().locator('.card').nth(5).waitFor();await settledCards();
   await page.setViewportSize({width:900,height:900});await ready();
   await settledCards();
   const narrow=await frame().locator('.workspace').evaluate(w=>({width:w.clientWidth,scrollWidth:w.scrollWidth,cardWidth:w.querySelector('.card').getBoundingClientRect().width,available:w.querySelector('.cards').clientWidth,columns:new Set([...w.querySelectorAll('.card')].map(c=>Math.round(c.getBoundingClientRect().x))).size}));
   report.narrow=narrow;assert(narrow.scrollWidth<=narrow.width);assert.equal(narrow.columns,1);assert(Math.abs(narrow.cardWidth-narrow.available)<1);report.narrow=narrow;
   await page.screenshot({path:join(run,'narrow.png')});
   await page.setViewportSize({width:1440,height:960});await ready();await settledCards();
   report.checks.push('dark-theme-after-native-reentry','narrow-reflow-with-native-input-retained');
 }
 report.verify=verifyHost(built.unpacked).status;
 report.extensionId=id;
 await page.screenshot({path:join(run,'existing-ui.png')});
 await writeFile(join(run,'instance.json'),JSON.stringify(report,null,2));
 // The launch receipt lives beside the isolated profile; no repository state.
 await writeFile(join(run,'launch.json'),JSON.stringify({...report,run},null,2));
 console.log(JSON.stringify({status:checked?'CHECKED':'OPEN_FOR_USER',...report,run}));
 if(!checked)await new Promise(resolve=>context.once('close',resolve));
}catch(e){report.error=e.stack;report.status='FAIL';await page?.screenshot({path:join(run,'failure.png')}).catch(()=>{});await writeFile(join(run,'failure.json'),JSON.stringify(report,null,2));console.error(JSON.stringify({run,error:e.stack}));process.exitCode=1;}
finally{await context?.close();await guard.close();await server.close();}

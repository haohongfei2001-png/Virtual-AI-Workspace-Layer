/** Actual DOM/controller/IndexedDB fixture test. No real host/profile or model network.
 * Run with primary runtime dependencies and PRO_CHROMIUM_MODULE set to a local
 * @sparticuz/chromium module, or PRO_CHROMIUM_EXECUTABLE to an installed browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,dirname,join,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
async function launch(){
  const nodeModules=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  const playwright=require(require.resolve('playwright',{paths:nodeModules?[nodeModules]:[repository]}));
  let executablePath=process.env.PRO_CHROMIUM_EXECUTABLE,args=['--no-zygote','--disable-gpu'];
  if(!executablePath){const location=process.env.PRO_CHROMIUM_MODULE;if(!location)throw Error('Set PRO_CHROMIUM_MODULE or PRO_CHROMIUM_EXECUTABLE for isolated browser verification');const chromium=(await import(pathToFileURL(location))).default;executablePath=await chromium.executablePath();args=['--no-zygote','--disable-gpu'];}
  return playwright.chromium.launch({executablePath,args,headless:true});
}
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VAIWL Pro isolated UI</title><style>${process.env.PRO_UI_FONT?"@font-face{font-family:'PingFang SC';src:url('/__fixture-font.ttf')}":''}html,body{margin:0;height:100%;font-family:system-ui}#workspace{display:block;height:100%}</style><div id="workspace"></div><script type="module">
import {createFixtureOwner} from '/tests/pro/support/fixture-owner.mjs';
import {createProController} from '/src/pro/runtime/controller.mjs';
import {createProWorkspace} from '/src/pro/ui/workspace.mjs';
const owner=await createFixtureOwner({indexedDB,databaseName:'pro_ui_'+crypto.randomUUID(),fixtureOnly:true});
const controller=await createProController(owner);window.fixtureOwner=owner;window.controller=controller;window.ui=createProWorkspace(document.getElementById('workspace'),controller);window.ready=true;
</script>`;

test('actual Pro UI saves manual operations, preserves stale drafts, reviews Series and works at narrow widths',async()=>{
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__fixture-font.ttf'&&process.env.PRO_UI_FONT){res.setHeader('content-type','font/ttf');res.end(await readFile(process.env.PRO_UI_FONT));return;}if(url.pathname==='/'){res.setHeader('content-type','text/html;charset=utf-8');res.end(fixture);return;}const path=resolve(repository,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(repository+'/')){res.writeHead(403).end();return;}const bytes=await readFile(path);res.setHeader('content-type',extname(path)==='.mjs'?'text/javascript;charset=utf-8':'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,context;
 try{
  browser=await launch();context=await browser.newContext({viewport:{width:1180,height:840}});const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.origin);return route.abort();}return route.continue();});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);await page.getByRole('button',{name:'新建主题',exact:true}).waitFor();
  await page.getByRole('button',{name:'新建主题',exact:true}).click();await page.getByRole('textbox',{name:'主题名称',exact:true}).fill('界面研发');await page.getByRole('button',{name:'创建主题',exact:true}).click();await page.getByRole('heading',{name:'界面研发',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>Object.values(controller.getState().topics)[0].name),'界面研发');
  await page.getByRole('button',{name:'名称与主题：Riftlet 首击可靠性排查',exact:true}).click();await page.getByRole('combobox',{name:'主主题',exact:true}).selectOption({label:'界面研发'});await page.getByRole('button',{name:'设为主主题',exact:true}).click();
  await page.getByRole('button',{name:'名称与主题：Riftlet 首击可靠性排查',exact:true}).click();await page.getByRole('textbox',{name:'整理标题',exact:true}).fill('首击可靠性核对');await page.getByRole('button',{name:'保存整理标题',exact:true}).click();await page.getByRole('button',{name:'首击可靠性核对',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>controller.getState().titles.c_alpha.control.mode),'human');assert.equal(await page.evaluate(()=>controller.getState().titles.c_alpha.control.locked),true);
  // A live background refresh may repaint cards, but never changes a dirty editor draft.
  await page.getByRole('button',{name:'名称与主题：首击可靠性核对',exact:true}).click();await page.getByRole('textbox',{name:'整理标题',exact:true}).fill('尚未保存的修改');await page.evaluate(async()=>{await controller.dispatch({type:'CREATE_TOPIC',name:'其他工作'});});assert.equal(await page.getByRole('textbox',{name:'整理标题',exact:true}).inputValue(),'尚未保存的修改');
  await page.getByRole('button',{name:'保存整理标题',exact:true}).click();await page.getByRole('alert').filter({hasText:'之后有修改'}).waitFor();assert.equal(await page.evaluate(()=>controller.getState().titles.c_alpha.title),'首击可靠性核对');await page.getByRole('button',{name:'关闭',exact:true}).click();
  // Escape closes only the own dialog and returns to a still-valid trigger.
  await page.getByRole('button',{name:'名称与主题：首击可靠性核对',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>document.querySelector('#workspace').shadowRoot.activeElement?.getAttribute('aria-label')),'名称与主题：首击可靠性核对');
  // A background update cannot retire a pointer target between down and its click.
  const createButton=page.getByRole('button',{name:'新建主题',exact:true});await createButton.scrollIntoViewIfNeeded();const createBox=await createButton.boundingBox();
  await page.evaluate(()=>{window.heldButton=document.querySelector('#workspace').shadowRoot.querySelector('[aria-label="新建主题"]');});
  await page.mouse.move(createBox.x+createBox.width/2,createBox.y+createBox.height/2);await page.mouse.down();
  await page.evaluate(async()=>{await controller.dispatch({type:'CREATE_TOPIC',name:'后台新增主题'});});
  assert.equal(await page.evaluate(()=>heldButton.isConnected),true);await page.mouse.up();await page.getByRole('dialog',{name:'新建主题',exact:true}).waitFor();await page.getByRole('button',{name:'关闭',exact:true}).click();
  // Native preference follows the newly observed original title, not a copied override.
  await page.getByRole('button',{name:'名称与主题：首击可靠性核对',exact:true}).click();await page.getByRole('button',{name:'持续显示原名',exact:true}).click();await page.evaluate(async()=>{await fixtureOwner.updateNative('c_alpha',{title:'原生后来更名'});await controller.refresh();});await page.getByRole('button',{name:'原生后来更名',exact:true}).waitFor();
  // Real structure preview; no write until final confirmation.
  await page.getByRole('button',{name:'主题设置：界面研发',exact:true}).click();await page.getByRole('button',{name:'查看与编辑工作线',exact:true}).click();await page.getByRole('button',{name:'建立工作线',exact:true}).click();await page.getByRole('textbox',{name:'工作线名称',exact:true}).fill('排查工作线');await page.getByRole('button',{name:'预览工作线',exact:true}).click();await page.getByRole('dialog',{name:'确认工作线',exact:true}).waitFor();assert.equal(await page.evaluate(()=>Object.keys(controller.getState().series).length),0);await page.getByRole('button',{name:'确认应用',exact:true}).click();await page.waitForFunction(()=>Object.values(controller.getState().series).some(s=>s.title==='排查工作线'));
  // Local processing consent is explicit, pausable, and never replayed by restart.
  await page.getByRole('button',{name:'整理设置',exact:true}).click();await page.getByRole('button',{name:'暂停本地整理',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>controller.getStatus().processingMode),'off');assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'整理设置',exact:true}).click();await page.getByRole('button',{name:'允许本地标题整理',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>controller.getStatus().processingMode),'local');
  await page.getByRole('button',{name:'整理设置',exact:true}).click();await page.getByRole('button',{name:'重启离线样本',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>controller.getStatus().processingMode),'off');
  await page.getByRole('button',{name:'整理设置',exact:true}).click();await page.getByRole('button',{name:'允许本地标题整理',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>controller.getStatus().processingMode),'local');assert.equal(await page.evaluate(()=>controller.getStatus().cloudBudget),0);
  // Theme color assertions wait for the inherited 140 ms button background transition.
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>getComputedStyle(document.querySelector('#workspace').shadowRoot.querySelector('.pro-mode button[aria-pressed=true]')).backgroundColor==='rgb(33, 33, 33)');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#workspace').shadowRoot.querySelector('.pro-mode button[aria-pressed=true]')).color),'rgb(236, 236, 236)');
  await page.getByRole('button',{name:'查找',exact:true}).hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('#workspace').shadowRoot.querySelector('[aria-label="查找"]')).backgroundColor==='rgb(48, 48, 48)');
  await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>getComputedStyle(document.querySelector('#workspace').shadowRoot.querySelector('.pro-mode button[aria-pressed=true]')).backgroundColor==='rgb(255, 255, 255)');
  // Dialog is contained in own surface, supports keyboard traversal and 200%-equivalent width.
  await page.setViewportSize({width:430,height:820});await page.getByRole('button',{name:'名称与主题：原生后来更名',exact:true}).click();const bounds=await page.getByRole('dialog').boundingBox();assert(bounds.width<=430);assert(bounds.x>=0);assert(bounds.x+bounds.width<=431);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.querySelector('#workspace').shadowRoot.querySelector('[role=dialog]').contains(document.querySelector('#workspace').shadowRoot.activeElement)));
  await page.evaluate(()=>document.fonts.ready);
  if(process.env.PRO_UI_SCREENSHOT_DIR){await mkdir(process.env.PRO_UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.PRO_UI_SCREENSHOT_DIR,'pro-ui-narrow-editor.png'),fullPage:true});}
  await page.keyboard.press('Escape');await page.setViewportSize({width:1180,height:840});if(process.env.PRO_UI_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.PRO_UI_SCREENSHOT_DIR,'pro-ui-desktop.png'),fullPage:true});
  await page.evaluate(async()=>{fixtureOwner.setEntitlement('free');await controller.refresh();});assert.equal(await page.getByRole('button',{name:'新建主题',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'整理建议',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'名称与主题：原生后来更名',exact:true}).click();await page.getByRole('dialog',{name:'已保存的名称与主题',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'保存整理标题',exact:true}).count(),0);await page.evaluate(()=>fixtureOwner.revoke());await page.waitForFunction(()=>!document.querySelector('#workspace').shadowRoot.textContent.includes('原生后来更名'));assert.equal(await page.getByRole('dialog').count(),0);
  // Dedicated DOM projection fixture exercises large sidebar windows without
  // changing or bypassing the NativeRepository-backed manual-workflow fixture.
  await page.evaluate(async()=>{
    ui.destroy();const root=document.getElementById('workspace');root.style.width='272px';root.style.height='500px';
    const field={mode:'human',locked:true,revision:1,lastHumanOperation:'fixture'},makeTopic=(id,name)=>({id,scopeKey:'sidebar_fixture',name,aliases:[],icon:'collection',lifecycle:'active',revision:1,nameControl:field,membershipControl:field});
    const references=Array.from({length:255},(_,i)=>({id:'r'+i,nativeTitle:(i<230?'当前窗口 ':'较早窗口 ')+i,nativeUrl:null,membership:{state:'NONE',evidenceId:'fixture_e_'+i,revision:1},available:true,activityDecision:{objectKey:'r'+i,evidenceRevision:1,basis:'exact',candidateDay:20000-i,candidateTime:new Date(Date.UTC(2026,9,31)-i*86400000).toISOString(),segment:i<230?0:1,reason:'fixture',nextCheck:null,validUntil:null}}));
    const state={scopeKey:'sidebar_fixture',topics:{a:makeTopic('a','主题 A'),b:makeTopic('b','主题 B')},placements:Object.fromEntries(references.map(r=>[r.id,{topicId:'a',conversationId:r.id,role:'primary',state:'included',control:field}])),titles:{},constraints:{},redirects:{},series:{}};
    state.placements.related={topicId:'b',conversationId:'r0',role:'related',state:'included',control:field};
    const snapshot={references,versions:{scopeKey:'sidebar_fixture',authorizationEpoch:1},capabilities:{positiveNone:'available'},authorized:true},status={mode:'pro-default-none',authorized:true,segment:0,launchContext:{topicId:'a',referenceId:'r0'}};
    const listeners=new Set(),opened=[];window.sidebarFixture={state,snapshot,status,opened,notify(){for(const listener of listeners)listener();}};
    const api={getState:()=>structuredClone(state),getSnapshot:()=>structuredClone(snapshot),getStatus:()=>structuredClone(status),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async open(refId,context){opened.push({refId,context});}};
    const {createProSidebar}=await import('/src/pro/ui/workspace.mjs');window.sidebar=createProSidebar(root,api);
  });
  const rail=page.locator('#workspace'),topicA=rail.locator('details[data-topic-id="a"]');
  assert.equal(await topicA.locator('.pro-row').count(),5);assert.equal(await rail.locator('details[data-topic-id="b"]').getAttribute('open'),null);
  await page.getByRole('button',{name:'显示更多近期窗口：主题 A',exact:true}).click();assert.equal(await topicA.locator('.pro-row').count(),17);
  assert.equal(await topicA.locator('.pro-old-list').count(),0);await page.getByRole('button',{name:'展开较早窗口：主题 A',exact:true}).click();assert.equal(await topicA.locator('.pro-old-list .pro-row').count(),5);
  for(let i=0;i<16;i++)await page.getByRole('button',{name:'显示更多近期窗口：主题 A',exact:true}).click();assert.equal(await topicA.locator(':scope > .pro-members > .pro-row').count(),200);
  await page.getByRole('button',{name:'下一页近期窗口：主题 A',exact:true}).click();assert.equal(await topicA.locator(':scope > .pro-members > .pro-row').count(),30);await page.getByRole('button',{name:'返回前一页近期窗口：主题 A',exact:true}).click();
  const nextPage=page.getByRole('button',{name:'下一页近期窗口：主题 A',exact:true});await nextPage.scrollIntoViewIfNeeded();await nextPage.focus();const beforeScroll=await page.evaluate(()=>sidebar.root.querySelector('.pro-sidebar').scrollTop);await page.evaluate(()=>sidebarFixture.notify());assert.equal(await page.evaluate(()=>sidebar.root.activeElement?.dataset.focusKey),'more:a:current');assert.equal(await page.evaluate(()=>sidebar.root.querySelector('.pro-sidebar').scrollTop),beforeScroll);
  const heldRow=topicA.getByRole('button',{name:'当前窗口 0',exact:true});await heldRow.scrollIntoViewIfNeeded();const box=await heldRow.boundingBox();await page.evaluate(()=>window.sidebarHeld=sidebar.root.querySelector('[data-focus-key="row:a:r0"]'));await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.evaluate(()=>sidebarFixture.notify());assert.equal(await page.evaluate(()=>sidebarHeld.isConnected),true);await page.mouse.up();await page.waitForFunction(()=>sidebarFixture.opened.length===1);assert.equal(await page.evaluate(()=>sidebarFixture.opened[0].refId),'r0');await page.waitForFunction(()=>!sidebarHeld.isConnected);
  const revokeRow=topicA.getByRole('button',{name:'当前窗口 1',exact:true});await revokeRow.scrollIntoViewIfNeeded();const revokeBox=await revokeRow.boundingBox();await page.mouse.move(revokeBox.x+revokeBox.width/2,revokeBox.y+revokeBox.height/2);await page.mouse.down();await page.evaluate(()=>{sidebarFixture.status.authorized=false;sidebarFixture.snapshot.authorized=false;sidebarFixture.notify();});assert.equal(await rail.locator('.pro-row').count(),0);await page.mouse.up();assert.equal(await page.evaluate(()=>sidebarFixture.opened.length),1);
  // Workspace old rows have their own 5/+12/cap-200 and next-page cursor.
  // The same 255-row synthetic projection now has 25 current and 230 old rows.
  await page.evaluate(async()=>{
    sidebar.destroy();const root=document.getElementById('workspace');root.style.width='100%';
    const {state,snapshot,status}=sidebarFixture;status.authorized=true;status.launchContext=null;status.entitlement='pro';snapshot.authorized=true;
    for(let i=0;i<snapshot.references.length;i++)snapshot.references[i].activityDecision.segment=i<25?0:1;
    const listeners=new Set();window.workspaceFixture={notify(){for(const listener of listeners)listener();}};
    const api={getState:()=>structuredClone(state),getSnapshot:()=>structuredClone(snapshot),getStatus:()=>structuredClone(status),getView:()=>({mode:'pro-default-none',native:{groups:{items:[]}}}),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
    const {createProWorkspace}=await import('/src/pro/ui/workspace.mjs');window.pagedWorkspace=createProWorkspace(root,api);
  });
  const workspaceA=rail.locator('.pro-card[data-topic-id="a"]');await workspaceA.waitFor();assert.equal(await workspaceA.locator('.pro-members > .pro-row-wrap').count(),5);assert.equal(await workspaceA.locator('.pro-old-list').count(),0);
  await workspaceA.getByRole('button',{name:'展开较早窗口：主题 A',exact:true}).click();assert.equal(await workspaceA.locator('.pro-old-list .pro-row').count(),5);
  await workspaceA.getByRole('button',{name:'显示更多较早窗口',exact:true}).click();assert.equal(await workspaceA.locator('.pro-old-list .pro-row').count(),17);assert.equal(await workspaceA.locator('.pro-members > .pro-row-wrap').count(),5);
  for(let i=0;i<16;i++)await workspaceA.getByRole('button',{name:'显示更多较早窗口',exact:true}).click();assert.equal(await workspaceA.locator('.pro-old-list .pro-row').count(),200);
  await workspaceA.getByRole('button',{name:'下一页较早窗口',exact:true}).click();assert.equal(await workspaceA.locator('.pro-old-list .pro-row').count(),30);assert.equal(await workspaceA.getByRole('button',{name:'下一页较早窗口',exact:true}).count(),0);
  await workspaceA.getByRole('button',{name:'返回前一页较早窗口',exact:true}).click();assert.equal(await workspaceA.locator('.pro-old-list .pro-row').count(),200);assert.equal(await workspaceA.locator('.pro-members > .pro-row-wrap').count(),5);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{await context?.close();await browser?.close();await new Promise(resolve=>server.close(resolve));}
});

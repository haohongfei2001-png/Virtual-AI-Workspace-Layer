/** Actual navigation renderer, with an in-memory projection owner and no host.
 * WEB_MECHANISM_ONLY, never a packaged-MV3 or real ChatGPT acceptance claim.
 * Optional FREE_SETTINGS_SOURCE_SNAPSHOT replays the two recorded old renderer
 * modules for a reproducible RED; default execution uses current source bytes.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url)),hash=x=>createHash('sha256').update(x).digest('hex');
const allCases=[1440,420].flatMap(width=>[1000,520].flatMap(height=>['light','dark'].map(colorScheme=>({width,height,colorScheme,id:`${width}-${height}-${colorScheme}`}))));
const shortFrames=[{width:420,height:120},{width:420,height:96},{width:420,height:200},{width:160,height:96}];
const selected=process.env.FREE_SETTINGS_CASE;assert(!selected||allCases.some(c=>c.id===selected),'unknown selected settings case');const cases=selected?allCases.filter(c=>c.id===selected):allCases;
const ramCases=selected?[]:[{width:420,height:220,colorScheme:'light'},{width:420,height:220,colorScheme:'dark'},{width:160,height:96,colorScheme:'dark'}];
let server,guard,browser,origin,directory,overrides={};const served=new Map();
const report={kind:'WORKSPACE_SETTINGS_ACTUAL_RENDERER',evidence:'WEB_MECHANISM_ONLY',MV3:'NOT_RUN',realChatGPT:'NOT_RUN',matrix:selected?'SELECTED_CASES':'FULL_8_CASES',expectedCases:cases.map(c=>c.id),expectedRamGuidanceCases:ramCases.map(c=>`ram-${c.width}-${c.height}-${c.colorScheme}`),ramGuidanceCases:[],shortFrameBoundaries:cases.some(c=>c.id==='420-520-dark')?shortFrames.map(viewport=>({...viewport,outcome:'NOT_RUN'})):[],status:'NOT_RUN',cases:[],sourceHashes:{},fixtureHashes:{}};
const persist=()=>writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
before(async()=>{
 directory=process.env.FREE_SETTINGS_ARTIFACT_DIR?resolve(process.env.FREE_SETTINGS_ARTIFACT_DIR):await mkdtemp(join(tmpdir(),'vaiwl-workspace-settings-'));await mkdir(directory,{recursive:true});
 report.artifactDirectory=directory;report.fixtureHashes['tests/host/workspace-settings-browser.mjs']=hash(await readFile(fileURLToPath(import.meta.url)));
 if(process.env.FREE_SETTINGS_SOURCE_SNAPSHOT){
  const bytes=await readFile(resolve(process.env.FREE_SETTINGS_SOURCE_SNAPSHOT)),snapshot=JSON.parse(bytes);assert.equal(snapshot.kind,'PRE_FIX_RENDERER_SOURCE_SNAPSHOT');
  assert.deepEqual(Object.keys(snapshot.sources).sort(),['src/navigation/navigation.mjs','src/navigation/styles.mjs']);
  for(const [path,text]of Object.entries(snapshot.sources))assert.equal(hash(text),snapshot.sourceHashes[path]);
  overrides=snapshot.sources;report.sourceSnapshot={path:resolve(process.env.FREE_SETTINGS_SOURCE_SNAPSHOT),sha256:hash(bytes),sourceCommit:snapshot.sourceCommit};
 }
 server=http.createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/frame'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/extension/frame-shell.css"><style>html,body,#mount{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><main id="mount"></main></body></html>');return;}
  if(path!=='/extension/frame-shell.css'&&!/^\/src\/(navigation|data|b1|runtime|host)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('unallowlisted-fixture-path');
  const key=path.slice(1);if(!served.has(key))served.set(key,overrides[key]??await readFile(resolve(root,key),'utf8'));report.sourceHashes[key]=hash(served.get(key));
  res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(served.get(key));
 }catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??chromium.executablePath(),args:historicalNetworkGuardArgs(guard.config)});
 report.browserVersion=browser.version();report.status='RUNNING';await persist();
});
after(async()=>{
 const cleanup=[];for(const [name,close]of [['browser',()=>browser?.close()],['networkGuard',()=>guard?.close()],['fixtureServer',()=>server&&new Promise(resolve=>server.close(resolve))]])try{await close();cleanup.push({name,closed:true});}catch(error){cleanup.push({name,closed:false,error:String(error)});}
 report.cleanup=cleanup;report.sourceHashesAfter={};for(const path of served.keys())report.sourceHashesAfter[path]=hash(overrides[path]??await readFile(resolve(root,path),'utf8'));
 report.sourceStable=JSON.stringify(report.sourceHashesAfter)===JSON.stringify(report.sourceHashes);report.fixtureStable=hash(await readFile(fileURLToPath(import.meta.url)))===report.fixtureHashes['tests/host/workspace-settings-browser.mjs'];
 report.status=report.cases.length===cases.length&&report.cases.every(c=>c.status==='PASS')&&report.ramGuidanceCases.length===ramCases.length&&report.ramGuidanceCases.every(c=>c.status==='PASS')&&report.sourceStable&&report.fixtureStable&&cleanup.every(c=>c.closed)?'PASS_WEB_MECHANISM_ONLY':'FAIL';
 if(directory)await persist();console.log('WORKSPACE_SETTINGS_REPORT '+join(directory,'report.json'));assert.equal(report.status,'PASS_WEB_MECHANISM_ONLY');
});

async function initialize(page,colorScheme,localAssetAccess=null){
 await page.goto(origin+'/frame');
 await page.evaluate(async({theme,localAssetAccess})=>{
  const colors=theme==='dark'?{'--surface':'#212121','--ink':'#ececec','--muted':'#a0a0a0','--line':'#484848','--bubble':'#303030','--hover':'#3a3a3a','--focus':'#8ab4f8'}:{'--surface':'#ffffff','--ink':'#202123','--muted':'#646464','--line':'#e5e5e5','--bubble':'#f4f4f4','--hover':'#eeeeee','--focus':'#3877ba'};
  for(const [key,value]of Object.entries(colors))document.documentElement.style.setProperty(key,value);document.documentElement.style.colorScheme=theme;
  const [{createNavigation},{freeNavigationSnapshot},{projectFreeFrame},{projectFreeSearch}]=await Promise.all([import('/src/navigation/navigation.mjs'),import('/src/navigation/free-view.mjs'),import('/src/runtime/free-frame-projection.mjs'),import('/src/runtime/free-search-projection.mjs')]);
  const scope='settings-scroll-fixture',refs=Array.from({length:40},(_,i)=>{const id='70000000-0000-4000-8000-'+(i+1).toString(16).padStart(12,'0');return {id,scope,nativeTitle:'Continuous chat '+String(i+1).padStart(2,'0'),nativeUrl:'https://chatgpt.com/c/'+id,membership:'NONE',projectId:null,activityDecision:{segment:0}};});
  const world={snapshot:freeNavigationSnapshot({scope,viewMode:'free',revision:1,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},refs,projects:[]})},calls=[],assetCalls=[];let query={role:'workspace',list:'noProject',rowOffset:0,rowLimit:41};
  const project=next=>{const {search,...frameQuery}=next,value=projectFreeFrame(world,frameQuery);if(search!==undefined)value.search=projectFreeSearch(world,search);if(localAssetAccess!==null)value.localAssetAccess=localAssetAccess;return value;};
  const navigation=createNavigation({document,surface:{role:'workspace',root:document.querySelector('#mount')},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){},nativeHref:url=>url,navigationPlan:()=>null},
   onProjectionRequest(next){calls.push(structuredClone(next));query=next;return project(next);},
   onHorizonRequest(){throw Error('fixture-does-not-authorize-setting-writes');},onCompactRowsRequest(){throw Error('fixture-does-not-authorize-setting-writes');},
   onSnippetsRequest(){assetCalls.push('snippets');throw Error('unexpected-snippet-entry');},onBackupRequest(){assetCalls.push('backup');throw Error('unexpected-backup-entry');},onRecoveryRequest(){assetCalls.push('recovery');throw Error('unexpected-recovery-entry');}
  });
  globalThis.settingsFixture={navigation,calls,assetCalls,refresh(){navigation.updateFrameProjection(project(query));}};
  navigation.updateFrameProjection(project(query));
 },{theme:colorScheme,localAssetAccess});
 await page.locator('[data-free-list="noProject"] .row').last().waitFor();
 await page.evaluate(()=>{const r=settingsFixture.navigation.roots().workspace;r.scroller.scrollTop=Math.min(300,r.scroller.scrollHeight-r.scroller.clientHeight);});
 await page.waitForFunction(()=>settingsFixture.navigation.view().scroll===settingsFixture.navigation.roots().workspace.scroller.scrollTop&&settingsFixture.navigation.view().scroll>=150);
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function measure(page){return page.evaluate(()=>{
 const root=settingsFixture.navigation.roots().workspace,workspace=root.scroller,panel=root.shadow.querySelector('section[aria-label="工作空间设置"]'),trigger=root.shadow.querySelector('.workspace-settings-trigger'),layer=root.shadow.querySelector('.workspace-settings-layer');
 const box=n=>{if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
 const target=n=>{if(!n)return null;const r=n.getBoundingClientRect();return root.shadow.elementFromPoint(r.x+r.width/2,r.y+r.height/2);};
 const hit=n=>{const found=target(n);return !!n&&(found===n||n.contains(found));};
 return {viewport:{width:innerWidth,height:innerHeight},windowScroll:{x:scrollX,y:scrollY},scroll:workspace.scrollTop,scrollHeight:workspace.scrollHeight,scrollWidth:workspace.scrollWidth,clientWidth:workspace.clientWidth,workspace:box(workspace),content:box(root.shadow.querySelector('.workspace-layout')),trigger:{rect:box(trigger),hit:hit(trigger),expanded:trigger?.getAttribute('aria-expanded')},panel:box(panel),panelScroll:panel?.scrollTop??null,
  layer:{rect:box(layer),pointerEvents:layer?getComputedStyle(layer).pointerEvents:null},triggerHitTarget:{tag:target(trigger)?.tagName??null,class:target(trigger)?.className??null},
  firstActionHit:hit(panel?.querySelector('button')),firstActionRect:box(panel?.querySelector('button')),closeAction:{rect:box(panel?.querySelector('[aria-label="关闭设置"]')),hit:hit(panel?.querySelector('[aria-label="关闭设置"]'))},activeKey:root.shadow.activeElement?.dataset.focusKey??null,activeTag:root.shadow.activeElement?.tagName??null,
  query:root.shadow.querySelector('input[type="search"]')?.value??null,selectionStart:root.shadow.activeElement?.selectionStart??null,selectionEnd:root.shadow.activeElement?.selectionEnd??null};
});}
const within=(box,outer)=>box&&box.width>0&&box.height>0&&box.x>=outer.x&&box.y>=outer.y&&box.x+box.width<=outer.x+outer.width+1&&box.y+box.height<=outer.y+outer.height+1;
function retained(before,after){assert.equal(after.scroll,before.scroll,'settings interactions must preserve the actual deep workspace scroll');assert.equal(after.scrollHeight,before.scrollHeight,'settings must not push content or change workspace scroll height');assert.deepEqual(after.content,before.content,'settings must preserve the card/list geometry');assert.deepEqual(after.windowScroll,{x:0,y:0});assert(after.scrollWidth<=after.clientWidth+1,'no horizontal overflow');}

for(const {width,height,colorScheme}of cases)test(`settings ${width}x${height} ${colorScheme}: visible at deep scroll, close/Escape focus, search continuity`,{timeout:20000},async t=>{
 const context=await browser.newContext({viewport:{width,height},colorScheme});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(5000);const id=`${width}-${height}-${colorScheme}`,entry={id,status:'RUNNING',stages:[],screenshots:[]};report.cases.push(entry);
 const capture=async label=>{const path=join(directory,id+'-'+label+'.png');await page.screenshot({path});entry.screenshots.push({label,path,sha256:hash(await readFile(path))});};
 try{
  await initialize(page,colorScheme);await settle(page);const baseline=await measure(page);entry.stages.push({stage:'deep-scroll-baseline',...baseline});assert(baseline.trigger.hit,'sticky settings entry must be visible and hittable before opening');await capture('closed');
  await page.getByRole('button',{name:'工作空间设置',exact:true}).click();await page.locator('section[aria-label="工作空间设置"]').waitFor({state:'attached'});await settle(page);const opened=await measure(page);entry.stages.push({stage:'opened',...opened});await capture('open');
  assert(within(opened.panel,opened.workspace),'opened settings must be visible in the current viewport without auto-scrolling to page top: '+JSON.stringify(opened));retained(baseline,opened);assert(opened.firstActionHit,'first settings action must be hittable');assert(opened.trigger.hit,'the floating panel must retain the settings toggle hit target');assert.equal(opened.activeKey,'查找已知项目与聊天','opening explicitly focuses the first action');
  await page.keyboard.press('Escape');await page.locator('section[aria-label="工作空间设置"]').waitFor({state:'detached'});await settle(page);const escaped=await measure(page);entry.stages.push({stage:'escaped',...escaped});retained(baseline,escaped);assert.equal(escaped.activeKey,'workspace-settings');
  await page.getByRole('button',{name:'工作空间设置',exact:true}).click();await page.locator('section[aria-label="工作空间设置"]').waitFor({state:'attached'});await page.getByRole('button',{name:'工作空间设置',exact:true}).click();await page.locator('section[aria-label="工作空间设置"]').waitFor({state:'detached'});await settle(page);const toggled=await measure(page);entry.stages.push({stage:'trigger-toggled-closed',...toggled});retained(baseline,toggled);assert.equal(toggled.activeKey,'workspace-settings');
  await page.getByRole('button',{name:'工作空间设置',exact:true}).click();await page.getByRole('button',{name:'关闭设置',exact:true}).click();await settle(page);const closed=await measure(page);entry.stages.push({stage:'closed',...closed});assert.equal(closed.panel,null);retained(baseline,closed);assert.equal(closed.activeKey,'workspace-settings');
  await page.getByRole('button',{name:'工作空间设置',exact:true}).click();await page.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
  const input=page.getByRole('searchbox',{name:'已知聊天查找输入',exact:true});await input.waitFor();await page.waitForFunction(()=>settingsFixture.navigation.roots().workspace.shadow.activeElement?.dataset.focusKey==='search-input');
  await input.fill('Continuous chat 03');await page.waitForFunction(()=>settingsFixture.calls.at(-1)?.search?.query==='Continuous chat 03');await settle(page);
  await input.evaluate(n=>n.setSelectionRange(2,7));await page.evaluate(()=>settingsFixture.refresh());await settle(page);const search=await measure(page);entry.stages.push({stage:'search-projection-refreshed',...search});assert.equal(search.activeKey,'search-input');assert.equal(search.query,'Continuous chat 03');assert.equal(search.selectionStart,2);assert.equal(search.selectionEnd,7);
  if(width===420&&height===520&&colorScheme==='dark'){
   // Native composer growth can leave the admitted minimum-size workspace.
   // Use actual frame viewports, including one 160x96 geometry boundary, while
   // retaining this as a single dark scenario instead of a second matrix.
   for(const viewport of shortFrames){
    const prefix=`short-${viewport.width}x${viewport.height}-search`;
    const boundary=report.shortFrameBoundaries.find(item=>item.width===viewport.width&&item.height===viewport.height);boundary.outcome='RUNNING';
    await page.setViewportSize(viewport);await settle(page);const shortBefore=await measure(page);entry.stages.push({stage:prefix+'-before-settings',...shortBefore});
    await page.getByRole('button',{name:'工作空间设置',exact:true}).click();await page.locator('section[aria-label="工作空间设置"]').waitFor({state:'attached'});await settle(page);
    const shortOpened=await measure(page);entry.stages.push({stage:prefix+'-opened',...shortOpened});await capture(prefix+'-open');
    assert(within(shortOpened.panel,shortOpened.workspace),'short search settings must stay inside the iframe: '+JSON.stringify(shortOpened));retained(shortBefore,shortOpened);assert(within(shortOpened.firstActionRect,shortOpened.workspace)&&within(shortOpened.firstActionRect,shortOpened.panel)&&shortOpened.firstActionHit,'the whole explicitly focused first action must be visible and hittable inside the panel: '+JSON.stringify(shortOpened));assert(shortOpened.trigger.hit,'short panel must retain the settings trigger');assert.equal(shortOpened.activeKey,'查找已知项目与聊天');assert.equal(shortOpened.query,shortBefore.query);
    await page.locator('section[aria-label="工作空间设置"]').evaluate(panel=>{panel.scrollTop=panel.scrollHeight;});const short=await measure(page);entry.stages.push({stage:prefix+'-settings-at-bottom',...short});await capture(prefix+'-bottom');
    assert(within(short.closeAction.rect,short.workspace)&&within(short.closeAction.rect,short.panel)&&short.closeAction.hit,'the whole close button must be visible and hittable inside the panel at its scroll end: '+JSON.stringify(short));retained(shortBefore,short);
    await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.locator('section[aria-label="工作空间设置"]').waitFor({state:'detached'});await settle(page);const shortClosed=await measure(page);entry.stages.push({stage:prefix+'-closed',...shortClosed});retained(shortBefore,shortClosed);assert.equal(shortClosed.activeKey,'workspace-settings');assert.equal(shortClosed.query,shortBefore.query);
    boundary.outcome='PASS';
   }
   await page.setViewportSize({width,height});await settle(page);assert.equal((await measure(page)).query,'Continuous chat 03');
  }
  await page.getByRole('button',{name:'关闭已知查找',exact:true}).click();await page.locator('.search').waitFor({state:'detached'});await settle(page);const returned=await measure(page);entry.stages.push({stage:'returned-from-search',...returned});retained(baseline,returned);await capture('returned');entry.status='PASS';
 }catch(error){entry.status='FAIL';entry.error=String(error);for(const boundary of report.shortFrameBoundaries)if(boundary.outcome==='RUNNING'){boundary.outcome='FAIL';boundary.error=String(error);}entry.failure=await measure(page).catch(()=>null);await capture('failure').catch(()=>{});throw error;}
 finally{await page.evaluate(()=>settingsFixture?.navigation.stop()).catch(()=>{});await context.close();await persist();t.diagnostic(JSON.stringify({id,evidence:'WEB_MECHANISM_ONLY',MV3:'NOT_RUN',realChatGPT:'NOT_RUN',status:entry.status,report:join(directory,'report.json')}));}
});

const localAssetNote='请在浏览器工具栏打开 VAIWL，确认本地空间后再管理片段、备份或恢复。';
async function measureRamGuidance(page){return page.evaluate(()=>{
 const shadow=settingsFixture.navigation.roots().workspace.shadow,panel=shadow.querySelector('section[aria-label="工作空间设置"]'),note=panel?.querySelector('#vaiwl-local-assets-note');
 const box=r=>({x:r.x,y:r.y,width:r.width,height:r.height}),range=document.createRange();if(note)range.selectNodeContents(note);
 const lines=note?[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>({...box(r),hit:shadow.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===note})):[];
 const tabStops=panel?[...panel.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),a[href]')].map(n=>({key:n.dataset.focusKey??null,tag:n.tagName,label:n.getAttribute('aria-label')??n.textContent,active:shadow.activeElement===n})):[];
 return {note:note?{text:note.textContent,rect:box(note.getBoundingClientRect()),lines}:null,controls:['已保存片段','备份与导入','本地数据恢复'].map(label=>{const n=[...panel?.querySelectorAll('button')??[]].find(n=>n.getAttribute('aria-label')===label);return {label,present:!!n,disabled:n?.disabled??false,describedBy:n?.getAttribute('aria-describedby')??null};}),tabStops,assetCalls:[...settingsFixture.assetCalls],activeDisabled:shadow.activeElement?.disabled??false};
});}
function guardedRamGuidance(value){
 assert.deepEqual(value.controls.map(c=>[c.label,c.present,c.disabled,c.describedBy]),[['已保存片段',true,true,'vaiwl-local-assets-note'],['备份与导入',true,true,'vaiwl-local-assets-note'],['本地数据恢复',true,true,'vaiwl-local-assets-note']]);
 assert.equal(value.note?.text,localAssetNote);assert(value.note.lines.length>1,'the new explanation must wrap at this narrow width');assert.deepEqual(value.assetCalls,[],'disabled local-asset controls must not reach either callback');
}
async function scrollGuidanceLine(page,edge){await page.evaluate(edge=>{
 const shadow=settingsFixture.navigation.roots().workspace.shadow,panel=shadow.querySelector('section[aria-label="工作空间设置"]'),note=panel.querySelector('#vaiwl-local-assets-note'),range=document.createRange();range.selectNodeContents(note);
 const lines=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0),rect=panel.getBoundingClientRect();
 // A long paragraph need not fit in an admitted 96px-high frame at once.
 // Check its first and last line with two bounded positions in the same
 // existing scrollport; never enlarge the production panel or retry focus.
 panel.scrollTop+=edge==='first'?lines[0].top-(rect.top+panel.clientTop+6):lines.at(-1).bottom-(rect.bottom-panel.clientTop-6);
},edge);await settle(page);}

for(const {width,height,colorScheme}of ramCases)test(`RAM guidance ${width}x${height} ${colorScheme}: disabled actions, wrapping, scroll, Tab and Escape`,{timeout:20000},async t=>{
 const context=await browser.newContext({viewport:{width,height},colorScheme});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(5000);const id=`ram-${width}-${height}-${colorScheme}`,entry={id,status:'RUNNING',localAssetAccess:'confirmation-required',stages:[],screenshots:[]};report.ramGuidanceCases.push(entry);
 const capture=async label=>{const path=join(directory,id+'-'+label+'.png');await page.screenshot({path});entry.screenshots.push({label,path,sha256:hash(await readFile(path))});};
 try{
  await initialize(page,colorScheme,'confirmation-required');await settle(page);const home=await measure(page);entry.stages.push({stage:'home-deep-scroll',...home});
  await page.getByRole('button',{name:'工作空间设置',exact:true}).click();await settle(page);const opened=await measure(page),initial=await measureRamGuidance(page);entry.stages.push({stage:'home-settings-open',...opened,guidance:initial});await capture('home-open');
  retained(home,opened);assert(within(opened.panel,opened.workspace));assert(within(opened.firstActionRect,opened.panel)&&opened.firstActionHit);assert.equal(opened.activeKey,'查找已知项目与聊天');guardedRamGuidance(initial);
  // HTMLElement.click respects disabled controls; no synthetic dispatch or
  // programmatic enabling is used to manufacture a successful refusal.
  await page.locator('section[aria-label="工作空间设置"] button[disabled]').evaluateAll(nodes=>nodes.forEach(n=>n.click()));
  entry.tabOrder=[];for(let i=1;i<initial.tabStops.length;i++){
   await page.keyboard.press('Tab');const current=await measureRamGuidance(page),active=current.tabStops.find(n=>n.active);entry.tabOrder.push(active??null);
   assert.deepEqual(active,{...initial.tabStops[i],active:true},'Tab must visit each enabled settings control in DOM order, skipping the three disabled local-asset actions');assert.equal(current.activeDisabled,false);assert.deepEqual(current.assetCalls,[]);
  }
  const tabbed=await measure(page);entry.stages.push({stage:'home-tabbed-to-close',...tabbed,guidance:await measureRamGuidance(page)});retained(home,tabbed);assert.equal(tabbed.activeKey,'关闭设置');assert(within(tabbed.closeAction.rect,tabbed.panel)&&tabbed.closeAction.hit);await capture('home-tabbed-close');
  await page.keyboard.press('Escape');await page.locator('section[aria-label="工作空间设置"]').waitFor({state:'detached'});await settle(page);const escaped=await measure(page);retained(home,escaped);assert.equal(escaped.activeKey,'workspace-settings');entry.stages.push({stage:'home-escaped',...escaped});
  await page.getByRole('button',{name:'工作空间设置',exact:true}).click();await page.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();const input=page.getByRole('searchbox',{name:'已知聊天查找输入',exact:true});await input.waitFor();
  await input.fill('Continuous chat 03');await page.waitForFunction(()=>settingsFixture.calls.at(-1)?.search?.query==='Continuous chat 03');await settle(page);await input.evaluate(n=>n.setSelectionRange(2,7));await page.evaluate(()=>settingsFixture.refresh());await settle(page);
  const search=await measure(page);entry.stages.push({stage:'search-before-settings',...search});assert.equal(search.query,'Continuous chat 03');assert.equal(search.activeKey,'search-input');assert.equal(search.selectionStart,2);assert.equal(search.selectionEnd,7);
  await page.getByRole('button',{name:'工作空间设置',exact:true}).click();await settle(page);const searchOpen=await measure(page);retained(search,searchOpen);assert(within(searchOpen.panel,searchOpen.workspace));assert.equal(searchOpen.query,search.query);guardedRamGuidance(await measureRamGuidance(page));
  for(const edge of ['first','last']){
   await scrollGuidanceLine(page,edge);const state=await measure(page),guidance=await measureRamGuidance(page),line=edge==='first'?guidance.note.lines[0]:guidance.note.lines.at(-1);entry.stages.push({stage:`search-guidance-${edge}-line`,...state,guidance});await capture(`search-guidance-${edge}`);
   retained(search,state);assert.equal(state.query,search.query);assert(within(state.panel,state.workspace));guardedRamGuidance(guidance);
   assert(guidance.note.lines.every(r=>r.x>=state.panel.x&&r.x+r.width<=state.panel.x+state.panel.width),'no explanation line may require horizontal scrolling');assert(within(line,state.panel)&&within(line,state.workspace)&&line.hit,'the selected explanation line must be fully visible and hit-tested inside the existing panel scrollport');
  }
  await page.locator('section[aria-label="工作空间设置"]').evaluate(panel=>{panel.scrollTop=panel.scrollHeight;});await settle(page);const bottom=await measure(page);entry.stages.push({stage:'search-settings-bottom',...bottom,guidance:await measureRamGuidance(page)});await capture('search-bottom');retained(search,bottom);assert(within(bottom.closeAction.rect,bottom.panel)&&within(bottom.closeAction.rect,bottom.workspace)&&bottom.closeAction.hit);
  await page.keyboard.press('Escape');await page.locator('section[aria-label="工作空间设置"]').waitFor({state:'detached'});await settle(page);const searchEscaped=await measure(page);entry.stages.push({stage:'search-escaped',...searchEscaped});retained(search,searchEscaped);assert.equal(searchEscaped.activeKey,'workspace-settings');assert.equal(searchEscaped.query,search.query);assert.deepEqual(await page.evaluate(()=>settingsFixture.assetCalls),[]);
  await page.getByRole('button',{name:'关闭已知查找',exact:true}).click();await page.locator('.search').waitFor({state:'detached'});await settle(page);const returned=await measure(page);entry.stages.push({stage:'home-returned',...returned});retained(home,returned);entry.status='PASS';
 }catch(error){entry.status='FAIL';entry.error=String(error);entry.failure=await measure(page).catch(()=>null);entry.guidanceFailure=await measureRamGuidance(page).catch(()=>null);await capture('failure').catch(()=>{});throw error;}
 finally{await page.evaluate(()=>settingsFixture?.navigation.stop()).catch(()=>{});await context.close();await persist();t.diagnostic(JSON.stringify({id,evidence:'WEB_MECHANISM_ONLY',MV3:'NOT_RUN',realChatGPT:'NOT_RUN',status:entry.status,report:join(directory,'report.json')}));}
});

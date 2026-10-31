import {installWindowNavigationObserver,createWindowNavigationTraceRecorder} from './window-navigation-observer.mjs';
import {probeNavigationCancellation} from './navigation-cancel-browser-probe.mjs';
import {observeWindowScroll,readCurrentWindowScroll} from './window-scroll-observer.mjs';
/** Opt-in S: actual MV3 buttons, application-owned offline world, no DB seeds. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createHostScaleServer} from './fixtures/host-scale-server.mjs';
import {waitHostScaleSurfaces,hostScaleFailureFacts} from './fixtures/host-scale-surfaces.mjs';
import {waitHostScaleMemberProgress} from './fixtures/host-scale-member-progress.mjs';
import {cleanupHostScaleRun} from './fixtures/host-scale-cleanup.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
const output=process.argv[2]??join(tmpdir(),'vaiwl-frame-window-retention.json');
const report={status:'NOT_RUN',acceptance:'NOT_ESTABLISHED',realChatGPT:'NOT_RUN',backend:'document-flow',sidebarMode:'NATIVE_RETAINED',formalSidebar:'NOT_RUN_NATIVE_SIDEBAR_RETAINED',pages:[],errors:[]};
if(process.env.FREE_WINDOW_RETENTION_RUN!=='1'){await writeFile(output,JSON.stringify(report));}
else{
 let server,context,browserHandle,networkGuard,directory,manifest,manifestPath,manifestHash,page,extensionId,activeResult,browserLaunchAttempted=false;
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const sources=['window-navigation-observer.mjs','navigation-cancel-browser-probe.mjs','window-scroll-observer.mjs','frame-window-retention-package-browser.mjs','fixtures/host-scale-server.mjs','fixtures/host-scale-world.mjs','fixtures/native.mjs','fixtures/native.css','fixtures/legacy.html','fixtures/host-scale-surfaces.mjs','fixtures/host-scale-member-progress.mjs','fixtures/host-scale-cleanup.mjs','native-visibility-browser.mjs','historical-network-guard.mjs'];
 report.fixtureSourceHashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
 try{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
  server=await createHostScaleServer({size:1000,distribution:'project-mixed',cpuRate:1,longTitles:false});
  directory=await mkdtemp(join(tmpdir(),'vaiwl-window-retention-'));const built=packageHost(join(directory,'package'),{offlineOrigin:server.origin});
  assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
  manifestPath=join(built.unpacked,'build-manifest.json');const bytes=await readFile(manifestPath);manifest=JSON.parse(bytes);manifestHash=hash(bytes);report.sourceHashes=manifest.sourceHashes;
  const permissions=JSON.parse(await readFile(join(built.unpacked,'manifest.json')));assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*']);assert.equal(permissions.content_security_policy.extension_pages,`script-src 'self'; object-src 'none'; connect-src ${server.origin}`);
  networkGuard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});browserLaunchAttempted=true;
  browserHandle=await launchNativeVisibilityBrowser({chromium,profileDir:join(directory,'profile'),headed:false,historicalNetworkGuard:networkGuard.config,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  context=browserHandle.context;context.setDefaultTimeout(6000);report.browserVersion=context.browser().version();report.browserPrecondition=browserHandle.diagnostic;report.package=built;report.viewports=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===server.origin||u.protocol==='chrome-extension:'?route.continue():route.abort();});
  // Bounded passive chronology of the synthetic fixture only; no payload
  // rewriting, private profile, native response body, waits or action replay.
  report.trace=[];report.traceDropped=0;
  await context.exposeBinding('observeWindowReturn',createWindowNavigationTraceRecorder(report));
  await context.addInitScript(installWindowNavigationObserver);
  const cdp=await context.browser().newBrowserCDPSession();extensionId=(await cdp.send('Extensions.loadUnpacked',{path:built.unpacked})).id;
  page=await context.newPage();await page.setViewportSize({width:1440,height:900});report.viewports.push(await page.evaluate(()=>({width:innerWidth,height:innerHeight})));page.on('pageerror',e=>report.errors.push(e.message));
  report.phase='initial';await page.goto(server.url);await waitHostScaleSurfaces(page,{extensionId,backend:'document-flow',sidebarMode:'NATIVE_RETAINED'});
  await page.locator('textarea').focus();
  const project='g-p-00000000000000000000000000000001',path='/g/'+project+'/project';
  await page.locator(`aside section[aria-label="Projects"] a[href="${path}"]`).click();await page.waitForURL(server.origin+path);
  await page.waitForFunction(()=>document.querySelectorAll('#reading nav[aria-label="Project conversations"] a').length===80);
  const nativeProjectMemberIds=await page.locator('#reading nav[aria-label="Project conversations"] a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname.split('/').at(-1)));
  assert.equal(new Set(nativeProjectMemberIds).size,80);report.nativeProjectMemberIds=nativeProjectMemberIds;
  await page.evaluate(()=>{globalThis.paginationEditor=document.querySelector('textarea');globalThis.paginationDocument=document;paginationEditor.value='preserved pagination draft';});
  report.phase='native-member-progress';report.memberProgress=await waitHostScaleMemberProgress({page,extensionId,url:server.origin+path,projectId:project,id:'60000000-0000-4000-8000-000000000062',deadline:performance.now()+30000});
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();let [workspace]=await waitHostScaleSurfaces(page,{extensionId,backend:'document-flow',sidebarMode:'NATIVE_RETAINED'});
  const started=performance.now();report.phase='expand-project';
  let projectList=workspace.locator(`.card[data-theme-id="${project}"] .members`),unknown=workspace.locator('section[data-free-list="unknown"]');
  const ids=loc=>loc.locator('a[data-ref-id]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-ref-id')));
  async function memberPartitions(){return workspace.evaluate(project=>{
   const roots=[document];for(let i=0;i<roots.length;i++)for(const n of roots[i].querySelectorAll('*'))if(n.shadowRoot)roots.push(n.shadowRoot);
   const containers=roots.flatMap(r=>[...r.querySelectorAll(`.card[data-theme-id="${project}"] .members`)]),members=containers[0],standalone=roots.flatMap(r=>[...r.querySelectorAll('section[data-free-list="unknown"]')]),out={project,memberContainerCount:containers.length,standaloneContainerCount:standalone.length,current:[],old:[],known:[],all:[],duplicates:[],standaloneUnknown:[]};
   for(const a of members?.querySelectorAll('a[data-ref-id]')??[]){const id=a.getAttribute('data-ref-id');out.all.push(id);out[a.closest('.undated-members')?'known':a.closest('.old-list')?'old':'current'].push(id);}
   out.duplicates=out.all.filter((id,i)=>out.all.indexOf(id)!==i);
   out.standaloneUnknown=[...(standalone[0]?.querySelectorAll('a[data-ref-id]')??[])].map(a=>a.getAttribute('data-ref-id'));return out;
  },project);}
  async function verifyExpandedMembers(promoted){
   try{await workspace.waitForFunction(({project,currentCount})=>{
    const roots=[document];for(let i=0;i<roots.length;i++)for(const n of roots[i].querySelectorAll('*'))if(n.shadowRoot)roots.push(n.shadowRoot);
    const members=roots.map(r=>r.querySelector(`.card[data-theme-id="${project}"] .members`)).find(Boolean);if(!members)return false;const rows=[...members.querySelectorAll('a[data-ref-id]')];
    return rows.filter(a=>a.closest('.undated-members')).length===17&&rows.filter(a=>a.closest('.old-list')).length===0&&rows.filter(a=>!a.closest('.undated-members,.old-list')).length===currentCount;
   },{project,currentCount:promoted.length},{timeout:6000});}finally{report.memberPartitions??=[];report.memberPartitions.push({phase:report.phase,...await memberPartitions()});}
   const current=report.memberPartitions.at(-1),remaining=first.filter(id=>!promoted.includes(id));
   // Confirmed native use promotes only the clicked reference. Its old unknown
   // slot is filled normally, while the expanded unknown window stays exactly 17.
   assert.equal(current.memberContainerCount,1);assert.equal(current.standaloneContainerCount,1);assert.deepEqual(current.current,promoted);assert.deepEqual(current.old,[]);assert.equal(current.known.length,17);assert.equal(current.all.length,17+promoted.length);assert.deepEqual(current.duplicates,[]);
   assert(current.all.every(id=>nativeProjectMemberIds.includes(id)),'every displayed member retains its observed native project');
   assert.deepEqual(current.known.slice(0,remaining.length),remaining,'unpromoted original members retain their relative order');
   assert.deepEqual(current.all.filter(id=>first.includes(id)),[...promoted,...remaining],'all original 17 remain reachable with only confirmed-use promotion');
   assert.deepEqual(current.standaloneUnknown,second);assert(!current.all.some(id=>second.includes(id)),'project and standalone unknown remain disjoint');return current;
  }
  // Observe the entire close-search return, not an arbitrary cross-process
  // task. Every drawable complete main page must retain its prior position;
  // a later correct frame can never erase an earlier visible scroll failure.
  async function startMainReturnPaintWindow(expectedScroll,promoted,deadline){
   await workspace.evaluate(({expectedScroll,promoted,project,original,standalone,nativeMembers,timeout})=>{
    const stamp=()=>performance.timeOrigin+performance.now(),same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]),remaining=original.filter(id=>!promoted.includes(id));
    const nodeIds=new WeakMap();let nextNodeId=0,raf,timer,resolve,finished=false,finishRequested=false,previousNode=null,previousSample=null;
    const evidence={status:'OBSERVING',expectedScroll,startedAt:stamp(),deadlineMs:timeout,samples:[]},promise=new Promise(done=>{resolve=done;});
    const read=()=>({...evidence,samples:[...evidence.samples]});
    function finish(status){if(finished)return;finished=true;cancelAnimationFrame(raf);clearTimeout(timer);evidence.status=status;evidence.finishedAt=stamp();resolve(read());}
    function paint(time){
     if(finished)return;
     const roots=[document];for(let i=0;i<roots.length;i++)for(const n of roots[i].querySelectorAll('*'))if(n.shadowRoot)roots.push(n.shadowRoot);
     const pages=roots.flatMap(r=>[...r.querySelectorAll('.workspace')]).filter(n=>n.isConnected),page=pages.length===1?pages[0]:null;
     const containers=roots.flatMap(r=>[...r.querySelectorAll(`.card[data-theme-id="${project}"] .members`)]),unknown=roots.flatMap(r=>[...r.querySelectorAll('section[data-free-list="unknown"]')]);
     const parts={current:[],old:[],known:[],all:[],standaloneUnknown:[]};
     for(const a of containers[0]?.querySelectorAll('a[data-ref-id]')??[]){const id=a.getAttribute('data-ref-id');parts.all.push(id);parts[a.closest('.undated-members')?'known':a.closest('.old-list')?'old':'current'].push(id);}
     parts.standaloneUnknown=[...(unknown[0]?.querySelectorAll('a[data-ref-id]')??[])].map(a=>a.getAttribute('data-ref-id'));
     const complete=!!page&&!page.querySelector('.search,.working-set')&&containers.length===1&&unknown.length===1&&page.contains(containers[0])&&page.contains(unknown[0])&&same(parts.current,promoted)&&parts.old.length===0&&parts.known.length===17&&parts.all.length===17+promoted.length&&new Set(parts.all).size===parts.all.length&&parts.all.every(id=>nativeMembers.includes(id))&&same(parts.known.slice(0,remaining.length),remaining)&&same(parts.all.filter(id=>original.includes(id)),[...promoted,...remaining])&&same(parts.standaloneUnknown,standalone)&&!parts.all.some(id=>standalone.includes(id));
     if(page&&!nodeIds.has(page))nodeIds.set(page,++nextNodeId);
     const rect=page?.getBoundingClientRect(),style=page&&getComputedStyle(page),visible=!!page&&document.visibilityState==='visible'&&rect.width>0&&rect.height>0&&page.clientHeight>0&&style.display!=='none'&&style.visibility==='visible';
     const sample={at:stamp(),paintAt:performance.timeOrigin+time,nodeId:page?nodeIds.get(page):null,currentPageCount:pages.length,connected:!!page?.isConnected,visible,complete,top:page?.scrollTop??null,height:page?.clientHeight??null,total:page?.scrollHeight??null,rect:rect?.toJSON()??null,memberContainerCount:containers.length,standaloneContainerCount:unknown.length,partitions:parts};
     evidence.samples.push(sample);
     if(visible&&complete&&sample.top!==expectedScroll){evidence.violation=sample;finish('FAIL_VISIBLE_COMPLETE_SCROLL');return;}
     const valid=visible&&complete&&sample.top===expectedScroll;
     if(finishRequested&&valid&&previousNode===page&&previousSample?.visible&&previousSample.complete&&previousSample.top===expectedScroll&&sample.paintAt>previousSample.paintAt){evidence.finalPair=[previousSample,sample];finish('PASS_PAINT_WINDOW');return;}
     previousNode=valid?page:null;previousSample=sample;
     if(evidence.samples.length>=512){finish('FAIL_PAINT_SAMPLE_CAP');return;}
     raf=requestAnimationFrame(paint);
    }
    globalThis.vaiwlMainReturnPaint={read,finish:()=>{if(!finished){finishRequested=true;evidence.finishRequestedAt=stamp();previousNode=null;previousSample=null;}return promise;}};
    timer=setTimeout(()=>finish('FAIL_PAINT_WINDOW_DEADLINE'),timeout);raf=requestAnimationFrame(paint);
   },{expectedScroll,promoted,project,original:first,standalone:second,nativeMembers:nativeProjectMemberIds,timeout:Math.max(1,deadline-performance.now())});
  }
  async function finishMainReturnPaintWindow(deadline){
   let timer;try{return await Promise.race([workspace.evaluate(()=>globalThis.vaiwlMainReturnPaint.finish()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('main-return-paint-window-deadline')),Math.max(1,deadline-performance.now()));})]);}finally{clearTimeout(timer);}
  }
  async function waitRows(selector,count){try{await workspace.waitForFunction(({selector,count})=>{const roots=[document];for(let i=0;i<roots.length;i++)for(const n of roots[i].querySelectorAll('*'))if(n.shadowRoot)roots.push(n.shadowRoot);const list=roots.map(r=>r.querySelector(selector)).find(Boolean);return list?.querySelectorAll('a[data-ref-id]').length===count;},{selector,count},{timeout:6000});}catch(error){report.rowFailure={phase:report.phase,selector,expected:count,actual:await workspace.locator(selector+' a[data-ref-id]').count()};throw error;}}
  const searchControlRemaining=deadline=>{const remaining=deadline-performance.now();assert(remaining>0,'search control must become usable in its original six-second window');return remaining;};
  async function firstEnabledSearchControl(locator,deadline){
   const observation={phase:report.phase,budgetMs:6000,samples:0,first:null,last:null,firstEnabled:null};(report.searchControlReadiness??=[]).push(observation);
   while(performance.now()<deadline){
    const sample=await locator.evaluateAll(nodes=>{if(nodes.length!==1)return {count:nodes.length};const n=nodes[0],rect=n.getBoundingClientRect(),style=getComputedStyle(n);return {count:1,observedAt:performance.timeOrigin+performance.now(),ownerDocument:n.ownerDocument===document,connected:n.isConnected,visible:rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility==='visible',href:n.getAttribute('href'),target:n.getAttribute('target'),delegated:n.hasAttribute('data-native-plan-control'),planControl:n.getAttribute('data-native-plan-control'),ariaDisabled:n.getAttribute('aria-disabled'),reason:n.getAttribute('data-navigation-reason')};});
    observation.samples++;observation.first??=sample;observation.last=sample;assert(sample.count<=1,'exact search result must not be duplicated');
    if(sample.count===1&&sample.ownerDocument&&sample.connected&&sample.visible&&sample.ariaDisabled!=='true'){observation.firstEnabled=sample;searchControlRemaining(deadline);return sample;}
    await new Promise(resolve=>setTimeout(resolve,Math.min(10,searchControlRemaining(deadline))));
   }
   throw Error('search-control-original-six-second-window');
  }
  report.projectRowsBeforeClick??=[];report.projectRowsBeforeClick.push({phase:report.phase,count:await projectList.locator('a[data-ref-id]').count()});
  await projectList.getByRole('button',{name:'显示更多已知聊天',exact:true}).click();await waitRows(`.card[data-theme-id="${project}"] .members`,17);const first=await ids(projectList);
  report.phase='expand-unknown';await unknown.getByRole('button',{name:'其他已知聊天',exact:true}).click();await unknown.getByRole('button',{name:'显示更多其他已知聊天',exact:true}).click();await waitRows('section[data-free-list="unknown"]',17);assert.deepEqual(await ids(projectList),first);const second=await ids(unknown);
  assert.equal(new Set(first).size,17);assert.equal(new Set(second).size,17);assert(!first.some(id=>second.includes(id)));
  report.memberPartitions=[{phase:report.phase,...await memberPartitions()}];assert.equal(report.memberPartitions[0].memberContainerCount,1);assert.equal(report.memberPartitions[0].standaloneContainerCount,1);assert.deepEqual(report.memberPartitions[0].current,[]);assert.deepEqual(report.memberPartitions[0].old,[]);assert.deepEqual(report.memberPartitions[0].known,first);
  report.phase='reading-return';await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await waitHostScaleSurfaces(page,{extensionId,backend:'document-flow',sidebarMode:'NATIVE_RETAINED'});
  assert.deepEqual(await ids(projectList),first);assert.deepEqual(await ids(unknown),second);
  // Use the real search surface and its issued native link, then the one return.
  // Reading refreshes must not overwrite the expanded card descriptors with
  // special-page defaults; the returned rows are read again from the owner.
  assert(await page.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved pagination draft'));assert.equal(page.url(),server.origin+path);
  const originalPage=page;
  // A separate local document starts at the target; neither journey clears a
  // native draft to obtain an easier navigation plan.
  report.phase='search-native-return';page=await context.newPage();await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/c/'+first[0]);[workspace]=await waitHostScaleSurfaces(page,{extensionId,backend:'document-flow',sidebarMode:'NATIVE_RETAINED'});
  await page.evaluate(()=>{globalThis.paginationEditor=document.querySelector('textarea');globalThis.paginationDocument=document;paginationEditor.value='preserved search draft';});
  projectList=workspace.locator(`.card[data-theme-id="${project}"] .members`);unknown=workspace.locator('section[data-free-list="unknown"]');
  report.projectRowsBeforeClick??=[];report.projectRowsBeforeClick.push({phase:report.phase,count:await projectList.locator('a[data-ref-id]').count()});
  // New documents restore the existing scope presentation; another more click would expand 17 to 29.
  await waitRows(`.card[data-theme-id="${project}"] .members`,17);
  await waitRows('section[data-free-list="unknown"]',17);
  const title=await projectList.locator('a[data-ref-id]').first().locator('.window-title').innerText();
  const scrollProbe=await workspace.evaluate(observeWindowScroll);report.scrollProbe=scrollProbe;const mainScroll=scrollProbe.after?.top;assert(scrollProbe.after?.connected&&mainScroll>0,'actual main workspace must be scrollable');assert.equal(mainScroll,scrollProbe.assigned.top,'current viewport must preserve the single scroll gesture');report.mainScrollBeforeSearch=mainScroll;
  const searchEntry=async()=>{await workspace.getByRole('button',{name:'工作空间设置',exact:true}).click();await workspace.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();};
  await searchEntry();
  let searchControlDeadline=performance.now()+6000;
  await workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).fill(title,{timeout:searchControlRemaining(searchControlDeadline)});
  const result=workspace.locator(`.search-results a[data-ref-id="${first[0]}"]`);activeResult=result;await result.waitFor({timeout:searchControlRemaining(searchControlDeadline)});report.searchControlBeforeCancellation=await result.evaluate(n=>({href:n.getAttribute('href'),target:n.getAttribute('target'),delegated:n.hasAttribute('data-native-plan-control'),planControl:n.getAttribute('data-native-plan-control'),disabled:n.getAttribute('aria-disabled'),connected:n.isConnected}));
  if(process.env.FREE_NAVIGATION_CANCEL_RUN==='1'||process.env.FREE_PANEL_CANCEL_RUN==='1'){
   report.cancellation=await probeNavigationCancellation({context,page,workspace,result,extensionId,trace:report.trace,title,intent:process.env.FREE_PANEL_CANCEL_RUN==='1'?'panel':'query',diagnostics:report.cancellationDiagnostics={}});
   searchControlDeadline=performance.now()+6000;
   await workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).fill(title,{timeout:searchControlRemaining(searchControlDeadline)});
  }
  // VIEW can render a disabled row before its separate NAVIGATION_PLANS reply.
  // Take the first enabled control, even if wrong: never wait for a preferred
  // href or delegation mode, and never repeat the query or navigation gesture.
  const control=await firstEnabledSearchControl(result,searchControlDeadline),target=control.href,pageCount=context.pages().length;
  report.searchClick={pageCount,control};assert.equal(target,page.url());assert.equal(control.delegated,true,'same-target navigation requires an issued delegated control');
  await result.click();
  await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await waitHostScaleSurfaces(page,{extensionId,backend:'document-flow',sidebarMode:'NATIVE_RETAINED'});
  assert.equal(await workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).inputValue(),title,'same-document return retains the search route');
  await result.waitFor();const returnPaintDeadline=performance.now()+6000;await startMainReturnPaintWindow(mainScroll,[first[0]],returnPaintDeadline);
  await workspace.getByRole('button',{name:'关闭已知查找',exact:true}).click({timeout:Math.max(1,returnPaintDeadline-performance.now())});
  await waitRows('section[data-free-list="unknown"]',17);const afterSameTarget=await verifyExpandedMembers([first[0]]);
  assert.equal(context.pages().length,pageCount);assert(await originalPage.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved pagination draft'));
  // Retain the old immediate CDP observation as diagnostic evidence. It may
  // land between a parent reading probe and the first drawable restoration.
  // The paint window has already observed every complete visible main page.
  report.returnScrollProbe=await workspace.evaluate(readCurrentWindowScroll);
  report.returnScrollPaintWindow=await finishMainReturnPaintWindow(returnPaintDeadline);
  assert.equal(report.returnScrollPaintWindow.status,'PASS_PAINT_WINDOW','every visible complete main page must retain its prior scroll');
  const finalPaints=report.returnScrollPaintWindow.finalPair;
  assert.equal(finalPaints.length,2);assert.equal(finalPaints[0].nodeId,finalPaints[1].nodeId);assert(finalPaints.every(p=>p.connected&&p.visible&&p.complete&&p.height>0));
  report.mainScrollAfterSearch=finalPaints[1].top;assert.equal(report.mainScrollAfterSearch,mainScroll,'search/read/return retains main scroll');
  report.searchReturn={alreadyCurrentOriginalTarget:true,uniqueReturn:true,projectRows:afterSameTarget.all.length,projectKnownRows:17,confirmedUsePromoted:[first[0]],unknownRows:17,originalProjectDraftPreserved:true};
  assert(await page.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved search draft'));assert.equal(page.url(),target);assert.deepEqual(report.errors,[]);
  // Different-target native SPA navigation must also retain the same bounded
  // presentation state across a fresh binding/frame. Keep both prior drafts.
  const currentDraftPage=page;report.phase='search-different-target-return';page=await context.newPage();await page.setViewportSize({width:1440,height:900});
  await page.goto(server.origin+'/c/'+first[0]);[workspace]=await waitHostScaleSurfaces(page,{extensionId,backend:'document-flow',sidebarMode:'NATIVE_RETAINED'});
  await page.evaluate(()=>{globalThis.paginationEditor=document.querySelector('textarea');globalThis.paginationDocument=document;});
  assert.equal(await page.locator('textarea').inputValue(),'');
  projectList=workspace.locator(`.card[data-theme-id="${project}"] .members`);unknown=workspace.locator('section[data-free-list="unknown"]');
  report.projectRowsBeforeClick??=[];report.projectRowsBeforeClick.push({phase:report.phase,count:await projectList.locator('a[data-ref-id]').count()});
  // New documents restore the existing scope presentation; another more click would expand 17 to 29.
  await waitRows('section[data-free-list="unknown"]',17);await verifyExpandedMembers([first[0]]);
  const otherTitle=await projectList.locator(`a[data-ref-id="${first[1]}"] .window-title`).innerText();
  await searchEntry();
  let otherControlDeadline=performance.now()+6000;
  await workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).fill(otherTitle,{timeout:searchControlRemaining(otherControlDeadline)});
  const otherResult=workspace.locator(`.search-results a[data-ref-id="${first[1]}"]`);activeResult=otherResult;await otherResult.waitFor({timeout:searchControlRemaining(otherControlDeadline)});
  if(process.env.FREE_NAVIGATION_CANCEL_RUN==='1'||process.env.FREE_PANEL_CANCEL_RUN==='1'){
   const beforeCancelNavigate=server.snapshot().actions.navigate??0;
   report.returnCancellation=await probeNavigationCancellation({context,page,workspace,result:otherResult,extensionId,trace:report.trace,title:otherTitle,intent:'return',draft:'',dispatchType:'HOST_UI_DISPATCH_NATIVE',diagnostics:report.returnCancellationDiagnostics={}});
   assert.equal(server.snapshot().actions.navigate??0,beforeCancelNavigate,'return cancellation must prevent the original native click');
   await searchEntry();
   otherControlDeadline=performance.now()+6000;
   await workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).fill(otherTitle,{timeout:searchControlRemaining(otherControlDeadline)});
  }
  const otherControl=await firstEnabledSearchControl(otherResult,otherControlDeadline),otherTarget=otherControl.href;report.differentTargetControl=otherControl;
  assert.equal(otherTarget,server.origin+'/c/'+first[1]);assert.notEqual(otherTarget,page.url());assert.equal(otherControl.delegated,true,'different-target native navigation requires an issued delegated control');
  const nativeBefore=server.snapshot().actions.navigate??0,pagesBefore=context.pages().length,previousFrame=workspace;
  await otherResult.click();await page.waitForURL(otherTarget);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);
  await page.getByRole('button',{name:'返回工作空间',exact:true}).click();[workspace]=await waitHostScaleSurfaces(page,{extensionId,backend:'document-flow',sidebarMode:'NATIVE_RETAINED'});
  assert.equal(await workspace.getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).inputValue(),otherTitle,'new binding return retains the saved search route');
  await workspace.locator(`.search-results a[data-ref-id="${first[1]}"]`).waitFor();await workspace.getByRole('button',{name:'关闭已知查找',exact:true}).click();
  projectList=workspace.locator(`.card[data-theme-id="${project}"] .members`);unknown=workspace.locator('section[data-free-list="unknown"]');
  await waitRows('section[data-free-list="unknown"]',17);const afterDifferentTarget=await verifyExpandedMembers([first[1],first[0]]);
  assert.equal(context.pages().length,pagesBefore);assert.equal(server.snapshot().actions.navigate,nativeBefore+1);
  assert(await page.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value===''));
  assert(await currentDraftPage.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved search draft'));
  assert(await originalPage.evaluate(()=>document===paginationDocument&&document.querySelector('textarea')===paginationEditor&&paginationEditor.value==='preserved pagination draft'));
  assert.notEqual(workspace,previousFrame);assert.equal(previousFrame.isDetached(),true);
  report.differentTargetReturn={nativeTargetOnce:true,uniqueReturn:true,projectRows:afterDifferentTarget.all.length,projectKnownRows:17,confirmedUsePromoted:[first[1],first[0]],unknownRows:17,newFrame:workspace!==previousFrame,oldFrameDetached:previousFrame.isDetached(),originalDocumentsEditorsDrafts:true};
  report.status='PASS_OFFLINE_MV3_WINDOW_RETENTION';report.acceptance='PARTIAL_S_NOT_FREE_ACCEPTED';report.journey={projectRows:first.length,unknownRows:second.length,readingReturn:true,originalDocumentEditorDraft:true,elapsedMs:performance.now()-started};report.scaleAcceptance='NOT_RUN_1K_FIXTURE_FUNCTIONAL_SUBCHAIN_ONLY';

 }catch(error){report.status=context?'FAIL':'NOT_RUN_STARTUP';report.error=error.stack;report.pagesAtFailure=context?.pages().length??null;report.failure=await hostScaleFailureFacts(page).catch(e=>({error:e.message}));try{report.returnScrollPaintWindow??=await activeResult?.evaluateAll(()=>globalThis.vaiwlMainReturnPaint?.read()??null);report.searchControlAtFailure=await activeResult?.evaluateAll(nodes=>nodes.length===1?{href:nodes[0].getAttribute('href'),target:nodes[0].getAttribute('target'),delegated:nodes[0].hasAttribute('data-native-plan-control'),planControl:nodes[0].getAttribute('data-native-plan-control'),disabled:nodes[0].getAttribute('aria-disabled'),connected:nodes[0].isConnected}:{count:nodes.length});const popup=await context.newPage();try{await popup.goto(`chrome-extension://${extensionId}/status.html`);report.localFailure=await popup.evaluate(async url=>{const rows=(await chrome.tabs.query({})).filter(t=>t.url===url);if(rows.length!==1)return {targets:rows.length};return {status:await chrome.tabs.sendMessage(rows[0].id,{v:1,type:'HOST_LOCAL_STATUS'}),layout:await chrome.tabs.sendMessage(rows[0].id,{v:1,type:'HOST_LOCAL_LAYOUT'})};},page.url());}finally{await popup.close();}}catch(diagnosticError){report.controlDiagnosticError=diagnosticError.message;}process.exitCode=1;}
 finally{
  const clean=await cleanupHostScaleRun({report,context,browserHandle,browserLaunchAttempted,networkGuard,server,directory,verify:async()=>{
   report.sourceChangedDuringRun=manifest?(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean):null;
   report.fixtureChangedDuringRun=(await Promise.all(Object.entries(report.fixtureSourceHashes).map(async([p,h])=>hash(await readFile(new URL(p,import.meta.url)))!==h))).some(Boolean);
   report.manifestChangedDuringRun=manifestPath?hash(await readFile(manifestPath))!==manifestHash:null;
   if(report.sourceChangedDuringRun||report.fixtureChangedDuringRun||report.manifestChangedDuringRun){report.status='SOURCE_CHANGED';process.exitCode=1;}
  }});if(!clean)process.exitCode=1;await writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({status:report.status,error:report.error,output}));
}

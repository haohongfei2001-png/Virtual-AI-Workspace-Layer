/** Explicit temporary mode; actual MV3 popup, no authentication or database. */
import assert from 'node:assert/strict';
import {readTemporaryAppearance,assertTemporaryAppearance} from './temporary-popup-appearance.mjs';
import {observeTemporaryNativeOpen} from './temporary-native-open-observer.mjs';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {cleanupHostScaleRun} from './fixtures/host-scale-cleanup.mjs';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const output=process.argv[2]??join(tmpdir(),'vaiwl-temporary-browser.json'),report={status:'NOT_RUN',mode:'TEMPORARY_NOT_FREE_ACCEPTED',realProfile:'NOT_RUN',errors:[]};
let control,directory,server,networkGuard,browserHandle,context,browserLaunchAttempted=false,info;const hash=x=>createHash('sha256').update(x).digest('hex'),started=performance.now();
try{
 if(process.env.FREE_TEMPORARY_ACK_PROBE!==undefined&&process.env.FREE_TEMPORARY_ACK_PROBE!=='drop-release-ack')throw Error('unsupported-observer-probe');
 report.testHashes=Object.fromEntries(await Promise.all(['tests/host/temporary-navigation-package-browser.mjs','tests/host/temporary-native-open-observer.mjs','tests/host/temporary-popup-appearance.mjs'].map(async p=>[p,hash(await readFile(p))])));
 server=await createHostFixtureServer();directory=await mkdtemp(join(tmpdir(),'vaiwl-temporary-mv3-'));const built=packageHost(join(directory,'package'),{offlineOrigin:server.origin,temporaryReadOnly:true});verifyHost(built.unpacked);info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));report.sourceHashes=info.sourceHashes;
 networkGuard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});browserLaunchAttempted=true;browserHandle=await launchNativeVisibilityBrowser({chromium,profileDir:join(directory,'profile'),headed:false,historicalNetworkGuard:networkGuard.config,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});context=browserHandle.context;context.setDefaultTimeout(6000);
 await context.route('**/*',r=>r.request().url().startsWith(server.origin)||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(server.url);await page.locator('textarea').fill('TEMPORARY_DRAFT_MUST_STAY');await page.evaluate(()=>{globalThis.originalEditor=document.querySelector('textarea');globalThis.originalDocument=document;const n=document.createElement('nav');n.innerHTML='<a href="/c/99999999-9999-4999-8999-999999999999">READING_LINK_MUST_NOT_BE_READ</a>';document.querySelector('main').append(n);const history=document.querySelector('aside nav[aria-label="Chat history"]');for(let i=0;i<20;i++){const a=document.createElement('a');a.href='/c/aaaaaaaa-aaaa-4aaa-8aaa-'+String(i).padStart(12,'0');a.textContent='Scrollable fixture '+i;history.append(a);}});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');
 // Native action popup targets are not emitted as Playwright pages in this noDefaults connection.
 let popupSession,popupTarget;const closedListeners=new Set();report.inputProtocol=[];
 const ws=new WebSocket(browserHandle.debugEndpoint);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});let sequence=0;const pending=new Map();ws.addEventListener('message',e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(v.method==='Target.detachedFromTarget'&&v.params.sessionId===popupSession||v.method==='Target.targetDestroyed'&&v.params.targetId===popupTarget){report.inputProtocol.push({event:v.method,at:performance.now()});for(const f of closedListeners)f();for(const [id,item]of pending)if(item.sessionId===popupSession){pending.delete(id);clearTimeout(item.timer);item.reject(Object.assign(Error('cdp-target-closed'),{code:'CDP_TARGET_CLOSED'}));}}if(p?.input==='mouseReleased'&&report.phase==='native-open'&&process.env.FREE_TEMPORARY_ACK_PROBE==='drop-release-ack'){report.inputProtocol.push({event:'diagnostic-drop-release-ack',at:performance.now()});return;}if(p){if(p.input)report.inputProtocol.push({event:'input-ack',input:p.input,error:!!v.error,at:performance.now()});pending.delete(v.id);clearTimeout(p.timer);v.error?p.reject(Error(v.error.message)):p.resolve(v.result);}});control={close:()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('cdp-connection-closed'));}pending.clear();ws.close();},send:(method,params={},sessionId)=>new Promise((resolve,reject)=>{if(method==='Input.dispatchMouseEvent')report.inputProtocol.push({event:'input-send',input:params.type,at:performance.now()});const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('cdp-deadline:'+method));},6000);pending.set(id,{resolve,reject,timer,sessionId,input:method==='Input.dispatchMouseEvent'?params.type:null});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));})};
 await control.send('Target.setDiscoverTargets',{discover:true});
 async function open(){await worker.evaluate(()=>chrome.action.openPopup());const t=(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.url===`chrome-extension://${id}/status.html`);report.popupTargetTypes=t.map(t=>t.type);assert.equal(t.length,1);popupTarget=t[0].targetId;popupSession=(await control.send('Target.attachToTarget',{targetId:popupTarget,flatten:true})).sessionId;}
 async function evaluate(expression){const r=await control.send('Runtime.evaluate',{expression:`(()=>{const root=document.querySelector('body>div')?.shadowRoot;${expression}})()`,returnByValue:true,awaitPromise:true},popupSession);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description?.split('\n')[0]??'popup-evaluate');return r.result.value;}
 async function wait(expression){const end=performance.now()+6000;while(performance.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,25));}report.popupTimeout=await evaluate("return root?{text:root.textContent.slice(-3000),buttonDisabled:root.querySelector('button')?.disabled,clicks:globalThis.__testClicks??0}:null;");throw Error('temporary-popup-observation-timeout');}
 async function click(selector){const box=await evaluate(`const n=root.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.addEventListener('click',()=>{globalThis.__testClicks=(globalThis.__testClicks??0)+1;},{once:true});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);await control.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box},popupSession);await control.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box},popupSession);}
 await page.evaluate(()=>{const hidden=document.createElement('span');hidden.hidden=true;hidden.textContent='HIDDEN_TEXT_MUST_NOT_BE_READ';document.querySelector('aside nav[aria-label="Chat history"] a').append(hidden);});
 report.phase='popup';await open();await wait("return !!root&&/本次读取 \\d+ 条原生链接/.test(root.textContent);");
 report.initial=await evaluate("return [...root.querySelectorAll('a.row')].map(n=>({title:n.textContent,href:n.href}));");assert(report.initial.some(r=>r.href.includes('/project')));assert(report.initial.some(r=>r.href.includes('/c/')));assert(!report.initial.some(r=>r.title.includes('READING_LINK_MUST_NOT_BE_READ')));report.readingLinksExcluded=true;assert(!report.initial.some(r=>r.title.includes('HIDDEN_TEXT_MUST_NOT_BE_READ')));report.hiddenTextExcluded=true;
 report.phase='appearance';report.appearance=[];report.appearanceHover=[];
 for(const scheme of ['light','dark']){
  await control.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]},popupSession);
  await evaluate("return Promise.all([...root.querySelectorAll('*')].flatMap(n=>n.getAnimations()).map(a=>a.finished.catch(()=>{}))).then(()=>true);");
  const snapshot=await evaluate('return ('+readTemporaryAppearance.toString()+')();');report.appearance.push({scheme,...snapshot});assert.equal(snapshot.dark,scheme==='dark');
  try{assertTemporaryAppearance(snapshot);}catch(error){
   // Failure-only A/B/A on the isolated extension document. Keep the original
   // failed assertion; mutated geometry never counts as acceptance evidence.
   report.geometryFailureProbe={qualification:'DIAGNOSTIC_ONLY_ORIGINAL_ASSERTION_STILL_FAILS',originalFailure:error.message,samples:[]};
   let original;
   try{
    original=await evaluate("return document.documentElement.style.cssText;");
    for(const [variant,cssText]of [['root-overflow-hidden',original+';overflow:hidden'],['restored',original]]){
     await evaluate(`document.documentElement.style.cssText=${JSON.stringify(cssText)};return true;`);
     for(let i=0;i<3;i++){
      if(i)await new Promise(resolve=>setTimeout(resolve,100));
      const value=await evaluate('return ('+readTemporaryAppearance.toString()+')();');
      report.geometryFailureProbe.samples.push({variant,sample:i,viewport:value.viewport,layout:value.layout});
     }
    }
   }catch(diagnosticError){report.geometryFailureProbe.diagnosticError=String(diagnosticError.message).slice(0,200);}
   finally{if(original!==undefined)try{await evaluate(`document.documentElement.style.cssText=${JSON.stringify(original)};return true;`);}catch(restoreError){report.geometryFailureProbe.restoreError=String(restoreError.message).slice(0,200);}}
   throw error;
  }
  await evaluate("const n=root.querySelector('input');n.value='Research';n.dispatchEvent(new Event('input',{bubbles:true}));return true;");
  assert.deepEqual(await evaluate("return [...root.querySelectorAll('a.row')].map(n=>n.textContent);"),['Research']);
  const search=await evaluate('return ('+readTemporaryAppearance.toString()+')();');report.appearance.push({scheme,stage:'search',...search});assertTemporaryAppearance(search);
  await evaluate("root.querySelector('input').focus();return true;");
  for(const [tag,shift] of [['BUTTON',false],['A',false],['BUTTON',true],['INPUT',true]]){
   for(const type of ['keyDown','keyUp'])await control.send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9,modifiers:shift?8:0},popupSession);
   const focus=await evaluate('return ('+readTemporaryAppearance.toString()+')();');report.appearance.push({scheme,stage:'keyboard',...focus});assertTemporaryAppearance(focus,{focusTag:tag});
  }
  for(const selector of ['a.row','button']){
   const box=await evaluate(`const n=root.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center'});const b=n.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};`);
   await control.send('Input.dispatchMouseEvent',{type:'mouseMoved',...box},popupSession);
   report.appearanceHover.push(await evaluate(`const n=root.querySelector(${JSON.stringify(selector)});return {scheme:${JSON.stringify(scheme)},selector:${JSON.stringify(selector)},box:${JSON.stringify(box)},height:innerHeight,hover:n.matches(':hover'),background:getComputedStyle(n).backgroundColor};`));
   await wait(`const n=root.querySelector(${JSON.stringify(selector)});return n.matches(':hover')&&getComputedStyle(n).backgroundColor===${JSON.stringify(scheme==='dark'?'rgb(56, 56, 56)':'rgb(238, 238, 238)')};`);
   const hover=await evaluate('return ('+readTemporaryAppearance.toString()+')();');report.appearance.push({scheme,stage:'hover',target:selector,...hover});assertTemporaryAppearance(hover);
  }
  await evaluate("const n=root.querySelector('input');n.value='';n.dispatchEvent(new Event('input',{bubbles:true}));return true;");

 }
 for(const scheme of ['light','dark']){
  await control.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme},{name:'forced-colors',value:'active'}]},popupSession);
  const forced=await evaluate('return ('+readTemporaryAppearance.toString()+')();');report.appearance.push({scheme,stage:'forced-colors',...forced});assert.equal(forced.forced,true);assertTemporaryAppearance(forced,{focusTag:'INPUT'});
 }
 await control.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'forced-colors',value:'none'}]},popupSession);
 const screenshot=await control.send('Page.captureScreenshot',{format:'png'},popupSession);await writeFile(output+'.png',Buffer.from(screenshot.data,'base64'));report.appearanceScreenshot=output+'.png';
 report.phase='inner-scrollport';
 const scrollport=await evaluate("const main=root.querySelector('main'),r=main.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,height:main.clientHeight,contentHeight:main.scrollHeight,scrollbarWidth:getComputedStyle(main).scrollbarWidth,rootScrollbarWidth:getComputedStyle(document.documentElement).scrollbarWidth};");
 assert(scrollport.contentHeight>scrollport.height,'fixture must exercise real overflowing content');assert.equal(scrollport.scrollbarWidth,'thin');assert.equal(scrollport.rootScrollbarWidth,'none');
 await control.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:scrollport.x,y:scrollport.y,deltaY:250,deltaX:0},popupSession);
 await wait("return root.querySelector('main').scrollTop>0;");
 report.innerScrollport=await evaluate("return {scrollTop:root.querySelector('main').scrollTop,rootScrollTop:document.documentElement.scrollTop,scrollbarWidth:getComputedStyle(root.querySelector('main')).scrollbarWidth};");assert.equal(report.innerScrollport.rootScrollTop,0);
 report.scrollEdges=[];
 for(const edge of ['bottom','top']){
  await evaluate(`const main=root.querySelector('main');main.scrollTop=${edge==='bottom'?'main.scrollHeight':'0'};return true;`);
  await control.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:scrollport.x,y:scrollport.y,deltaY:edge==='bottom'?250:-250,deltaX:0},popupSession);
  await new Promise(resolve=>setTimeout(resolve,100));
  const state=await evaluate("const main=root.querySelector('main');return {top:main.scrollTop,max:main.scrollHeight-main.clientHeight,outerTop:document.documentElement.scrollTop};");report.scrollEdges.push({edge,...state});assert.equal(state.outerTop,0);assert.equal(state.top,edge==='bottom'?state.max:0);
 }
 report.phase='whole-read-deadline';const readFaultStarted=performance.now();
 await evaluate("globalThis.__query=chrome.tabs.query.bind(chrome.tabs);globalThis.__frame=chrome.webNavigation.getFrame.bind(chrome.webNavigation);globalThis.__send=chrome.tabs.sendMessage.bind(chrome.tabs);globalThis.__downstream=0;chrome.webNavigation.getFrame=(...args)=>{__downstream++;return __frame(...args);};chrome.tabs.sendMessage=(...args)=>{__downstream++;return __send(...args);};chrome.tabs.query=()=>new Promise(resolve=>{globalThis.__lateQuery=resolve;});return true;");
 await click('button');await wait("return !!root&&root.textContent.includes('当前页面未提供可读取的导航列表。')&&!root.querySelector('button').disabled;");
 assert.deepEqual(await evaluate("return {rows:root.querySelectorAll('a.row').length,downstream:__downstream};"),{rows:0,downstream:0});
 // Hold a new explicit read while the expired API call returns. The old call
 // must neither dispatch downstream work nor unlock the newer read's button.
 await evaluate("chrome.tabs.query=(...args)=>new Promise(resolve=>{globalThis.__freshQuery=()=>__query(...args).then(resolve);});return true;");await click('button');
 const lateState=await evaluate("return (async()=>{__lateQuery([{id:999999}]);for(let i=0;i<20;i++)await Promise.resolve();const state={disabled:root.querySelector('button').disabled,downstream:__downstream,rows:root.querySelectorAll('a.row').length};__freshQuery();return state;})();");assert.deepEqual(lateState,{disabled:true,downstream:0,rows:0});
 await wait("return !!root&&/本次读取 \\d+ 条原生链接/.test(root.textContent);");assert.equal(await evaluate("const calls=__downstream;chrome.tabs.query=__query;chrome.webNavigation.getFrame=__frame;chrome.tabs.sendMessage=__send;return calls;"),3);
 report.wholeReadDeadline={timeoutClearsAndAllowsExplicitRead:true,expiredQueryCannotContinue:true,oldFinallyCannotUnlockFreshRead:true,freshReadCompleted:true,elapsedMs:performance.now()-readFaultStarted};
 await evaluate("const n=root.querySelector('input');n.value='Research';n.dispatchEvent(new Event('input',{bubbles:true}));return true;");assert.deepEqual(await evaluate("return [...root.querySelectorAll('a.row')].map(n=>({title:n.textContent,project:n.href.endsWith('/project')}));"),[{title:'Research',project:true}]);report.projectSearchMatches=true;await evaluate("const n=root.querySelector('input');n.value='';n.dispatchEvent(new Event('input',{bubbles:true}));return true;");
 report.phase='project-disclosure';
 await page.evaluate(()=>{const projects=document.querySelector('aside [aria-label="Projects"]'),details=document.createElement('details');details.open=true;details.dataset.testProjects='true';projects.before(details);details.append(document.createElement('summary'),projects);});
 await wait("return !!root&&root.querySelectorAll('a.row').length===0;");await click('button');await wait("return !!root&&[...root.querySelectorAll('a.row')].some(n=>n.href.endsWith('/project'));");
 await page.evaluate(()=>{document.querySelector('details[data-test-projects]').open=false;});await wait("return !!root&&root.querySelectorAll('a.row').length===0;");await click('button');await wait("return !!root&&/本次读取 \\d+ 条原生链接/.test(root.textContent);");assert.equal(await evaluate("return [...root.querySelectorAll('a.row')].filter(n=>n.href.endsWith('/project')).length;"),0);
 await page.evaluate(()=>{document.querySelector('details[data-test-projects]').open=true;});await wait("return !!root&&root.querySelectorAll('a.row').length===0;");
 // Native details can remain skipped for a render turn after open changes. The
 // snapshot only promises displayed links; wait for that real fixture precondition.
 await page.waitForFunction(()=>document.querySelector('details[data-test-projects] a').checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true}),{},{timeout:6000});report.projectReopenVisibleBeforeRead=true;
 await click('button');await wait("return !!root&&[...root.querySelectorAll('a.row')].some(n=>n.href.endsWith('/project'));");report.projectDisclosureClearsSnapshot=true;
 await page.evaluate(()=>{const nav=document.createElement('section');nav.setAttribute('aria-label','Projects');nav.innerHTML='<a href="/g/g-p-22222222222222222222222222222222/project">Newly displayed Project</a>';document.querySelector('aside').append(nav);});await wait("return !!root&&root.querySelectorAll('a.row').length===0;");await click('button');await wait("return !!root&&root.textContent.includes('Newly displayed Project');");report.addedProjectRegionClearsSnapshot=true;
 report.phase='invalidation';await page.evaluate(()=>{document.querySelector('aside nav[aria-label="Chat history"] a').textContent='Changed native title';});await wait("return !!root&&root.textContent.includes('原生导航已变化，旧列表已清除。可重新读取当前页。');");assert.equal(await evaluate("return root.querySelectorAll('a.row').length;"),0);await click('button');await wait("return !!root&&root.textContent.includes('Changed native title');");
 report.nativeJourneys=[];for(const kind of ['project','conversation']){
 const link=await evaluate(`const a=[...root.querySelectorAll('a.row')].find(n=>${kind==='project'?"n.href.endsWith('/project')":"n.textContent==='Changed native title'"});a.dataset.testLink='target';return {href:a.href,target:a.target,rel:a.rel};`);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');report.phase='native-open';report.observerFaultProbe=process.env.FREE_TEMPORARY_ACK_PROBE??null;const observedNewPages=[];const trackPage=p=>{const row={createdAt:performance.now(),exactURL:p.url()===link.href};observedNewPages.push(row);p.on('framenavigated',f=>{if(f===p.mainFrame())row.exactURL=f.url()===link.href;});};context.on('page',trackPage);let nativeBox;const opened=await observeTemporaryNativeOpen({
  onPage:f=>{context.on('page',f);return ()=>context.off('page',f);},onPopupClosed:f=>{closedListeners.add(f);return ()=>closedListeners.delete(f);},
  press:async()=>{nativeBox=await evaluate("const n=root.querySelector('a[data-test-link]');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};");await control.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...nativeBox},popupSession);},
  release:()=>control.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...nativeBox},popupSession),
  readPage:async(target,remainingMs)=>{await target.waitForURL(link.href,{timeout:remainingMs});return {correctURL:target.url()===link.href,openerNull:await target.evaluate(()=>window.opener===null)};},
  readOriginal:()=>page.evaluate(()=>document===originalDocument&&document.querySelector('textarea')===originalEditor&&originalEditor.value==='TEMPORARY_DRAFT_MUST_STAY'),
 });context.off('page',trackPage);const {page:target,...inputResult}=opened;report.nativeInput=inputResult;report.observedNewPages=observedNewPages;report.nativeJourneys.push({kind,nativeInput:inputResult,observedNewPages});if(report.observerFaultProbe)assert.equal(inputResult.inputAcknowledgement,'UNAVAILABLE_TARGET_CLOSED');
 await target.close();await page.bringToFront();await control.send('Target.closeTarget',{targetId:popupTarget}).catch(()=>{});await open();await wait("return !!root&&/本次读取 \\d+ 条原生链接/.test(root.textContent);");assert.equal(await evaluate("return root.querySelector('input').value;"),'');
 }await control.send('Target.closeTarget',{targetId:popupTarget});
 report.phase='persisted-page-lifecycle';await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await open();await wait("return !!root&&/本次读取 \\d+ 条原生链接/.test(root.textContent);");await control.send('Target.closeTarget',{targetId:popupTarget});report.persistedPagehideKeepsFreshReader=true;
 report.phase='guards';const rogue=await context.newPage();await rogue.goto(`chrome-extension://${id}/workspace.html`);await page.bringToFront();report.rogueRejected=await rogue.evaluate(async()=>{const [t]=await chrome.tabs.query({active:true,currentWindow:true});try{return (await chrome.tabs.sendMessage(t.id,{v:1,type:'HOST_TEMPORARY_NATIVE_LIST'},{frameId:0}))===undefined;}catch{return true;}});assert(report.rogueRejected);assert.deepEqual(await worker.evaluate(()=>indexedDB.databases()),[]);assert.equal(await page.locator('[data-va-owned]').count(),0);assert.deepEqual(report.errors,[]);
 const snapshot=server.snapshot();report.requests=snapshot.requests;assert.equal(snapshot.requests['/api/auth/session']??0,0);assert.equal(snapshot.requests['/backend-api/accounts/check/v4-2023-04-27']??0,0);report.databaseEmpty=true;report.draftPreserved=true;report.newTabOpened=true;report.reopenedFresh=true;report.elapsedMs=performance.now()-started;report.status=report.observerFaultProbe?'PASS_TEMPORARY_INPUT_OBSERVER_PROBE':'PASS_TEMPORARY_MV3_POPUP';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;}
finally{control?.close();const cleaned=await cleanupHostScaleRun({report,context,browserHandle,browserLaunchAttempted,networkGuard,server,directory,verify:async()=>{if(report.testHashes){report.testSourcesStable=(await Promise.all(Object.entries(report.testHashes).map(async([p,h])=>hash(await readFile(p))===h))).every(Boolean);if(!report.testSourcesStable){report.status='TEST_SOURCE_CHANGED';process.exitCode=1;}}if(info){report.sourceStable=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))===h))).every(Boolean);if(!report.sourceStable){report.status='SOURCE_CHANGED';process.exitCode=1;}}}});if(!cleaned)process.exitCode=1;await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,phase:report.phase,error:report.error,output}));}

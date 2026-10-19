import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {createSys05StreamServer} from './fixtures/sys05-stream-server.mjs';
import {attachSys05Observer} from './sys05-stream-observer.mjs';
import {createSys05StartupDeadline,waitForSys05Worker} from './sys05-startup-precondition.mjs';
import {SYS05_LIMITS,counterDelta,assertTokenOnlyWork,assertStreamOutcome,assertBackpressureOutcome,assertDirectoryGapPrecondition,assertDirectoryGapOutcome} from './sys05-stream-oracle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sha=v=>createHash('sha256').update(v).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const C='44444444-4444-4444-8444-444444444444',PEER='33333333-3333-4333-8333-333333333333';
const scope=context=>({verified:true,provider:'chatgpt',accountId:'principal_'+sha(JSON.stringify(['chatgpt-principal-v1','user-host-fixture'])),organizationId:'context_'+sha(JSON.stringify(['chatgpt-context-v1','user-host-fixture',context]))});
const scopeKey=s=>JSON.stringify([s.provider,s.accountId,s.organizationId]);
const fixtureFiles=['sys05-stream-package-journey.mjs','sys05-startup-precondition.mjs','sys05-stream-oracle.mjs','sys05-stream-observer.mjs','fixtures/sys05-stream-server.mjs','fixtures/sys05-native-stream.mjs','fixtures/sys05-native-peer-rename.mjs','fixtures/sys05-native-directory.mjs','fixtures/variants-server.mjs','fixtures/variants-native.mjs','fixtures/j4-native-context.mjs','fixtures/j4-interruption.mjs','fixtures/ui10-conversation-title.mjs','fixtures/native.mjs','fixtures/native.css','fixtures/legacy.html','expected/modern.mjs'];
async function poll(read,label,timeout=6000){const end=Date.now()+timeout;let result;while(Date.now()<end){result=await read();if(result&&Date.now()<end)return result;await sleep(50);}throw Error('sys05-timeout:'+label);}
export async function runSys05(output,{execute=false,observeWork=false,backpressure=false,directoryGap=false}={}){
 if(backpressure||directoryGap)observeWork=true;
 const report={status:'NOT_RUN',requirement:'VA-HOST/1.1 SYS-05 narrow candidate',S:'NOT_RUN',realChatGPT:'NOT_RUN',releaseStatus:'NOT_RELEASE_READY',fullSYS05:'NOT_ESTABLISHED',sourceCommit:process.env.FREE_SOURCE_COMMIT??null,workInstrumentation:observeWork,backpressureRequested:backpressure,directoryGapRequested:directoryGap,limits:SYS05_LIMITS,steps:[],errors:[],uncovered:['Forced backpressure/gap and queue overflow','Full supported-profile matrix','Full admitted inventory and large-scale token storms','Uninstrumented latency/p95 and physical-device performance','Actual ChatGPT G/U and PAIA']};
 if(!execute){await writeFile(output,JSON.stringify(report,null,2)+'\n');return report;}
 let server,handle,activeObserver,peerObserver,built,manifest,activePage;
 const dir=await mkdtemp(join(tmpdir(),'vaiwl-sys05-'));
 report.fixtureHashes=Object.fromEntries(await Promise.all(fixtureFiles.map(async path=>['tests/host/'+path,sha(await readFile(new URL(path,import.meta.url)))])));
 try{
  const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
  server=await createSys05StreamServer({backpressure,directoryGap});
  built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineContext:true,offlineExistingSend:true,offlineHistory:true});
  manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));report.sourceHashes=manifest.sourceHashes;report.packageSha256=built.archiveSha256;report.buildManifestHash=sha(await readFile(join(built.unpacked,'build-manifest.json')));
  const permissions=JSON.parse(await readFile(join(built.unpacked,'manifest.json')));assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*']);assert.deepEqual(permissions.permissions,['webNavigation','webRequest']);assert.equal(permissions.content_security_policy.extension_pages,`script-src 'self'; object-src 'none'; connect-src ${server.origin}`);report.workerNetworkPolicy='PACKAGED_EXACT_ORIGIN_CONNECT_SRC';
  const context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:process.env.FREE_CHROME_HEADED!=='1',viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
  context.setDefaultTimeout(15000);const browser=context.browser();handle={context,browser,close:()=>context.close()};report.browserPrecondition={transport:'PLAYWRIGHT_ISOLATED_PERSISTENT_CONTEXT',freshProfile:true};
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===server.origin||url.protocol==='chrome-extension:'?route.continue():route.abort();});
  /* No MAIN/UI/runtime patch is installed in correctness mode. */
  const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
  const startup=createSys05StartupDeadline();
  report.browserPrecondition.startup={kind:'WORKER_READY_FUNCTIONAL_JOURNEY',totalBudgetMs:startup.timeoutMs,coldStart:'NOT_TESTED'};
  report.browserPrecondition.startup.worker=await waitForSys05Worker(context,id,startup);
  const frame=page=>page.frames().find(f=>!f.isDetached()&&f.url()===`chrome-extension://${id}/workspace.html`);
  async function ready(page,expected,currentRef,deadline=null){const read=async()=>{const f=frame(page);if(!f)return null;const contextId=expected.organizationId===scope('account-host-personal').organizationId?'account-host-personal':'account-host-team';const hasNativeContext=server.snapshot().nativeRequests.some(r=>r.path==='/backend-api/conversation/'+currentRef&&r.context===contextId);const native=await page.locator('#reading').getAttribute('data-conversation-id');return hasNativeContext&&native===currentRef&&await f.getByRole('button',{name:'工作空间设置',exact:true}).count()>0?f:null;};return deadline?deadline.poll(read,'normal-native-context-and-live-UI'):poll(read,'normal-native-context-and-live-UI',30000);}
  const personal=scope('account-host-personal'),team=scope('account-host-team');
  const b=await startup.run(()=>context.newPage(),'initial-peer-page');b.on('pageerror',e=>report.errors.push(e.message));await startup.run(()=>b.goto(server.origin+'/c/'+PEER,{timeout:startup.remaining('initial-native-navigation')}),'initial-native-navigation');await ready(b,team,PEER,startup);
  report.browserPrecondition.startup.elapsedMs=startup.elapsedMs();
  const a=activePage=await context.newPage();a.on('pageerror',e=>report.errors.push(e.message));await a.goto(server.origin+'/c/'+C);await ready(a,team,C);
  await a.locator('#account-button').click();const navigation=a.waitForNavigation();await a.getByRole('button',{name:'Switch to Personal',exact:true}).click();await navigation;await ready(a,personal,C);
  assert(server.snapshot().nativeRequests.some(r=>r.path==='/backend-api/conversation/'+C&&r.context==='account-host-personal'));
  report.steps.push('normal-C2-authenticated-personal-A-and-existing-team-B');
  async function facts(expected,conversation=C){const f=frame(a);assert(f,'attached-frame-for-readonly-oracle');return f.evaluate(async({scope,c,origin,includeDirectory})=>{
   const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs')),{FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs')),{createHostActivitySourceAdmission}=await import(chrome.runtime.getURL('src/runtime/host-activity-source-admission.mjs')),{HOST_CONFIG}=await import(chrome.runtime.getURL('extension/config.mjs')),{freeProjection}=await import(chrome.runtime.getURL('src/data/free-projection.mjs')),{projectFreeActivity}=await import(chrome.runtime.getURL('src/data/free-activity.mjs')),{createFreeViewSession}=await import(chrome.runtime.getURL('src/data/free-time-policy.mjs')),base=new ScopeRepository({indexedDB});
   try{const native=await new NativeRepository({baseRepository:base}).read(scope),evidence=await new FreeEvidenceRepository({baseRepository:base}).read(scope),db=await base.open(),budget=await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readonly'),q=tx.objectStore('b23_views').get('host-read-budget:'+digest([scope.accountId,scope.organizationId,origin]));tx.oncomplete=()=>{const row=q.result;resolve(row?{checksumValid:row.checksum===digest(row.payload),startedAt:row.payload.startedAt,lastAt:row.payload.lastAt,requests:row.payload.requests,attemptCounts:row.payload.attempts.map(a=>a.count)}:null);};tx.onabort=()=>reject(tx.error);});const now=new Date().toISOString(),admit=createHostActivitySourceAdmission(HOST_CONFIG),sources=Object.fromEntries(Object.entries(evidence.sources).filter(([,source])=>admit(scope,source,{store:'evidence',sources:evidence.sources}))),projection=projectFreeActivity(freeProjection(native,{scope,now}),{...evidence,sources},createFreeViewSession({now,timeZone:'UTC',H:30}),now);const old=Object.values(evidence.events).find(e=>e.conversationId===c&&e.messageId==='j4_original_old'&&e.actorVerified===true&&e.kind==='new-send'&&e.sendState==='committed');return {...(includeDirectory?{refTitles:Object.fromEntries(Object.entries(native.refs).map(([id,r])=>[id,r.nativeTitle])),inventories:Object.values(native.sources).map(s=>s.inventory)}:{}),originalOldEvent:old?{messageId:old.messageId,sentAt:old.sentAt,precision:old.precision,actorVerified:old.actorVerified}:null,activity:projection.refs.find(r=>r.id===c)?.activityDecision??null,ref:native.refs[c]?{id:c,nativeTitle:native.refs[c].nativeTitle}:null,refIds:Object.keys(native.refs).sort(),projectIds:Object.keys(native.projects).sort(),membership:Object.values(native.membership??{}).reduce((out,row)=>(out[row.state]=(out[row.state]??0)+1,out),{}),hints:Object.values(evidence.hints).map(h=>({messageId:h.messageId,conversationId:h.conversationId,eventKey:h.eventKey,firstObservedAt:h.firstObservedAt,hasSentAt:Object.hasOwn(h,'sentAt'),hasAckWitness:!!h.ackWitness})),budget};}finally{base.close();}
  },{scope:expected,c:conversation,origin:server.origin,includeDirectory:directoryGap});}
  await a.locator('#model-button').click();await a.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();
  await poll(async()=>{const v=await facts(personal);return v.ref?.nativeTitle==='Membership not loaded'&&v.originalOldEvent?.precision==='millisecond'&&v.activity?.basis==='provisional'&&v.activity.reason==='historical-anchor-incomplete'&&v.activity.segment>0?v:null;},'original-old-activity');
  await sleep(300);report.before={personal:await facts(personal),team:await facts(team)};
  assert(report.before.personal.refIds.includes(C)&&report.before.personal.refIds.includes(PEER),'loaded-native-identities-required');
  report.beforeUI={recentCurrentRows:await frame(a).locator('[data-free-list="unknown"] a[data-ref-id="'+C+'"]').count()};assert.equal(report.beforeUI.recentCurrentRows,0,'old-reference-already-in-recent-list');
  // No new budget or retry is created by the test. Wait out only an existing
  // depleted window, as the original J4 journey does, before the measured phase.
  if(report.before.personal.budget?.requests>=12){const wait=Math.max(0,report.before.personal.budget.startedAt+30001-Date.now());report.budgetWaitMs=wait;await sleep(wait);}
  if(observeWork){activeObserver=await attachSys05Observer(context,a,id,{directoryGap});peerObserver=await attachSys05Observer(context,b,id);report.instrumentation=activeObserver.instrumentation;}else report.instrumentation={kind:'NONE',packageModified:false};
  report.loadedDirectoryNodes=await a.evaluate(()=>[...document.querySelectorAll('aside section[aria-label="Projects"],aside nav[aria-label="Chat history"]')].reduce((n,root)=>n+root.querySelectorAll('*').length,0));
  await a.locator('#sys05-start').click();await poll(()=>a.evaluate(()=>sys05NativeStream.snapshot().ticks>=8),'stream-start');
  const prefixReads=server.snapshot().sys05Reads.filter(r=>r.authenticated&&r.path.startsWith('/backend-api/conversation/')).length;
  const activeStart=await activeObserver?.snapshot(),peerStart=await peerObserver?.snapshot(),first=await a.evaluate(()=>sys05NativeStream.snapshot());
  await poll(()=>a.evaluate(ticks=>sys05NativeStream.snapshot().ticks>=ticks+40,first.ticks),'token-only-prefix');
  const activeEnd=await activeObserver?.snapshot(),peerEnd=await peerObserver?.snapshot();report.tokenOnly=observeWork?{active:counterDelta(activeStart,activeEnd),peer:counterDelta(peerStart,peerEnd)}:{status:'WORK_COUNTERS_NOT_RUN'};if(observeWork)assertTokenOnlyWork(report.tokenOnly);
  report.tokenOnly.authenticatedDetailReads=server.snapshot().sys05Reads.filter(r=>r.authenticated&&r.path.startsWith('/backend-api/conversation/')).length-prefixReads;assert.equal(report.tokenOnly.authenticatedDetailReads,0,'token-only-authenticated-read-work');report.steps.push('finite-real-descendant-token-prefix');
  assert((await a.evaluate(()=>sys05NativeStream.snapshot())).realDescendant,'real-recursive-DOM-contains');
  await a.locator('#j4-rename-on-send').check();await a.locator('#prompt-textarea').fill('SYS05 offline native send');
  if(backpressure){report.peerBefore={personal:await facts(personal,PEER),team:await facts(team,PEER)};server.holdNextRead();}
  const faultDeadline=backpressure?createSys05StartupDeadline({timeoutMs:SYS05_LIMITS.rpcMs}):null;
  const actionAt=Date.now(),send=()=>a.getByRole('button',{name:'Send',exact:true}).click({timeout:faultDeadline?.remaining('native-send')??15000});
  if(faultDeadline)await faultDeadline.run(send,'native-send');else await send();
  const readAcceptance=()=>{const state=server.snapshot().interruption;return state.accepts===1?state:null;};
  const accepted=await(faultDeadline?faultDeadline.poll(readAcceptance,'real-native-POST'):poll(readAcceptance,'real-native-POST'));
  if(backpressure){
   const within=faultDeadline.poll;
   await within(()=>server.snapshot().backpressure?.heldAt,'authenticated-read-held');
   await faultDeadline.run(()=>b.locator('#sys05-peer-rename').click({timeout:faultDeadline.remaining('peer-native-rename')}),'peer-native-rename');
   const retry=await within(async()=>{const value=await peerObserver.snapshot();return value.packets.find(p=>p.peerRenameTitle&&p.at>=server.snapshot().sys05PeerRenameAt&&p.state==='retry-after'&&p.payloadSha256)?value:null;},'peer-real-backpressure');
   report.backpressureRetry=retry;faultDeadline.remaining('release-authenticated-read');server.releaseRead();
   await within(async()=>{const value=await peerObserver.snapshot();return value.packets.some(p=>p.state==='accepted'&&retry.packets.some(r=>r.peerRenameTitle&&p.peerRenameTitle&&r.kind===p.kind&&r.state==='retry-after'&&r.producer===p.producer&&r.localSeq===p.localSeq&&r.payloadSha256===p.payloadSha256));},'same-peer-proposal-accepted');
   report.backpressure=server.snapshot().backpressure;
   report.steps.push('held-authenticated-read-real-peer-retry-and-same-proposal-acceptance');
  }
  report.steps.push('one-real-native-POST-and-same-task-title');const sent=accepted.rows.at(-1),durable=await poll(async()=>{const v=await facts(personal);return v.ref?.nativeTitle===accepted.title&&v.hints.filter(h=>h.messageId===sent.id).length===1&&v.activity?.basis==='provisional'&&v.activity.reason==='observed-self-send'&&v.activity.segment===0?v:null;},'original-ACK-and-title');
  report.steps.push('original-durable-ACK-provisional-recent-projection');const durableAt=Date.now(),during=await a.evaluate(()=>sys05NativeStream.snapshot());assert(during.running);await poll(()=>a.evaluate(tokens=>sys05NativeStream.snapshot().mutations>tokens,during.jointToken),'tokens-after-durable');
  const tokensAtDurable=(await a.evaluate(()=>sys05NativeStream.snapshot())).mutations;
  const titleWaitAt=Date.now();await a.getByRole('button',{name:'返回工作空间',exact:true}).click();
  const presented=()=>a.evaluate(()=>{const surface=document.querySelector('section[data-va-owned][id$="_workspace"]');return !!surface?.matches(':popover-open')&&getComputedStyle(surface).visibility==='visible';});
  const title=await poll(async()=>{if(!await presented())throw Error('sys05-workspace-closed-during-visible-title');const f=frame(a);if(!f)return null;const row=f.locator('[data-free-list="unknown"] a[data-ref-id="'+C+'"][aria-current="page"]');return await row.count()===1&&await row.isVisible()&&await row.locator('.window-title').textContent()===accepted.title?true:null;},'visible-ACK-promoted-current-row-and-original-title');
  await poll(()=>a.evaluate(tokens=>sys05NativeStream.snapshot().mutations>tokens,tokensAtDurable),'tokens-after-visible-title');
  const tokensAtVisibleTitle=(await a.evaluate(()=>sys05NativeStream.snapshot())).mutations,titleAt=Date.now();
  report.presentation={topLevelOpen:await presented(),tokenTicks:0};
  const visibleTick=(await a.evaluate(()=>sys05NativeStream.snapshot())).ticks;
  await poll(async()=>{assert(await presented(),'sys05-token-update-closed-workspace');const ticks=(await a.evaluate(()=>sys05NativeStream.snapshot())).ticks-visibleTick;report.presentation.tokenTicks=ticks;return ticks>=8;},'workspace-retained-through-token-updates');
  report.ui={exactTitle:title,currentRef:C,activityPlacement:'RECENT_LIST_ABSENT_TO_VISIBLE_NOT_CURRENT_CONTEXT',activityFromHint:true,qualifiedAdmissionAt:durable.hints.find(h=>h.messageId===sent.id).firstObservedAt,durableFirstSeenAt:durableAt,visibleFirstSeenAt:titleAt,timingBasis:'CONSERVATIVE_PRECOMMIT_AUTHENTICATED_ADMISSION_TO_VISIBLE_UI_UPPER_BOUND; includes automation and readonly polling; not exact commit timing or p95',ackLatencyMs:durableAt-actionAt,titleLatencyMs:titleAt-titleWaitAt,acceptanceToVisibleTitleMs:titleAt-Date.parse(sent.at),sendToQualifiedEvidenceMs:Date.parse(durable.hints.find(h=>h.messageId===sent.id).firstObservedAt)-actionAt,evidenceToVisibleTitleMs:titleAt-Date.parse(durable.hints.find(h=>h.messageId===sent.id).firstObservedAt)};
  if(directoryGap){
   const phase=createSys05StartupDeadline({timeoutMs:6000}),gap={kind:'ONE_PROPOSAL_NOT_DELIVERED_BEFORE_FORWARD'};report.directoryGap=gap;
   gap.before=await phase.run(()=>facts(personal),'gap-before');
   await phase.run(()=>a.getByRole('button',{name:'返回原生阅读',exact:true}).click({timeout:phase.remaining('prepare-native-reading')}),'prepare-native-reading');
   await phase.run(()=>a.evaluate(()=>{globalThis.sys05GapDocument=document;globalThis.sys05GapEditor=document.querySelector('#prompt-textarea');sys05GapEditor.value='preserved directory recovery draft';}),'gap-native-draft');
   gap.armed=await phase.run(()=>activeObserver.armDirectoryGap(),'arm-gap');
   await phase.run(()=>a.locator('#sys05-load-directory').click({timeout:phase.remaining('native-directory')}),'native-directory');
   await phase.poll(async()=>await a.locator('#sys05-load-directory').getAttribute('data-applied')==='true','native-directory-applied');
   gap.expected=server.snapshot().sys05Directory;
   assert.equal(gap.expected.length,300);
   gap.faultWork=await phase.poll(async()=>{const w=await activeObserver.snapshot();return w.packets.some(p=>p.fault==='DROP_BEFORE_FORWARD'&&p.state==='unknown')&&w.packets.some(p=>p.directoryIds.length&&p.state==='accepted')?w:null;},'real-first-ACK-and-designated-loss');
   gap.afterFault=await phase.run(()=>facts(personal),'persistent-gap');
   assertDirectoryGapPrecondition(report);
   // No sleep/renewal pause: inspect the actual incomplete set immediately before
   // user-style closing/return. A preemptive renewal cannot masquerade as recovery.
   gap.actionAt=Date.now();
   gap.uniqueReturn=await phase.run(()=>a.getByRole('button',{name:'返回工作空间',exact:true}).count(),'unique-return')===1;
   await phase.run(()=>a.getByRole('button',{name:'返回工作空间',exact:true}).click({timeout:phase.remaining('workspace-return')}),'workspace-return');
   gap.after=await phase.poll(async()=>{const v=await facts(personal);return gap.expected.every(e=>v.refTitles[e.id]===e.title)?v:null;},'fresh-rescan-complete-directory');
   gap.completedAt=Date.now();gap.work=await phase.run(()=>activeObserver.snapshot(),'recovery-observations');
   gap.peer=await phase.run(()=>facts(team),'peer-directory-isolation');
   gap.actions=server.snapshot().actions;
   gap.draftPreserved=await phase.run(()=>a.evaluate(()=>document===sys05GapDocument&&document.querySelector('#prompt-textarea')===sys05GapEditor&&sys05GapEditor.value==='preserved directory recovery draft'),'draft-preserved');
   const sidebar=a.frames().find(f=>f.url()===`chrome-extension://${id}/sidebar.html`);assert(sidebar);
   await phase.run(()=>sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click({timeout:phase.remaining('open-search')}),'open-search');
   await phase.run(()=>frame(a).getByRole('searchbox',{name:'已知聊天查找输入',exact:true}).fill('SYS05 directory 300',{timeout:phase.remaining('tail-search')}),'tail-search');
   const last=gap.expected.at(-1),row=frame(a).locator('.search-results a[data-ref-id="'+last.id+'"]');
   gap.tail=await phase.poll(async()=>await presented()&&await row.count()===1&&await row.isVisible()?{topLevelOpen:true,id:last.id,title:await row.locator('.window-title').textContent(),href:await row.getAttribute('href')}:null,'tail-search-visible');
   gap.elapsedMs=phase.elapsedMs();report.directoryGap=gap;
   report.steps.push('native-directory-first-commit-designated-unsent-fragment-real-gap-return-rescan-tail-search');
  }
  await poll(()=>a.evaluate(()=>!sys05NativeStream.snapshot().running),'finite-stream-end',22000);
  report.stream={...await a.evaluate(()=>sys05NativeStream.snapshot()),tokensAtDurable,tokensAtVisibleTitle};
  report.personal=await facts(personal);report.team=await facts(team);if(!directoryGap)assert.deepEqual(report.personal.refIds,report.before.personal.refIds,'admitted-ref-set-changed-during-small-stream');assert.deepEqual(report.personal.projectIds,report.before.personal.projectIds,'admitted-project-set-changed-during-small-stream');
  assert.deepEqual(report.personal.hints.find(h=>h.messageId===sent.id),durable.hints.find(h=>h.messageId===sent.id),'ACK-identity-or-first-time-renewed');
  report.native=server.snapshot().interruption;
  report.sendReadback=server.snapshot().sys05Reads.filter(r=>r.authenticated&&r.path==='/backend-api/conversation/'+C&&r.at>=actionAt&&r.finishedAt!==null);assert(report.sendReadback.length>0,'real-authenticated-send-readback-required');
  report.work=observeWork?{active:await activeObserver.snapshot(),peer:await peerObserver.snapshot()}:{status:'NOT_RUN'};
  Object.assign(report,assertStreamOutcome(report));
  if(backpressure){report.peerAfter={personal:await facts(personal,PEER),team:await facts(team,PEER)};report.backpressure=server.snapshot().backpressure;report.backpressureNativeActions=server.snapshot().actions;report.peerRenameAt=server.snapshot().sys05PeerRenameAt;report.peerRenameApplied=await b.locator('#sys05-peer-rename').getAttribute('data-applied')==='true';Object.assign(report,assertBackpressureOutcome(report));report.uncovered[0]='Queue overflow, persistent gap and rescan recovery';}
  if(directoryGap){Object.assign(report,assertDirectoryGapOutcome(report));report.uncovered[0]='General queue overflow and committed-but-lost ACK recovery';}
assert.deepEqual(report.errors,[]);report.S=observeWork?'NARROW_INSTRUMENTED_BROWSER_OBSERVED':'NARROW_UNINSTRUMENTED_BROWSER_OBSERVED';report.browserVersion=browser.version();
 }catch(error){report.status=handle?'FAIL':'NOT_RUN_BROWSER_STARTUP';report.error=error.stack;}
 finally{
  const capture=async(stage,fn)=>{try{await fn();}catch(error){(report.cleanupErrors??=[]).push({stage,error:error.message});}};
  await capture('final-server-snapshot',()=>{if(server){const s=server.snapshot();report.native??=s.interruption;report.requests=s.requests;report.fixedReads=s.sys05Reads;report.readTraceDropped=s.readTraceDropped;report.nativeActions=s.actions;if(backpressure)report.backpressure=s.backpressure;if(s.readTraceDropped)throw Error('fixed-read-trace-truncated');}});
  await capture('final-passive-work-snapshot',async()=>{if(observeWork&&activeObserver&&peerObserver)report.work={active:await activeObserver.snapshot(),peer:await peerObserver.snapshot()};});
  await capture('final-native-stream-state',async()=>{if(activePage&&!report.stream)report.stream=await activePage.evaluate(()=>globalThis.sys05NativeStream?.snapshot()??null);});
  await capture('final-presentation-state',async()=>{if(activePage)report.finalPresentation=await activePage.evaluate(()=>Array.from(document.querySelectorAll('section[data-va-owned][popover]'),node=>({role:node.id.endsWith('_workspace')?'workspace':'sidebar',open:node.matches(':popover-open'),visibility:getComputedStyle(node).visibility})));});
  await capture('active-observer-close',()=>activeObserver?.close());await capture('peer-observer-close',()=>peerObserver?.close());
  await capture('browser-close',()=>handle?.close());await capture('fixture-close',()=>server?.close());
  await capture('source-integrity',async()=>{if(manifest){report.sourceChangedDuringRun=(await Promise.all(Object.entries({...manifest.sourceHashes,...report.fixtureHashes}).map(async([path,hash])=>sha(await readFile(join(root,path)))!==hash))).some(Boolean);if(report.sourceChangedDuringRun)throw Error('source-changed-during-run');assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');assert.equal(sha(await readFile(join(built.unpacked,'build-manifest.json'))),report.buildManifestHash);}});
  if(report.cleanupErrors?.length)report.status='FAIL_CLEANUP_OR_INTEGRITY';
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=await runSys05(process.argv[2]??join(tmpdir(),'sys05-stream-not-run.json'),{execute:process.argv.includes('--execute-browser'),observeWork:process.argv.includes('--observe-work'),backpressure:process.argv.includes('--backpressure'),directoryGap:process.argv.includes('--gap-recovery')});
 console.log(JSON.stringify({status:report.status,S:report.S,fullSYS05:report.fullSYS05}));if(report.status.startsWith('FAIL')||report.status==='NOT_RUN_BROWSER_STARTUP')process.exitCode=1;
}

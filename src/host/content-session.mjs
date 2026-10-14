import {createCandidateUpgrade} from './candidate-upgrade.mjs';
import {createContentCandidates} from './content-candidates.mjs';
import {createSnippetSelectionSession} from './snippet-selection-session.mjs';
import {createChatGPTAdapter} from './chatgpt-adapter.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {createMountSurface} from '../navigation/mount-surface.mjs';
import {createSurfaceController} from './surface-controller.mjs';
import {createFrameNativePlans} from './frame-native-plans.mjs';
import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';

/** Isolated content composition. The entry must restrict supported hosts; this
 * module never exposes its runtime bridge or authority on the page window. */
export function createHostContentSession({document:doc,runtime,origin=doc?.location?.origin,adapterFactory=createChatGPTAdapter,surfaceFactory=createMountSurface,controllerFactory=createSurfaceController,plansFactory=createFrameNativePlans,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID()}={}){
 if(!doc?.defaultView||new URL(origin).origin!==origin||doc.location.origin!==origin||!['http:','https:'].includes(new URL(origin).protocol)||!tokenOK(runtime?.id)||typeof runtime.sendMessage!=='function'||typeof runtime.getURL!=='function'||!runtime.onMessage?.addListener)throw Error('invalid-content-session');
 const upgrade=createCandidateUpgrade({now});let upgradeIdentity=null,upgradeDisplay=null,upgradeTimer=null;
 // Learned identities are document-local facts, never reusable handles or grants.
 let learned=[],learnedScope=null,learnedDocument=null;
 const clearLearned=()=>{learned=[];learnedScope=null;learnedDocument=null;};
 const clearUpgrade=()=>{if(upgradeTimer!==null)cancel(upgradeTimer);upgradeTimer=null;upgrade.clear();upgradeIdentity=null;upgradeDisplay=null;for(const type of ['pointerdown','keydown'])doc.removeEventListener?.(type,interruptUpgrade,true);for(const type of ['popstate','hashchange'])doc.defaultView.removeEventListener(type,upgradeRoute);};
 const interruptUpgrade=event=>{if(event.isTrusted===true)clearUpgrade();};
 const upgradeRoute=()=>{if(!upgrade.navigate({url:doc.location.href}))clearUpgrade();};
 const clientId=makeId();if(!tokenOK(clientId))throw Error('invalid-content-client');
 let seq=0,epoch=0,current=null,enabled=false,rebindQueued=false,rebindRun=0,restoreArmed=false,recoveryRemaining=0;
 const bindingFields=b=>({documentToken:b.documentToken,producerToken:b.producerToken,routeEpoch:b.routeEpoch});
 function live(s){return current===s&&!s.abort.signal.aborted&&doc.location.href===s.url;}
 function bindingOK(b,prior){return exactHostRecord(b,['documentToken','producerToken','browserDocumentId','routeEpoch','origin','expiresAt'])&&['documentToken','producerToken','browserDocumentId'].every(k=>tokenOK(b[k]))&&Number.isSafeInteger(b.routeEpoch)&&b.routeEpoch>=0&&b.origin===origin&&Date.parse(b.expiresAt)>now()&&Date.parse(b.expiresAt)<=now()+20000&&(!prior||['documentToken','producerToken','browserDocumentId','routeEpoch','origin'].every(k=>b[k]===prior[k]));}
 async function rpc(s,message,timeoutMs=6000){
  if(!live(s))throw Error('stale-content-session');let abort;
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('stale-content-session'));s.abort.signal.addEventListener('abort',abort,{once:true});});
  try{const result=await withRequestDeadline(()=>Promise.race([Promise.resolve().then(()=>{if(!live(s))throw Error('stale-content-session');return runtime.sendMessage(message);}),cancelled]),{timeoutMs,now:elapsedNow,schedule,cancel});if(!live(s))throw Error('stale-content-session');return result;}
  finally{s.abort.signal.removeEventListener('abort',abort);}
 }
 function clearMigration(s){const prior=s.migration;s.migration=null;if(prior?.leaseOwner)try{s.adapter?.releaseLoadedHandles?.(prior.leaseOwner);}catch{}for(const type of ['pointerdown','keydown','wheel','focusin'])doc.removeEventListener?.(type,s.migrationInterrupt,true);}
 function liveMigration(s){const m=s.migration;if(!m)return null;const time=now(),elapsed=elapsedNow();if(!Number.isFinite(time)||time<m.lastTime||time>=m.createdAt+30000||!Number.isFinite(elapsed)||elapsed<m.lastElapsed||elapsed>=m.elapsedDeadline){clearMigration(s);return null;}m.lastTime=time;m.lastElapsed=elapsed;return m;}
 function retainMigration(s,handle){const m=liveMigration(s);if(!m)return false;try{if(typeof s.adapter?.retainLoadedHandles==='function'&&s.adapter.retainLoadedHandles(m.leaseOwner,[handle],m.elapsedDeadline)!==true){clearMigration(s);return false;}}catch{clearMigration(s);return false;}m.handle=handle;return true;}
 function dispose(s){if(!s)return;clearMigration(s);doc.removeEventListener?.('visibilitychange',s.visibility);doc.defaultView.removeEventListener('focus',s.focus);doc.defaultView.removeEventListener('blur',s.blur);s.restorePending?.();s.snippets?.stop();s.candidates?.stop();try{s.controller?.stop();}catch{}s.abort.abort();try{runtime.onMessage.removeListener(s.listener);}catch{}doc.defaultView.removeEventListener('pagehide',s.pagehide);try{s.adapter?.stop();}catch{}}
 function reset(){epoch++;const s=current;current=null;dispose(s);}
 function stop(){clearLearned();clearUpgrade();for(const type of ['pointerdown','keydown'])doc.removeEventListener?.(type,interruptUpgrade,true);enabled=false;restoreArmed=false;rebindQueued=false;rebindRun++;reset();doc.defaultView.removeEventListener('pagehide',pagehide);doc.defaultView.removeEventListener('pageshow',pageshow);}
 function pagehide(event){
  if(event?.persisted!==true){stop();return;}if(!enabled)return;
  clearLearned();clearUpgrade();restoreArmed=true;rebindQueued=false;rebindRun++;reset();
  doc.defaultView.addEventListener('pagehide',pagehide);
 }
 function pageshow(event){if(event?.persisted!==true||!enabled||!restoreArmed)return;restoreArmed=false;void begin();}
 function rebind(s,initialMode=null){
  if(!enabled||current!==s||rebindQueued)return;
  if(initialMode===null)initialMode=s.controller?.presentationMode?.()==='workspace'?'workspace':'reading';
  if(doc.location.href!==s.url){upgrade.navigate({url:doc.location.href});initialMode='reading';}else clearUpgrade();
  rebindQueued=true;const run=++rebindRun;reset();doc.defaultView.addEventListener('pagehide',pagehide);
  // Collapse a burst into one replacement. Only external events can request a
  // subsequent attempt; failures never schedule their own recovery loop.
  queueMicrotask(()=>{if(!enabled||run!==rebindRun)return;rebindQueued=false;void begin(true,initialMode);});
 }
 async function start(){clearLearned();clearUpgrade();recoveryRemaining=1;enabled=true;restoreArmed=false;rebindQueued=false;rebindRun++;doc.defaultView.addEventListener('pageshow',pageshow);return begin();}
 async function begin(rebinding=false,initialMode='workspace'){
  reset();const s={run:epoch,url:doc.location.href,abort:new AbortController(),binding:null,controller:null,adapter:null,listener:()=>{},pagehide,plans:null,rebinding,ready:false,recoveryDenied:false,snippets:null,snippetRef:null,snippetScopeGrant:null};current=s;doc.defaultView.addEventListener('pagehide',s.pagehide);
  let foregroundArmed=doc.visibilityState==='hidden',foregroundPending=false;
  s.blur=()=>{foregroundArmed=true;};
  s.focus=()=>{
   if(doc.visibilityState!=='visible'||!foregroundArmed||!s.ready||!live(s))return;
   if(foregroundPending)return;foregroundArmed=false;foregroundPending=true;
   void rpc(s,{v:1,type:'HOST_FOCUS',clientId,seq:++seq,...bindingFields(s.binding)}).then(result=>{
    if(result?.ok!==true||result.state!=='verified'||result.scopeKey!==s.scopeKey)throw Error('foreground-scope-unverified');
   }).catch(()=>{if(live(s)){s.recoveryDenied=true;stop();}}).finally(()=>{foregroundPending=false;s.focus();});
  };
  s.visibility=()=>{if(doc.visibilityState==='hidden')foregroundArmed=true;else s.focus();};
  doc.addEventListener?.('visibilitychange',s.visibility);doc.defaultView.addEventListener('focus',s.focus);doc.defaultView.addEventListener('blur',s.blur);
  s.listener=(m,sender,reply)=>{
   if(current!==s||!enabled||sender?.id!==runtime.id)return;
   if(exactHostRecord(m,['type'])&&m.type==='HOST_DOCUMENT_INVALIDATED'){rebind(s);return;}
   if(m?.type==='HOST_CANDIDATES'){
    const fields=m.phase==='list'?['type','documentToken','producerToken','routeEpoch','phase',...(Object.hasOwn(m,'offset')?['offset']:[])]:['type','documentToken','producerToken','routeEpoch','phase','candidate','actionId','uiGrantId','mountId','expiresAt',...(Object.hasOwn(m,'display')?['display']:[])];if(Object.hasOwn(m,'role'))fields.push('role');
    if(!exactHostRecord(m,fields)||Object.hasOwn(m,'role')&&!['workspace','sidebar'].includes(m.role)||!['list','activate'].includes(m.phase)||!s.ready||!s.candidates||!live(s)||Date.parse(s.binding.expiresAt)<=now()||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v)){reply({ok:false});return;}
    const task=m.phase==='list'?s.candidates.listPage(Object.hasOwn(m,'offset')?m.offset:0):s.candidates.activate({candidate:m.candidate,actionId:m.actionId,uiGrantId:m.uiGrantId,mountId:m.mountId,expiresAt:m.expiresAt,...(Object.hasOwn(m,'display')?{display:m.display}:{})});
    Promise.resolve(task).then(value=>{const migration=liveMigration(s);if(m.phase==='list'&&migration&&m.role&&now()>=migration.createdAt&&now()<migration.createdAt+30000){const own=m.role===migration.display.role,presentation=own?migration.display.presentation:{offset:0,scrollTop:0,focused:false};value={...value,migration:{id:migration.id,projectId:migration.projectId,presentation,ready:migration.ready,focusAllowed:own&&migration.ready&&migration.focusAllowed&&presentation.focused}};}reply(live(s)?value:{ok:false});},()=>reply({ok:false}));return true;
   }
   if(['HOST_NATIVE_DISPATCH_CURRENT','HOST_NATIVE_DISPATCH_PLAN'].includes(m?.type)){
    if(!exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','command','expiresAt'])||!s.ready||!s.plans||!live(s)||Date.parse(s.binding.expiresAt)<=now()||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v)){reply({state:'blocked'});return;}
    Promise.resolve(s.plans.activate({command:m.command,expiresAt:m.expiresAt})).then(result=>reply(live(s)?result:{state:m.type==='HOST_NATIVE_DISPATCH_PLAN'?'unconfirmed':'blocked'}),()=>reply({state:'unconfirmed'}));return true;
   }
   if(m?.type==='HOST_SNIPPET_RESTORE'){
    const allowed=exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','scopeGrantId','ref','anchor','expiresAt'])&&typeof m.expiresAt==='string'&&Date.parse(m.expiresAt)>now()&&Date.parse(m.expiresAt)<=now()+6000&&s.ready&&s.binding&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Object.entries(bindingFields(s.binding)).every(([k,v])=>m[k]===v)&&tokenOK(m.scopeGrantId)&&exactHostRecord(m.ref,['id','nativeUrl'])&&tokenOK(m.ref.id)&&typeof m.ref.nativeUrl==='string'&&m.ref.nativeUrl.length<=2048&&exactHostRecord(m.anchor,['refId','messageId','branchId','text','bodyHash']);
    if(!allowed){reply({ok:false});return;}
    // Revealing a masked body can require a new owner-acknowledged body proof.
    // Wait for that proof within this one command; never retry scrolling.
    s.restorePending?.();let attempts=0,timer=null,done=false,readingCurrent=()=>true;
    const events=['pointerdown','focusin','keydown','wheel','beforetoggle'];
    const finish=ok=>{if(done)return;done=true;if(timer!==null)cancel(timer);for(const type of events)doc.removeEventListener?.(type,interrupted,true);if(s.restorePending===abort)s.restorePending=null;reply({ok});};
    const abort=()=>finish(false),interrupted=event=>{if(event.isTrusted===true&&(event.type!=='beforetoggle'||event.newState==='open'))abort();};
    const started=elapsedNow(),remaining=Date.parse(m.expiresAt)-now();
    const fresh=()=>!done&&current===s&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Date.parse(m.expiresAt)>now()&&elapsedNow()-started>=0&&elapsedNow()-started<remaining&&readingCurrent()&&s.adapter?.hasNativeLayer?.()!==true;
    const restore=()=>{try{if(!fresh()||++attempts>120){finish(false);return;}if(typeof s.adapter?.snippetReady==='function'&&!s.adapter.snippetReady(m.ref)){timer=schedule(restore,Math.min(50,Math.max(1,Date.parse(m.expiresAt)-now())));return;}const restored=s.adapter?.restoreSnippet?.(m.ref,m.anchor)?.ok===true;finish(restored&&fresh());}catch{finish(false);}};
    try{if(s.controller?.showReading()!==true){finish(false);return;}readingCurrent=s.controller.readingGuard?.()??(()=>true);s.restorePending=abort;for(const type of events)doc.addEventListener?.(type,interrupted,true);restore();}catch{finish(false);}return true;
   }
   if(m?.type==='HOST_SNIPPET_SELECTION'){
    const allowed=exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','scopeGrantId','phase','ref','selectionId'])&&s.ready&&s.binding&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Object.entries(bindingFields(s.binding)).every(([k,v])=>m[k]===v)&&tokenOK(m.scopeGrantId)&&['capture','validate','release'].includes(m.phase)&&exactHostRecord(m.ref,['id','nativeUrl'])&&tokenOK(m.ref.id)&&typeof m.ref.nativeUrl==='string'&&m.ref.nativeUrl.length<=2048&&(m.phase==='capture'?m.selectionId===null:tokenOK(m.selectionId));
    if(!allowed||!s.snippets){reply({ok:false});return;}
    try{
     if(m.phase==='capture'){
      s.snippetScopeGrant=m.scopeGrantId;s.snippetRef=Object.freeze({...m.ref});const id=s.snippets.capture(s.snippetRef),anchor=id&&s.snippets.read(id,s.snippetRef);
      if(!anchor){reply({ok:false});return;}reply({ok:true,selectionId:id,anchor});return;
     }
     if(m.scopeGrantId!==s.snippetScopeGrant||(m.ref.id!==s.snippetRef?.id||m.ref.nativeUrl!==s.snippetRef?.nativeUrl)){reply({ok:false});return;}
     if(m.phase==='release'){reply({ok:s.snippets.consume(m.selectionId)});return;}
     const anchor=s.snippets.read(m.selectionId,s.snippetRef);reply(anchor?{ok:true,anchor}:{ok:false});return;
    }catch{reply({ok:false});return;}
   }
   if(m?.type==='HOST_PRESENT_SURFACE'){
    const allowed=exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','mode'])&&['workspace','reading','native-page'].includes(m.mode)&&s.ready&&s.binding&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Object.entries(bindingFields(s.binding)).every(([k,v])=>m[k]===v);
    if(!allowed){reply({ok:false});return;}
    let ok=false;try{ok=(m.mode==='workspace'?s.controller.showWorkspace():m.mode==='native-page'?s.controller.showNativeReading():s.controller.showReading())===true;}catch{}reply({ok});return;
   }
   if(!s.plans||!live(s)||Date.parse(s.binding.expiresAt)<=now()||!exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','targets'])||m.type!=='HOST_NATIVE_PLAN'||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v))return;
   try{reply(s.plans.plan({targets:m.targets}));}catch{reply(null);}
  };runtime.onMessage.addListener(s.listener);
  try{
   const hello=await rpc(s,{v:1,type:'HOST_HELLO',clientId,seq:++seq});if(!bindingOK(hello?.binding))throw Error('invalid-host-binding');s.binding=Object.freeze({...hello.binding});
   const auth=await rpc(s,{v:1,type:'HOST_REFRESH',clientId,seq:++seq,...bindingFields(s.binding)});if(auth?.state!=='verified')throw Error('scope-not-verified');s.scopeKey=auth.scopeKey;s.ackProjects=new Set();s.upgraded=null;
   if(learnedScope!==s.scopeKey||learnedDocument!==s.binding.browserDocumentId)clearLearned();learnedScope=s.scopeKey;learnedDocument=s.binding.browserDocumentId;
   let surface;const adapter=s.adapter=adapterFactory({document:doc,onSurfaceChange:records=>{if(live(s))surface?.surrenderChanged?.(records);},isOwnedMask:node=>live(s)&&surface?.isMasked?.(node)===true,urlPolicy:createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}),now,elapsedNow,authorize:async command=>{if(s.candidates?.authorize(command)!==true&&s.plans?.authorize(command)!==true)return false;const result=await rpc(s,{v:1,type:'HOST_NATIVE_AUTHORIZE',...bindingFields(s.binding),command});return result?.ok===true&&(s.candidates?.authorize(command)===true||s.plans?.authorize(command)===true);},beforeDispatch:plan=>plan?.mode==='same-target'||s.plans?.beforeDispatch?.(plan)===true?undefined:s.candidates?.beforeDispatch(),onNativeDispatch:event=>{if(event.plan.target.kind!=='live-control'||!s.scopeKey)return;const identity=s.adapter.captureCandidateIdentity?.(event.plan.control);if(!identity)return;clearUpgrade();upgradeIdentity=identity;upgradeDisplay=s.candidates?.displayFor(event.command)??null;for(const type of ['pointerdown','keydown'])doc.addEventListener?.(type,interruptUpgrade,true);for(const type of ['popstate','hashchange'])doc.defaultView.addEventListener(type,upgradeRoute);upgrade.propose({actionId:event.actionId,identity,scopeKey:s.scopeKey,documentId:s.binding.browserDocumentId,originalURL:s.url,expiresAt:now()+6000});upgradeTimer=schedule(clearUpgrade,6000);},onNativeDispatchCancelled:event=>{if(upgrade.cancel(event.actionId))clearUpgrade();},onRebindNeeded:()=>rebind(s)});
   s.candidates=createContentCandidates({adapter,streaming:true,current:()=>live(s)&&s.ready&&Date.parse(s.binding.expiresAt)>now(),showReading:()=>s.controller?.showReading()===true,
    beginScan:()=>{
     // Only fixed-size document identities are staged. Visiting a row cannot
     // prune learned state, consume an upgrade, or install a return migration.
     const prior={learned,upgraded:s.upgraded,migration:s.migration,identity:upgradeIdentity,display:upgradeDisplay,projects:new Set(s.ackProjects)},seen=new Map();
     const route=createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}).parse(s.url);
     const resolution=route.kind==='project'&&prior.projects.has(route.projectId)?{scopeKey:s.scopeKey,documentId:s.binding.browserDocumentId,url:s.url,projectId:route.projectId,identityMatches:true}:null;
     const preview=resolution&&upgrade.preview(resolution);
     let upgradedHandle=null,pendingHandle=null,committed=false;
     const matches=(identity,handle)=>!!identity&&adapter.matchesCandidateIdentity?.(identity,handle)===true;
     const check=()=>{if(committed||!live(s)||!s.ready||Date.parse(s.binding.expiresAt)<=now()||learned!==prior.learned||s.upgraded!==prior.upgraded||s.migration!==prior.migration||upgradeIdentity!==prior.identity||upgradeDisplay!==prior.display||s.ackProjects.size!==prior.projects.size||[...prior.projects].some(id=>!s.ackProjects.has(id)))throw Error('stale-candidate-identity-scan');};
     return {visit:row=>{
      check();const handle=row.target.control;
      for(const item of prior.learned)if(matches(item.identity,handle))seen.set(item.identity,handle);
      if(matches(prior.upgraded?.identity,handle))upgradedHandle=handle;
      if(matches(prior.identity,handle))pendingHandle=handle;
      return !!(prior.upgraded&&prior.projects.has(prior.upgraded.projectId)&&matches(prior.upgraded.identity,handle)||prior.learned.some(item=>matches(item.identity,handle))||preview&&preview.identity===prior.identity&&matches(prior.identity,handle));
     },retainedHandles:()=>{check();return [...new Set([...seen.values(),upgradedHandle,pendingHandle].filter(Boolean))];},commit:()=>{
      check();const kept=prior.learned.filter(item=>seen.has(item.identity)&&matches(item.identity,seen.get(item.identity)));
      if(kept.length!==seen.size||upgradedHandle&&!matches(prior.upgraded?.identity,upgradedHandle)||pendingHandle&&!matches(prior.identity,pendingHandle))throw Error('stale-candidate-identity-scan');
      let next=upgradedHandle&&matches(prior.upgraded?.identity,upgradedHandle)?prior.upgraded:null,result=null;
      const pendingValid=pendingHandle&&matches(prior.identity,pendingHandle);
      const known=pendingValid&&(next&&prior.projects.has(next.projectId)&&matches(next.identity,pendingHandle)||kept.some(item=>matches(item.identity,pendingHandle)));
      if(pendingValid&&!known&&preview){
       result=upgrade.resolve(resolution);
       if(!result||result.identity!==preview.identity||result.projectId!==preview.projectId||result.actionId!==preview.actionId)throw Error('stale-candidate-identity-scan');
      }
      check();committed=true;learned=kept;s.upgraded=next;
      if(s.migration&&!next)clearMigration(s);
      if(next&&prior.projects.has(next.projectId)&&s.migration)retainMigration(s,upgradedHandle);
      if(!result)return;
      s.upgraded=result;if(learned.length<32&&!learned.some(item=>item.identity===result.identity))learned.push(Object.freeze({identity:result.identity,projectId:result.projectId}));
      if(prior.display){
       clearMigration(s);
       const createdAt=now(),createdElapsed=elapsedNow();
       s.migration={id:result.actionId,leaseOwner:'candidate-migration_'+result.actionId,projectId:result.projectId,display:prior.display,handle:pendingHandle,createdAt,lastTime:createdAt,lastElapsed:createdElapsed,elapsedDeadline:createdElapsed+30000,ready:s.returned===true,focusAllowed:true};
       if(!retainMigration(s,pendingHandle)){clearUpgrade();return;}
       const migration=s.migration;s.migrationInterrupt=event=>{const target=event.composedPath?.()[0]??event.target;if(s.migration===migration&&event.isTrusted===true&&!s.controller?.isReturnTarget?.(target)&&!(event.type==='focusin'&&migration.ready&&s.controller?.isFrameTarget?.(migration.display.role,target)))migration.focusAllowed=false;};
       for(const type of ['pointerdown','keydown','wheel','focusin'])doc.addEventListener?.(type,s.migrationInterrupt,true);
      }
      clearUpgrade();
     }};
    },
    isUpgraded:row=>{const matches=identity=>adapter.matchesCandidateIdentity?.(identity,row.target.control)===true;return !!(s.upgraded&&s.ackProjects.has(s.upgraded.projectId)&&matches(s.upgraded.identity)||learned.some(item=>matches(item.identity)));},now,elapsedNow});
   s.snippets=createSnippetSelectionSession({adapter:{selectedSnippet:ref=>adapter.selectedSnippet?.(ref)??null},now,makeId,
    currentBinding:()=>live(s)&&s.ready&&s.binding&&Date.parse(s.binding.expiresAt)>now()&&s.snippetScopeGrant?JSON.stringify({...bindingFields(s.binding),scopeGrantId:s.snippetScopeGrant}):null,
    currentSelectionEpoch:()=>s.snippetRef?adapter.selectionEpoch?.(s.snippetRef)??null:null});
   s.plans=plansFactory({adapter,showNativeReading:()=>s.adapter?.hasNativeLayer?.()!==true&&s.controller?.showNativeReading?.()===true,captureIntent:()=>s.controller?.intentGuard?.()??(()=>false),showReading:()=>s.adapter?.hasNativeLayer?.()!==true&&s.controller?.showReading()===true,now,elapsedNow,schedule,cancel,bindingCurrent:()=>live(s)&&Date.parse(s.binding.expiresAt)>now()&&adapter.inspect().ok?s.binding.documentToken+':'+s.binding.routeEpoch:false});
   surface=surfaceFactory({document:doc,createFrameURL:({role})=>runtime.getURL(role+'.html'),hasNativeLayer:()=>adapter.hasNativeLayer()});
   const bridge={
    registerMount:({handle})=>rpc(s,{v:1,type:'HOST_UI_MOUNT',...bindingFields(s.binding),mountId:handle.id,regionEpoch:handle.regionEpoch}),
    confirmParent:v=>rpc(s,{v:1,type:'HOST_UI_CONFIRM',...v,...bindingFields(s.binding)}),
    workspaceEntered:({mountId})=>{s.returned=true;liveMigration(s);if(s.migration&&adapter.matchesCandidateIdentity?.(s.upgraded.identity,s.migration.handle)!==true)clearMigration(s);if(s.migration){s.migration.ready=true;if(s.migration.display.presentation.focused&&s.migration.focusAllowed)s.migration.focusAllowed=s.controller.focusFrame?.(s.migration.display.role)===true;}return rpc(s,{v:1,type:'HOST_UI_WORKSPACE_ENTERED',...bindingFields(s.binding),mountId});},
    revokeMount:({mountId})=>{if(s.binding)void withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_RELEASE',...bindingFields(s.binding),mountId}),{now:elapsedNow,schedule,cancel}).catch(()=>{});},
    renewSession:async({handle,binding})=>{if(!bindingOK(binding,s.binding))throw Error('stale-content-binding');const started=elapsedNow();const renewed=await rpc(s,{v:1,type:'HOST_DOCUMENT_RENEW',clientId,seq:++seq,...bindingFields(binding)});if(renewed?.ok!==true||!bindingOK(renewed.binding,s.binding))throw Error('invalid-host-binding');const remaining=()=>{const budget=6000-(elapsedNow()-started);if(budget<=0)throw Error('request-timeout');return budget;};const authority=await rpc(s,{v:1,type:'HOST_REFRESH',clientId,seq:++seq,...bindingFields(binding)},remaining());if(authority?.state!=='verified'||authority.scopeKey!==s.scopeKey){s.recoveryDenied=true;throw Error('scope-not-verified');}const status=await rpc(s,{v:1,type:'HOST_UI_STATUS',...bindingFields(binding),mountId:handle.id},remaining());if(status?.ok===true)s.binding=Object.freeze({...renewed.binding});return {...status,binding:renewed.binding};}
   };
   s.controller=controllerFactory({document:doc,adapter,surface,extensionOrigin:'chrome-extension://'+runtime.id,bridge,initialMode,onTerminated:(reason,presentation)=>{
    // Intentional exit ends this document session, including late recovery callbacks.
    if(current===s&&reason==='ui-user-exit'){stop();return;}
    // One fresh authorization attempt per explicit content start. A failed
    // replacement never schedules another loop or revives an old grant.
    if(!enabled||!s.ready||!live(s)||s.recoveryDenied||recoveryRemaining<1||!['ui-frame-suspended','session-renew-failed','ui-grant-expired','stale-session-renewal'].includes(reason))return;
    recoveryRemaining--;rebind(s,presentation?.mode==='workspace'?'workspace':'reading');
   },now,elapsedNow,schedule,cancel});
   const handle=await s.controller.start({binding:s.binding,emit:async p=>{const result=await rpc(s,p);if(['accepted','duplicate'].includes(result?.state)&&p.kind==='surface-delta')for(const row of p.payload.candidates)if(row.entity==='project'&&row.target?.kind==='resolved'&&row.evidence?.fieldPaths?.includes('current-project-route'))s.ackProjects.add(row.target.nativeId);return result;}});if(!live(s)||!handle)throw Error('surface-start-failed');s.ready=true;return handle;
  }catch{if(current===s)stop();return null;}
 }
 return Object.freeze({start,stop,showWorkspace:()=>current?.controller?.showWorkspace()??false,showReading:()=>current?.controller?.showReading()??false});
}

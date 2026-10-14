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
 function dispose(s){if(!s)return;doc.removeEventListener?.('visibilitychange',s.visibility);doc.defaultView.removeEventListener('focus',s.focus);doc.defaultView.removeEventListener('blur',s.blur);s.restorePending?.();s.snippets?.stop();s.candidates?.stop();try{s.controller?.stop();}catch{}s.abort.abort();try{runtime.onMessage.removeListener(s.listener);}catch{}doc.defaultView.removeEventListener('pagehide',s.pagehide);try{s.adapter?.stop();}catch{}}
 function reset(){epoch++;const s=current;current=null;dispose(s);}
 function stop(){enabled=false;restoreArmed=false;rebindQueued=false;rebindRun++;reset();doc.defaultView.removeEventListener('pagehide',pagehide);doc.defaultView.removeEventListener('pageshow',pageshow);}
 function pagehide(event){
  if(event?.persisted!==true){stop();return;}if(!enabled)return;
  restoreArmed=true;rebindQueued=false;rebindRun++;reset();
  doc.defaultView.addEventListener('pagehide',pagehide);
 }
 function pageshow(event){if(event?.persisted!==true||!enabled||!restoreArmed)return;restoreArmed=false;void begin();}
 function rebind(s,initialMode='workspace'){
  if(!enabled||current!==s||rebindQueued)return;
  rebindQueued=true;const run=++rebindRun;reset();doc.defaultView.addEventListener('pagehide',pagehide);
  // Collapse a burst into one replacement. Only external events can request a
  // subsequent attempt; failures never schedule their own recovery loop.
  queueMicrotask(()=>{if(!enabled||run!==rebindRun)return;rebindQueued=false;void begin(true,initialMode);});
 }
 async function start(){recoveryRemaining=1;enabled=true;restoreArmed=false;rebindQueued=false;rebindRun++;doc.defaultView.addEventListener('pageshow',pageshow);return begin();}
 async function begin(rebinding=false,initialMode='workspace'){
  reset();const s={run:epoch,url:doc.location.href,abort:new AbortController(),binding:null,controller:null,adapter:null,listener:()=>{},pagehide,plans:null,rebinding,ready:false,recoveryDenied:false,snippets:null,snippetRef:null,snippetScopeGrant:null};current=s;doc.defaultView.addEventListener('pagehide',s.pagehide);
  let foregroundArmed=doc.visibilityState==='hidden',foregroundPending=false;
  s.blur=()=>{foregroundArmed=true;};
  s.focus=()=>{
   if(doc.visibilityState!=='visible'||!foregroundArmed||!s.ready||!live(s))return;
   if(foregroundPending)return;foregroundArmed=false;foregroundPending=true;
   void rpc(s,{v:1,type:'HOST_FOCUS',clientId,seq:++seq,...bindingFields(s.binding)}).then(result=>{
    if(result?.ok!==true||result.state!=='verified')throw Error('foreground-scope-unverified');
   }).catch(()=>{if(live(s)){s.recoveryDenied=true;stop();}}).finally(()=>{foregroundPending=false;s.focus();});
  };
  s.visibility=()=>{if(doc.visibilityState==='hidden')foregroundArmed=true;else s.focus();};
  doc.addEventListener?.('visibilitychange',s.visibility);doc.defaultView.addEventListener('focus',s.focus);doc.defaultView.addEventListener('blur',s.blur);
  s.listener=(m,sender,reply)=>{
   if(current!==s||!enabled||sender?.id!==runtime.id)return;
   if(exactHostRecord(m,['type'])&&m.type==='HOST_DOCUMENT_INVALIDATED'){rebind(s);return;}
   if(m?.type==='HOST_CANDIDATES'){
    const fields=m.phase==='list'?['type','documentToken','producerToken','routeEpoch','phase']:['type','documentToken','producerToken','routeEpoch','phase','candidate','actionId','uiGrantId','mountId','expiresAt'];
    if(!exactHostRecord(m,fields)||!['list','activate'].includes(m.phase)||!s.ready||!s.candidates||!live(s)||Date.parse(s.binding.expiresAt)<=now()||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v)){reply({ok:false});return;}
    const task=m.phase==='list'?s.candidates.list():s.candidates.activate({candidate:m.candidate,actionId:m.actionId,uiGrantId:m.uiGrantId,mountId:m.mountId,expiresAt:m.expiresAt});
    Promise.resolve(task).then(value=>reply(live(s)?value:{ok:false}),()=>reply({ok:false}));return true;
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
    const allowed=exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','mode'])&&['workspace','reading'].includes(m.mode)&&s.ready&&s.binding&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Object.entries(bindingFields(s.binding)).every(([k,v])=>m[k]===v);
    if(!allowed){reply({ok:false});return;}
    let ok=false;try{ok=(m.mode==='workspace'?s.controller.showWorkspace():s.controller.showReading())===true;}catch{}reply({ok});return;
   }
   if(!s.plans||!live(s)||Date.parse(s.binding.expiresAt)<=now()||!exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','targets'])||m.type!=='HOST_NATIVE_PLAN'||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v))return;
   try{reply(s.plans.plan({targets:m.targets}));}catch{reply(null);}
  };runtime.onMessage.addListener(s.listener);
  try{
   const hello=await rpc(s,{v:1,type:'HOST_HELLO',clientId,seq:++seq});if(!bindingOK(hello?.binding))throw Error('invalid-host-binding');s.binding=Object.freeze({...hello.binding});
   const auth=await rpc(s,{v:1,type:'HOST_REFRESH',clientId,seq:++seq,...bindingFields(s.binding)});if(auth?.state!=='verified')throw Error('scope-not-verified');
   let surface;const adapter=s.adapter=adapterFactory({document:doc,isOwnedMask:node=>live(s)&&surface?.isMasked?.(node)===true,urlPolicy:createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}),now,elapsedNow,authorize:async command=>{if(s.candidates?.authorize(command)!==true)return false;const result=await rpc(s,{v:1,type:'HOST_NATIVE_AUTHORIZE',...bindingFields(s.binding),command});return result?.ok===true&&s.candidates?.authorize(command)===true;},beforeDispatch:()=>s.candidates?.beforeDispatch(),onRebindNeeded:()=>rebind(s)});
   s.candidates=createContentCandidates({adapter,current:()=>live(s)&&s.ready&&Date.parse(s.binding.expiresAt)>now(),showReading:()=>s.controller?.showReading()===true,now});
   s.snippets=createSnippetSelectionSession({adapter:{selectedSnippet:ref=>adapter.selectedSnippet?.(ref)??null},now,makeId,
    currentBinding:()=>live(s)&&s.ready&&s.binding&&Date.parse(s.binding.expiresAt)>now()&&s.snippetScopeGrant?JSON.stringify({...bindingFields(s.binding),scopeGrantId:s.snippetScopeGrant}):null,
    currentSelectionEpoch:()=>s.snippetRef?adapter.selectionEpoch?.(s.snippetRef)??null:null});
   s.plans=plansFactory({adapter,bindingCurrent:()=>live(s)&&Date.parse(s.binding.expiresAt)>now()&&adapter.inspect().ok?s.binding.documentToken+':'+s.binding.routeEpoch:false});
   surface=surfaceFactory({document:doc,createFrameURL:({role})=>runtime.getURL(role+'.html'),hasNativeLayer:()=>adapter.hasNativeLayer()});
   const bridge={
    registerMount:({handle})=>rpc(s,{v:1,type:'HOST_UI_MOUNT',...bindingFields(s.binding),mountId:handle.id,regionEpoch:handle.regionEpoch}),
    confirmParent:v=>rpc(s,{v:1,type:'HOST_UI_CONFIRM',...v,...bindingFields(s.binding)}),
    workspaceEntered:({mountId})=>rpc(s,{v:1,type:'HOST_UI_WORKSPACE_ENTERED',...bindingFields(s.binding),mountId}),
    revokeMount:({mountId})=>{if(s.binding)void withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_RELEASE',...bindingFields(s.binding),mountId}),{now:elapsedNow,schedule,cancel}).catch(()=>{});},
    renewSession:async({handle,binding})=>{if(!bindingOK(binding,s.binding))throw Error('stale-content-binding');const started=elapsedNow();const renewed=await rpc(s,{v:1,type:'HOST_DOCUMENT_RENEW',clientId,seq:++seq,...bindingFields(binding)});if(renewed?.ok!==true||!bindingOK(renewed.binding,s.binding))throw Error('invalid-host-binding');const remaining=()=>{const budget=6000-(elapsedNow()-started);if(budget<=0)throw Error('request-timeout');return budget;};const authority=await rpc(s,{v:1,type:'HOST_REFRESH',clientId,seq:++seq,...bindingFields(binding)},remaining());if(authority?.state!=='verified'){s.recoveryDenied=true;throw Error('scope-not-verified');}const status=await rpc(s,{v:1,type:'HOST_UI_STATUS',...bindingFields(binding),mountId:handle.id},remaining());if(status?.ok===true)s.binding=Object.freeze({...renewed.binding});return {...status,binding:renewed.binding};}
   };
   s.controller=controllerFactory({document:doc,adapter,surface,extensionOrigin:'chrome-extension://'+runtime.id,bridge,initialMode,onTerminated:(reason,presentation)=>{
    // One fresh authorization attempt per explicit content start. A failed
    // replacement never schedules another loop or revives an old grant.
    if(!enabled||!s.ready||!live(s)||s.recoveryDenied||recoveryRemaining<1||!['ui-frame-suspended','session-renew-failed','ui-grant-expired','stale-session-renewal'].includes(reason))return;
    recoveryRemaining--;rebind(s,presentation?.mode==='workspace'?'workspace':'reading');
   },now,elapsedNow,schedule,cancel});
   const handle=await s.controller.start({binding:s.binding,emit:p=>rpc(s,p)});if(!live(s)||!handle)throw Error('surface-start-failed');s.ready=true;return handle;
  }catch{if(current===s)stop();return null;}
 }
 return Object.freeze({start,stop,showWorkspace:()=>current?.controller?.showWorkspace()??false,showReading:()=>current?.controller?.showReading()??false});
}

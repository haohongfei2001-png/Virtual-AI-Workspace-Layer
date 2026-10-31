import {historyFailureReasons} from './native-history-list.mjs';
import {surfaceFailureStates,frameFailureReasons,nativeBoundaryFailureReasons as boundaryReasons} from './local-status.mjs';
import {workspaceReturnIcon} from '../navigation/icons.mjs';
import {readFrameAppearance} from './frame-appearance.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {exactHostRecord} from './contract.mjs';
import {NativeFlowPreflightError} from './document-flow-layout.mjs';
/** Isolated content composition. Public window messages only correlate an owned
 * frame. Grants and mount registration travel exclusively over the trusted bridge. */
export function createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin,onTerminated=()=>{},onFailure=()=>{},onWake=null,initialMode='workspace',now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const origin=new URL(extensionOrigin);if(onWake!==null&&typeof onWake!=='function'||!['workspace','reading'].includes(initialMode)||origin.protocol!=='chrome-extension:'||origin.host===''||!['','/'].includes(origin.pathname)||origin.search||origin.hash||!doc?.defaultView||!adapter||!surface||typeof bridge?.registerMount!=='function'||typeof bridge.confirmParent!=='function')throw Error('invalid-surface-controller');
 const trustedOrigin=`${origin.protocol}//${origin.host}`,win=doc.defaultView;
 let epoch=0,current=null,lastBoundary=null;
 const transitions=[];
 function recordPresentation(state,visibility,reason='visibility'){
  const elapsed=elapsedNow()-state.startedAt;if(!Number.isFinite(elapsed)||elapsed<0)return;
  const intent=state.desiredMode==='workspace'?'workspace':'reading',layout=state.inspection?.regionEpoch??0;
  for(const role of ['workspace','sidebar']){
   const next=visibility?.[role]===true?'visible':visibility?.[role]===false?'hidden':'unavailable';
   const prior=state.traceState?.[role];
   if(prior?.next===next&&prior.intent===intent&&prior.layout===layout)continue;
   transitions.push({role,reason:reason==='authority'?reason:prior&&prior.intent!==intent?'intent':prior&&prior.layout!==layout?'layout':reason,from:prior?.next??'unavailable',to:next,intentRevision:state.intentEpoch,layoutRevision:Number.isSafeInteger(layout)&&layout>=0?layout:0,elapsedMs:Math.min(86400000,Math.floor(elapsed))});
   if(transitions.length>16)transitions.shift();state.traceState??={};state.traceState[role]={next,intent,layout};
  }
 }

 // Keep diagnostics on our frame: ancestor mutations would invalidate native masks.
 const joinSnapshot=state=>({loaded:state.loadedRoles?.size??0,joined:state.joinedRoles?.size??0,granted:state.grants.size,registered:state.registered,joinSignal:state.joinSignal??'not-observed',modules:state.moduleRoles?.size??0,boot:state.bootStages??{},bootSignal:state.bootSignal??'not-observed',inlineFrames:state.frames?.filter(x=>x.frame.hasAttribute?.('srcdoc')).length??0,framePolicy:state.framePolicy??'not-observed',mode:state.mode,presentation:state.presentation??'not-attempted'});
 const reportJoin=state=>{const node=state.frames?.[0]?.frame;if(node?.dataset)node.dataset.vaiwlFrameJoin=JSON.stringify(joinSnapshot(state));};
 const historyBoundary=inspection=>inspection?.reason==='unsafe-native-history-list'&&historyFailureReasons.includes(inspection.historyFailure)?'unsafe-native-history-list-'+inspection.historyFailure:null;
 // Keep the latest result in the existing private layout response. Mutating
 // documentElement here both retained stale failures and invalidated host masks.
 function noteBoundaryCheck(state,phase,inspection){
  if(!state||current!==state||state.epoch!==epoch)return inspection;
  const changed=inspection?.ok===true&&state.handle&&inspection.regionEpoch!==state.handle.regionEpoch;
  if(inspection?.ok===true&&!changed){state.boundary=null;lastBoundary=null;}
  else state.boundary={phase,reason:changed?'region-identity-changed':boundaryReasons.includes(inspection?.reason)?inspection.reason:'unavailable',key:['header','reading','composer','readingViewport'].includes(inspection?.boundaryKey)?inspection.boundaryKey:null};
  return inspection;
 }
 const reportBoundary=inspection=>{const previous=lastBoundary;lastBoundary=historyBoundary(inspection)??(boundaryReasons.includes(inspection?.reason)?inspection.reason:inspection?.ok?'region-identity-changed':'native-region-changed');if(previous!==lastBoundary&&surfaceFailureStates.includes('surface-'+lastBoundary))try{onFailure('surface-'+lastBoundary);}catch{}};
 function removeReturn(state){if(state.handle)surface.setReturnControl?.(state.handle,null);state.button?.remove();state.button=null;state.returnStyle=null;adapter.setReturnControl?.(null);}
 function dispose(state,reason,retainMount=false){if(!state)return;state.resolveIdle?.(false);cancel(state.nativeDispatch?.timer);state.nativeDispatch=null;cancel(state.timer);cancel(state.renewTimer);cancel(state.appearanceTimer);unwatchInitialLayout(state);state.frameObserver?.disconnect();state.geometryObserver?.disconnect();win.removeEventListener('resize',state.geometryChanged);win.removeEventListener('scroll',state.geometryChanged,true);win.visualViewport?.removeEventListener?.('resize',state.geometryChanged);win.visualViewport?.removeEventListener?.('scroll',state.geometryChanged);state.appearanceObserver?.disconnect();state.media?.removeEventListener?.('change',state.appearanceChanged);win.removeEventListener('resize',state.appearanceChanged);state.observer?.disconnect();win.removeEventListener('message',state.listener);doc.removeEventListener?.('securitypolicyviolation',state.policyViolation);win.removeEventListener('popstate',state.changed);win.removeEventListener('hashchange',state.changed);doc.removeEventListener?.('beforetoggle',state.nativeToggle,true);doc.removeEventListener?.('toggle',state.changed,true);win.removeEventListener('pagehide',state.pagehide);removeReturn(state);if(state.handle){try{surface.suspend(state.handle,reason);}catch{}try{surface.dispose(state.handle);}catch{}if(!retainMount)try{Promise.resolve(bridge.revokeMount?.({mountId:state.handle.id})).catch(()=>{});}catch{}}}
 function stop(reason='surface-stopped'){
  if(current&&['native-region-changed','native-geometry-changed','dormant-document-changed'].includes(reason))try{onFailure('surface-'+(reason==='native-region-changed'?(lastBoundary??reason):reason));}catch{}
  const started=elapsedNow();epoch++;const run=epoch,prior=current;if(prior)recordPresentation(prior,null,'authority');current=null;
  const handoff=prior?.cancelCloseJoining===true&&['ui-frame-suspended','ui-grant-expired'].includes(reason)&&typeof bridge.releaseCancelledClose==='function';
  // Producer ownership belongs to content-session; local UI teardown cannot stop discovery.
  const cleanup=true;dispose(prior,reason,handoff);
  // Copy fixed owned-frame diagnostics only after native masks have been removed.
  if(prior?.frames&&doc.documentElement?.dataset)doc.documentElement.dataset.vaiwlFrameExit=JSON.stringify(joinSnapshot(prior));
  // A temporary native layer or geometry yield is visibility, not a user exit.
  // The document owner may start a fresh authorized mount; carry only intent,
  // never the old mount/grant or its transient suspended presentation.
  if(prior)try{onTerminated(reason,Object.freeze({mode:prior.desiredMode==='workspace'?'workspace':'reading',sidebarDesired:prior.sidebarDesired!==false,...(frameFailureReasons.includes(prior.frameFailureReason)?{frameFailureReason:prior.frameFailureReason}:{})}));}catch{/* Recovery notification cannot undo cleanup. */}
  if(handoff){
   // Destroy both frames before offering release; a partly rejoined frame may
   // already hold a grant. Never pretend that the old idle ACKs still apply.
   const isCurrent=()=>current===null&&epoch===run&&prior.frames.every(({frame})=>frame.isConnected===false)&&doc.location.href===prior.url&&Date.parse(prior.context.binding.expiresAt)>now();
   const remaining=()=>{const elapsed=elapsedNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=6000)throw Error('cancel-cleanup-deadline');return 6000-elapsed;};
   void Promise.resolve().then(async()=>{
    if(!isCurrent())return false;
    // Surface disposal is synchronous. It never proves producer idle;
    // the original content and atomic worker guards still decide.
    if(await withRequestDeadline(()=>cleanup,{timeoutMs:remaining(),now:elapsedNow,schedule,cancel})===false||!isCurrent())return false;
    return bridge.releaseCancelledClose({handle:prior.handle,binding:prior.context.binding,isCurrent,timeoutMs:remaining()});
   }).catch(()=>false).finally(()=>{try{Promise.resolve(bridge.revokeMount?.({mountId:prior.handle.id})).catch(()=>{});}catch{}});
  }
 }
 function retireSidebar(state,reason){
  const target=state.frames.find(x=>x.role==='sidebar');if(!target)return;
  state.frames=state.frames.filter(x=>x!==target);state.grants.delete('sidebar');state.pending.delete('sidebar');state.earlyJoins.delete('sidebar');
  state.roleRevision=(state.roleRevision??0)+1;state.sidebarFault=reason;state.sidebarRecoveryReady=false;
  try{surface.retireRole?.(state.handle,'sidebar');surface.suspend(state.handle,reason,'sidebar');}catch{}
  const revision=state.roleRevision;
  void Promise.resolve(bridge.releaseRole?.({mountId:state.handle.id,role:'sidebar'})).then(result=>{if(current===state&&state.roleRevision===revision&&result?.ok===true){state.sidebarRecoveryReady=true;reconcileGeometry(state);}}).catch(()=>{});
  if(state.dormant&&dormantReady())state.resolveIdle?.(true);
  publishSurface(state);arm(state);
 }
 function recoverSidebar(state,inspection){
  // Recovery is driven by a new, proved native layout, never a timer retry.
  if(!state.sidebarRecoveryReady||inspection.preserveNativeSidebar||!inspection.sidebarRect||state.sidebarRecoveryEpoch===inspection.sidebarRevision)return;
  state.sidebarRecoveryEpoch=inspection.sidebarRevision;
  // A missing owned insertion point consumes this layout attempt, not every
  // future recovery. Wait for a new proved revision; never retry on a timer.
  let target;try{target=surface.restoreRole?.(state.handle,'sidebar');}catch{return;}
  if(!target)return;state.sidebarRecoveryReady=false;
  state.frames.push({...target,window:target.frame.contentWindow});state.frameObserver?.observe(target.frame,{attributes:true,attributeFilter:['srcdoc']});
 }
 function frameDocumentsIntact(state){
  // SPA route replacement can detach our old nodes in the same native task.
  // It retires the old mount, then the document owner obtains a fresh binding;
  // it is not evidence that an attached extension frame was navigated away.
  if(current===state&&doc.location.href!==state.url&&!state.frames.some(x=>x.frame.hasAttribute?.('srcdoc'))){stop('native-document-changed');return false;}
  for(const target of [...(state.frames??[])])if(target.frame.hasAttribute?.('srcdoc')||!target.frame.isConnected||target.frame.contentWindow!==target.window){
   if(target.role==='sidebar'){retireSidebar(state,'ui-frame-document-replaced');continue;}
   if(current===state&&!state.dormant&&surface.backend==='document-flow'&&!target.frame.hasAttribute?.('srcdoc')&&target.frame.ownerDocument===doc&&!target.frame.isConnected){
    // A native same-route subtree replacement destroys the owned frame too.
    // Retire that frame and every old UI capability immediately, but preserve
    // the independent document producer. A replacement is possible only after
    // a new complete native region proof, never by re-inserting into the old
    // parent or treating a detached frame/window as still authorized.
    const context=state.context,mode=state.desiredMode,sidebarDesired=state.sidebarDesired,retiredRegionEpoch=state.handle.regionEpoch;
    stop('native-region-changed');const run=epoch;
    queueMicrotask(()=>{if(current!==null||epoch!==run||doc.location.href!==state.url||Date.parse(context.binding.expiresAt)<=now())return;void start({context,mode,retiredRegionEpoch},sidebarDesired);});
    return false;
   }
   reportJoin(state);if(current===state)stop(state.dormant&&!target.frame.hasAttribute?.('srcdoc')?'dormant-document-changed':'ui-frame-document-replaced');return false;
  }
  return true;
 }
 function valid(state,requireRegistered=true){
  if(!frameDocumentsIntact(state))return false;
  if(state.dormant||current!==state||state.epoch!==epoch||requireRegistered&&!state.registered||doc.location.href!==state.url)return false;
  const workspace=state.frames?.find(x=>x.role==='workspace');
  return !!workspace&&workspace.frame.isConnected&&workspace.frame.ownerDocument===doc&&workspace.frame.contentWindow===workspace.window;
 }
 // Public, allowlisted presentation only; never a source of UI authority.
 function publishAppearance(state,targetRole=null){
  if(!valid(state)||Date.parse(state.context.binding.expiresAt)<=now())return;
  for(const target of state.frames){if(targetRole&&target.role!==targetRole||!state.grants.has(target.role)||Date.parse(state.grants.get(target.role).expiresAt)<=now()||target.frame.contentWindow!==target.window)continue;
   try{const region=target.role==='workspace'?state.inspection.reading:state.inspection.sidebarPlacement?.parent??state.inspection.historySource;
    const appearance=readFrameAppearance(doc,{region}),key=JSON.stringify(appearance);if(!targetRole&&state.appearanceKeys.get(target.role)===key)continue;
    surface.setAppearance?.(state.handle,target.role,appearance);
    target.window.postMessage?.({type:'VAIWL_UI_APPEARANCE',role:target.role,appearance},trustedOrigin);state.appearanceKeys.set(target.role,key);
   }catch{/* Keep the current appearance; no network, replay or authorization change. */}
  }
 }
 function syncAppearanceRoots(state){
  if(!state.appearanceObserver)return;
  const nodes=new Set([doc.documentElement,doc.body].filter(Boolean));
  for(const root of [state.inspection.reading,state.inspection.sidebarPlacement?.parent??state.inspection.historySource])for(let node=root,depth=0;node&&depth<32;node=node.parentElement,depth++)nodes.add(node);
  if(state.appearanceRoots?.size===nodes.size&&[...nodes].every(node=>state.appearanceRoots.has(node)))return;
  state.appearanceObserver.disconnect();state.appearanceRoots=nodes;
  for(const node of nodes)state.appearanceObserver.observe(node,{attributes:true,attributeFilter:['class','style','dir']});
  publishAppearance(state);
 }
 function watchAppearance(state){
  state.appearanceChanged=()=>{if(current!==state||state.dormant||state.appearanceTimer!==null)return;state.appearanceTimer=schedule(()=>{state.appearanceTimer=null;if(current===state)publishAppearance(state);},0);};
  if(win.MutationObserver&&doc.documentElement){state.appearanceObserver=new win.MutationObserver(state.appearanceChanged);syncAppearanceRoots(state);}
  state.media=win.matchMedia?.('(prefers-color-scheme: dark)');state.media?.addEventListener?.('change',state.appearanceChanged);win.addEventListener('resize',state.appearanceChanged);
 }
 function inspectPresentation(state){
  if(surface.backend!=='document-flow'||!state?.handle)return noteBoundaryCheck(state,'presentation',adapter.inspect());
  const previous=surface.isSameNativeRegions(state.handle)===true&&surface.needsNativeBaselineRefresh?.(state.handle)!==true?adapter.inspectStructure(state.inspection):{ok:false,reason:'native-region-changed'};
  if(previous?.ok)return noteBoundaryCheck(state,'presentation',previous);
  // A failed intermediate proof may advance the adapter epoch even if React
  // later restores the original nodes. Re-prove that case too. The backend
  // admits only a genuinely closed native layout; a new epoch retires the old
  // mount below and cannot authorize its existing private frames.
  if(!state.nativeDispatch&&authorized(state)&&!adapter.hasNativeLayer()){
   const refreshed=surface.refreshNativeBaseline?.(state.handle,()=>adapter.inspect());
   if(refreshed?.ok&&authorized(state)&&!state.nativeDispatch&&!adapter.hasNativeLayer())return noteBoundaryCheck(state,'presentation',refreshed);
  }
  return noteBoundaryCheck(state,'presentation',previous);
 }
 function refreshGeometry(state,inspection=null){
  if(typeof surface.refreshGeometry!=='function')return true;
  try{if(surface.refreshGeometry(state.handle,inspection??inspectPresentation(state))===true)return true;}catch{}
  if(current===state){state.geometryPaused=true;state.mode='suspended';surface.suspend(state.handle,'workspace-geometry','workspace');removeReturn(state);}return false;
 }
 function renewalAllowed(state){return current===state&&!state.dormant&&state.epoch===epoch&&doc.location.href===state.url&&Date.parse(state.context.binding.expiresAt)>now()&&(!state.handle||authorized(state));}
 function reconcileGeometry(state){
  if(current!==state)return false;
  if(state.dormant){if(!frameDocumentsIntact(state))return false;ensureReturn(state);return false;}
  if(!valid(state)){if(current===state)stop('native-document-changed');return false;}
  if(adapter.hasNativeLayer()){suspend('native-layer');return false;}
  const inspection=inspectPresentation(state);
  if(inspection?.ok&&inspection.regionEpoch!==state.handle.regionEpoch){
   const context=state.context,mode=state.desiredMode;void start({context,mode},state.sidebarDesired);return false;
  }
  if(!inspection?.ok){
   reportBoundary(inspection);state.geometryPaused=true;state.mode='suspended';removeReturn(state);surface.suspend(state.handle,'workspace-geometry','workspace');return false;
  }
  // A native action is between its release and final authorization. Keep both
  // masks off; geometry callbacks must not hide its still-live target again.
  if(state.nativeDispatch)return true;
  if(!refreshGeometry(state,inspection))return false;
  state.inspection=inspection;syncAppearanceRoots(state);
  // A still-connected frame can lose its proved flow membership when native
  // siblings are replaced. Retire only that role before moving any owned slot;
  // release ACK and a fresh JOIN remain mandatory for its replacement frame.
  if(surface.isRoleCurrent?.(state.handle,'sidebar')===false)retireSidebar(state,'sidebar-placement-replaced');
  recoverSidebar(state,inspection);
  const resume=state.geometryPaused||state.mode==='suspended';state.geometryPaused=false;
  if(resume&&authorized(state)){
   if(state.desiredMode==='workspace'&&!hasProtectedFocus(state))showWorkspace();else{state.mode='reading';ensureReturn(state);}
  }
  if(state.sidebarDesired!==false&&['workspace','reading'].includes(state.mode)&&authorized(state)&&Date.parse(state.grants.get('sidebar')?.expiresAt)>now())surface.showWorkspace(state.handle,{roles:['sidebar']});
  return true;
 }
 function watchGeometry(state){
  if(typeof surface.refreshGeometry!=='function')return;
  state.geometryChanged=()=>{if(!reconcileGeometry(state))return;if(state.mode==='reading'||state.mode==='suspended')ensureReturn(state);};
  win.addEventListener('resize',state.geometryChanged);if(state.inspection.readingViewport||state.inspection.historySource)win.addEventListener('scroll',state.geometryChanged,true);win.visualViewport?.addEventListener?.('resize',state.geometryChanged);if(state.inspection.readingViewport||state.inspection.historySource)win.visualViewport?.addEventListener?.('scroll',state.geometryChanged);
  if(win.ResizeObserver){state.geometryObserver=new win.ResizeObserver(state.geometryChanged);for(const node of new Set([state.inspection.reading,...(state.inspection.homeLayoutNodes??[]),...(state.inspection.readingViewport?[state.inspection.readingViewport]:[]),...state.inspection.historyMaskRoots,...(state.inspection.sidebarPlacement?[state.inspection.sidebarPlacement.parent,state.inspection.sidebarPlacement.scrollPort]:[]),state.inspection.header,state.inspection.composer,...state.inspection.protectedRegions]))state.geometryObserver.observe(node);}
 }
 function authorized(state){const grant=state.grants.get('workspace');return valid(state)&&Date.parse(state.context.binding.expiresAt)>now()&&!!grant&&Date.parse(grant.expiresAt)>now();}
 // A private scheduling hint sampled from owned popovers, never authority.
 function publishSurface(state){
  if(!state||current!==state||!state.registered||doc.location.href!==state.url||Date.parse(state.context.binding.expiresAt)<=now()||typeof bridge.surfaceState!=='function'||typeof surface.visibility!=='function')return;
  let value;try{value=surface.visibility(state.handle);}catch{}
  const snapshot=value&&['workspace','sidebar'].every(role=>typeof value[role]==='boolean')?{workspace:value.workspace,sidebar:value.sidebar}:{workspace:null,sidebar:null};
  recordPresentation(state,snapshot);const key=JSON.stringify(snapshot);if(state.surfaceKey===key)return;
  const revision=state.surfaceRevision+1;if(!Number.isSafeInteger(revision))return;state.surfaceRevision=revision;state.surfaceKey=key;
  const failed=()=>{if(current===state&&state.surfaceRevision===revision)state.surfaceKey=null;};
  try{Promise.resolve(bridge.surfaceState({mountId:state.handle.id,revision,...snapshot})).then(result=>{if(result?.ok!==true)failed();},failed);}catch{failed();}
 }
 function showWorkspace(explicitEntry=false){
  const state=current;if(!state||state.nativeDispatch)return false;
  state.desiredMode='workspace';const handle=state.handle,intent=++state.intentEpoch;let settleLayout=null,layoutAccepted=false;
  const same=()=>current===state&&state.handle===handle;
  const fresh=(inspection=null)=>same()&&state.intentEpoch===intent&&authorized(state,inspection)&&same()&&state.intentEpoch===intent;
  try{
   // Before presentation there is no native mutation or asynchronous boundary.
   // Use the same complete proof for authorization and mount geometry. A second
   // reading scan can exhaust its own budget and wrongly destroy a valid mount.
   let inspection=inspectPresentation(state);
   if(!fresh(inspection)||!inspection?.ok||inspection.regionEpoch!==handle.regionEpoch)return false;if(adapter.hasNativeLayer()){suspend('native-layer');return false;}
   if(!refreshGeometry(state,inspection)||!fresh(inspection))return false;
   // Only explicit entry may align a proved Project scrollport. A separately
   // proved home composer may dock whenever workspace presentation is desired;
   // this never scrolls native content or changes account authorization.
   if(surface.backend!=='document-flow'&&(explicitEntry||inspection.homeDock)&&typeof surface.prepareWorkspace==='function'){
    settleLayout=surface.prepareWorkspace(handle,{explicitEntry});
    if(settleLayout){
     let aligned=adapter.inspect();
     if(!fresh(aligned)||!aligned?.ok||aligned.regionEpoch!==handle.regionEpoch||inspection.homeDock&&!aligned.homeCanvasProved){settleLayout(false);settleLayout=null;aligned=adapter.inspect();}
     if(!fresh(aligned)||!aligned?.ok||aligned.regionEpoch!==handle.regionEpoch||!refreshGeometry(state,aligned))return false;
     inspection=aligned;state.inspection=aligned;
    }
   }
   state.presentation='showing';reportJoin(state);const shown=surface.showWorkspace(handle,{roles:[...state.grants.keys()].filter(role=>role!=='sidebar'||state.sidebarDesired!==false)});state.presentation=shown===false?'show-refused':'show-returned';reportJoin(state);
   if(!same())return false;
   // showPopover can synchronously surrender to native input or a native layer.
   // The mount loop may then open its other surface: close that residue without
   // disposing frames or committing the superseded workspace intent.
   if(!fresh()||adapter.hasNativeLayer()){
    surface.suspend(handle);if(!same())return false;
    state.pendingWakeEntry=false;
    if(adapter.hasNativeLayer()){state.mode='suspended';removeReturn(state);}
    else{state.mode='reading';ensureReturn(state);}
    return false;
   }
   // A successful call is not proof that the browser opened the popover.
   // Preserve a usable return entry when the mount declined presentation.
   if(shown===false||typeof surface.visibility==='function'&&surface.visibility(handle)?.workspace!==true){
    state.presentation='show-refused';surface.suspend(handle,'workspace-geometry','workspace');
    if(same()){if(adapter.hasNativeLayer()){state.mode='suspended';removeReturn(state);}else{state.mode='reading';ensureReturn(state);}reportJoin(state);}return false;
   }
   removeReturn(state);state.mode='workspace';layoutAccepted=true;return true;
  }finally{settleLayout?.(layoutAccepted);publishSurface(state);}
 }
 // Keyboard entry removes its focused return button. Transfer that explicit
 // intent into our frame; automatic presentation and pointer entry do not move focus.
 function focusFrame(role){const state=current;if(!state||state.mode!=='workspace'||!authorized(state)||adapter.hasNativeLayer())return false;const target=state.frames.find(x=>x.role===role);if(!target?.frame?.focus)return false;target.frame.focus({preventScroll:true});let active=doc.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;return active===target.frame;}
 function workspaceEntered(state){
  if(current!==state||state.mode!=='workspace'||!authorized(state))return;
  try{Promise.resolve(bridge.workspaceEntered?.({mountId:state.handle.id})).catch(()=>{});}catch{/* Presentation never waits for the private entry notification. */}
 }
 const slotOccupied=(state,slot)=>state.inspection.returnPlacement!=='header-gap'&&([...slot.children].some(node=>node!==state.button)||[...(slot.childNodes??[])].some(node=>node.nodeType===3&&node.textContent.trim()));
 function ensureReturn(state){
  if((!state.dormant&&!authorized(state))||adapter.hasNativeLayer()){removeReturn(state);return false;}
  const inspection=state.dormant?state.inspection:adapter.inspect(),slot=inspection.navigationSlot;
  const headerGap=inspection.returnPlacement==='header-gap',alreadyPresent=!!state.button;
  if(!inspection.ok||!state.dormant&&inspection.regionEpoch!==state.handle.regionEpoch||Object.hasOwn(inspection,'returnSlot')&&!inspection.returnSlot||!slot?.isConnected||slot!==state.inspection.navigationSlot||(!headerGap&&adapter.isReturnSlotCurrent?.(inspection)===false)){removeReturn(state);return false;}
  if(state.dormant&&slotOccupied(state,slot)){removeReturn(state);return false;}
  if(!state.button){const button=doc.createElement('button');button.type='button';button.dataset.vaOwned=state.handle.id;button.setAttribute('aria-label','返回工作空间');button.title='返回工作空间';button.innerHTML=workspaceReturnIcon;button.style.cssText='width:32px;height:32px;flex:none;display:inline-grid;place-items:center;border:0;border-radius:9px;background:transparent;color:inherit;cursor:pointer';button.addEventListener('click',event=>{if(current!==state||event?.isTrusted!==true)return;const keyboardEntry=event.detail===0&&doc.activeElement===button;if(state.dormant){if(slotOccupied(state,slot)||adapter.isReturnSlotCurrent?.(state.inspection)===false){removeReturn(state);return;}if(state.waking||doc.location.href!==state.url||adapter.hasNativeLayer())return;state.waking=true;state.pendingWakeEntry=true;try{Promise.resolve(onWake()).catch(()=>{state.pendingWakeEntry=false;}).finally(()=>{state.waking=false;if(state.dormant)state.pendingWakeEntry=false;});}catch{state.waking=false;state.pendingWakeEntry=false;}return;}if(state.nativeDispatch){state.nativeDispatch.interrupt();if(current!==state)return;}state.sidebarDesired=true;if(!showWorkspace(true))return;if(keyboardEntry)focusFrame('workspace');workspaceEntered(state);});if(headerGap){const box=inspection.returnSlot;Object.assign(button.style,{boxSizing:'border-box',margin:'0',padding:'0',position:'fixed',left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px',zIndex:'30',pointerEvents:'auto'});doc.body.append(button);}else slot.append(button);state.button=button;surface.setReturnControl?.(state.handle,button);adapter.setReturnControl?.(button);}
  if(headerGap){
   // A fresh inspect already proved an installed button, including full native
   // paint and actual hit targets. Reuse that same-task result, not a prior
   // event's geometry. New insertion can change :has()/layout and still needs
   // a complete post-insertion proof; dormant inspection is also only identity.
   const box=alreadyPresent&&!state.dormant?inspection.returnSlot:adapter.getReturnControlRect?.(inspection);
   if(!box){removeReturn(state);return false;}Object.assign(state.button.style,{boxSizing:'border-box',margin:'0',padding:'0',position:'fixed',left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px',zIndex:'30',pointerEvents:'auto'});state.returnStyle=state.button.getAttribute('style');
  }
  return true;
 }
 function nativeSurrender(state,event){
  if(current!==state)return;
  if(event?.role==='sidebar'){if(event.reason==='native-list')state.sidebarDesired=false;if(event.phase!=='closing')publishSurface(state);return;}
  if(event?.reason==='native-gesture-complete'){
   // A title/Project control is not an instruction to enter composer mode.
   // Resume only through the current document, scope and geometry checks.
   try{if(surface.backend==='document-flow'&&!state.dormant&&authorized(state))reconcileGeometry(state);}finally{publishSurface(state);}return;
  }
  if(['native-change','workspace-geometry','native-layer'].includes(event?.reason)){state.geometryPaused=event.reason!=='native-layer';state.mode='suspended';removeReturn(state);publishSurface(state);return;}
  if(['native-reading','native-input'].includes(event?.reason))state.desiredMode='reading';
  // beforetoggle closes synchronously but still reports the old visibility.
  // Only revoke old intent here; DOM work and surface reporting wait for toggle.
  if(event?.reason==='native-reading'&&event.phase==='closing'){
   if(current!==state||state.dormant||state.geometryPaused)return;
   if(state.mode==='waiting'){state.resumeMode='reading';state.intentEpoch++;return;}
   if(state.mode!=='reading')state.intentEpoch++;
   state.mode='reading';return;
  }
  try{if(event?.reason==='native-input')state.pendingWakeEntry=false;if(current===state&&state.resuming&&event?.reason==='native-input')state.pendingNativeInput=true;if(current!==state||state.dormant)return;
   // The pointer handoff has now closed the workspace and restored native
   // flow. Re-proof here: popover state/gesture attributes need not produce a
   // later geometry event, and waiting for renewal would lose the live frames.
   if(state.geometryPaused){if(event?.reason!=='native-input'||!reconcileGeometry(state))return;}
   if(state.mode==='waiting'){if(event?.reason==='native-input'){state.pendingNativeInput=true;state.intentEpoch++;}return;}if(event?.reason!=='native-reading'||state.mode!=='reading')state.intentEpoch++;state.mode='reading';if(!authorized(state))return;if(adapter.hasNativeLayer()){suspend('native-layer');return;}ensureReturn(state);}finally{publishSurface(state);}}
 function hasProtectedFocus(state){
  if(surface.backend==='document-flow')return surface.hasNativeInputFocus(state.handle)===true;
  const roots=[state.inspection.composer,state.inspection.header,...(state.inspection.protectedRegions??[])];
  for(let active=doc.activeElement;active?.isConnected&&active.ownerDocument===doc;active=active.shadowRoot?.activeElement){
   if(roots.some(node=>node?.isConnected&&node.ownerDocument===doc&&(node===active||node.contains?.(active))))return true;
  }return false;
 }
 function isWorkspacePresented(){
  const state=current,handle=state?.handle,intent=state?.intentEpoch;
  const same=()=>{const target=state?.frames.find(x=>x.role==='workspace'),grant=state?.grants.get('workspace');return !!state&&current===state&&state.handle===handle&&state.intentEpoch===intent&&state.mode==='workspace'&&!state.dormant&&state.registered&&state.epoch===epoch&&doc.location.href===state.url&&Date.parse(state.context.binding.expiresAt)>now()&&!!grant&&Date.parse(grant.expiresAt)>now()&&target?.frame.isConnected&&target.frame.ownerDocument===doc&&target.frame.contentWindow===target.window&&!target.frame.hasAttribute?.('srcdoc');};
  try{const inspection=inspectPresentation(state);return same()&&!state.geometryPaused&&inspection?.ok&&inspection.regionEpoch===handle.regionEpoch&&!adapter.hasNativeLayer()&&!hasProtectedFocus(state)&&surface.visibility(handle)?.workspace===true&&same();}catch{return false;}
 }
 function showReading(){const state=current;try{if(state){state.intentEpoch++;state.desiredMode='reading';}if(!state||!authorized(state))return false;if(adapter.hasNativeLayer()){suspend('native-layer');return false;}surface.showReading(state.handle);state.mode='reading';reconcileGeometry(state);return ensureReturn(state);}finally{publishSurface(state);}}
 function showNativeReading(){const state=current;try{if(state){state.intentEpoch++;state.desiredMode='reading';}if(!state||!authorized(state)||adapter.hasNativeLayer())return false;if(surface.backend==='document-flow')surface.showReading(state.handle);else surface.suspend(state.handle);state.mode='reading';ensureReturn(state);return true;}finally{publishSurface(state);}}
 function beginNativeDispatch(){
  const state=current;if(!state||state.nativeDispatch||!authorized(state)||adapter.hasNativeLayer())return null;
  const held={timer:null};state.nativeDispatch=held;
  const release=()=>{
   if(state.nativeDispatch!==held)return;
   state.nativeDispatch=null;cancel(held.timer);
   if(current===state&&authorized(state)){try{reconcileGeometry(state);}finally{publishSurface(state);}}
  };
  // A trusted Return supersedes the pending native action before presenting
  // anything. Its captured intent guard fails synchronously, including a late
  // authorization reply; ordinary/automatic presentation keeps the hold veto.
  held.interrupt=()=>{if(current!==state||state.nativeDispatch!==held)return;state.intentEpoch++;state.nativeDispatch=null;cancel(held.timer);};
  held.timer=schedule(release,6000);
  return release;
 }
 function suspend(reason='native-layer'){const state=current;if(state)state.pendingWakeEntry=false;if(state?.dormant){removeReturn(state);return;}try{if(state)state.intentEpoch++;if(!state?.handle)return;removeReturn(state);surface.suspend(state.handle,reason);state.mode='suspended';}finally{publishSurface(state);}}
 const leaseUntil=state=>Math.min(Date.parse(state.context.binding.expiresAt),state.grants.has('workspace')?Date.parse(state.grants.get('workspace').expiresAt):Infinity);
 function arm(state){if(state.dormant)return;cancel(state.timer);const until=leaseUntil(state);state.timer=schedule(()=>{if(current===state&&!state.dormant)stop('ui-grant-expired');},Math.max(0,until-now()));if((state.renewalCeiling===null||until>state.renewalCeiling)&&typeof bridge.renewSession==='function'&&(!state.handle||state.grants.has('workspace'))&&!state.renewing&&state.renewTimer===null)state.renewTimer=schedule(()=>{state.renewTimer=null;void renewSession(state);},Math.max(1,Math.min(10000,(until-now())/2)));}
 async function renewSession(state){
  if(state.dormant)return;const roleRevision=state.roleRevision??0,priorUntil=leaseUntil(state);
  if(!renewalAllowed(state)){if(current===state)stop('stale-session-renewal');return;}state.renewing=true;let renewalStage=null;
  try{
   const raw=await withRequestDeadline(()=>bridge.renewSession({handle:state.handle,binding:state.context.binding}),{timeoutMs:6000,now:elapsedNow,schedule,cancel});
   if(current!==state||state.dormant)return;renewalStage='local-validity';if(!renewalAllowed(state))throw Error('stale-session-renewal');
   renewalStage='ack';
   const ack=structuredClone(raw),binding=ack?.binding,keys=['documentToken','producerToken','browserDocumentId','routeEpoch','origin'];
   const future=value=>Number.isFinite(Date.parse(value))&&Date.parse(value)>now()&&Date.parse(value)<=now()+20000;
   if(ack?.ok!==true||!binding||Object.keys(binding).sort().join(',')!==[...keys,'expiresAt'].sort().join(',')||keys.some(k=>binding[k]!==state.context.binding[k])||!future(binding.expiresAt)||!Array.isArray(ack.grants)||state.handle&&(!ack.grants.length||!ack.grants.some(g=>g.role==='workspace')))throw Error('invalid-session-renewal');
   const next=new Map();for(const grant of ack.grants){
    if(grant?.role==='sidebar'&&(state.roleRevision??0)!==roleRevision)continue;
    const previous=state.grants.get(grant?.role);if(!previous||next.has(grant.role)||['id','mountId','role','parentDocumentId','uiDocumentId','scopeGrantId'].some(k=>grant[k]!==previous[k])||!future(grant.expiresAt)){
     if(grant?.role==='sidebar'){next.delete('sidebar');retireSidebar(state,'sidebar-renew-unavailable');continue;}throw Error('invalid-session-renewal');
    }next.set(grant.role,Object.freeze({...grant}));
   }
   if((state.roleRevision??0)!==roleRevision&&state.grants.has('sidebar'))next.set('sidebar',state.grants.get('sidebar'));
   renewalStage='adapter';if(adapter.updateBinding(binding)!==true)throw Error('invalid-binding-renewal');
   if(state.grants.has('sidebar')&&!next.has('sidebar'))retireSidebar(state,'sidebar-renew-unavailable');
   state.context={...state.context,binding:Object.freeze({...binding})};state.grants=next;
   // A successful read may still be capped by the original session/context expiry.
   // Do not halve the remaining interval repeatedly when no lease time was gained.
   // Keep the absolute expiry timer: this never extends authority or retries a denial.
   state.renewalCeiling=leaseUntil(state)<=priorUntil?priorUntil:null;
   // A transient paint-budget refusal can leave a static reading page without
   // an entry and without another DOM event. The ordinary successful renewal
   // is a fresh authority boundary: re-prove a missing entry once, preserving
   // reading intent, focus and sidebar. No extra retry timer or cached proof.
   if(state.mode==='reading'&&!state.button&&!state.geometryPaused&&!state.nativeDispatch)try{ensureReturn(state);}catch{removeReturn(state);}
  }catch{if(current===state&&!state.dormant){if(renewalStage)try{onFailure('surface-session-renew-'+renewalStage);}catch{}stop('session-renew-failed');}}
  finally{state.renewing=false;if(current===state&&!state.dormant){arm(state);publishSurface(state);}}
 }
 function unwatchInitialLayout(state){
  state.layoutObserver?.disconnect();state.layoutObserver=null;
  if(!state.layoutChanged)return;
  win.removeEventListener('resize',state.layoutChanged);
  for(const type of ['transitionend','animationend'])win.removeEventListener(type,state.layoutChanged,true);
  win.visualViewport?.removeEventListener?.('resize',state.layoutChanged);
  state.layoutChanged=null;
 }
 function watchInitialLayout(state){
  if(state.layoutChanged)return;
  // A CSS breakpoint can become safe without any native DOM mutation. Retry
  // the complete proof on a layout event only, under the original binding.
  state.layoutChanged=()=>{void mountState(state).catch(()=>{if(current===state)stop('surface-start-failed');});};
  win.addEventListener('resize',state.layoutChanged);
  // Native CSS can finish without another class/style mutation. This is an
  // event-driven fresh proof, not a longer timeout or a polling retry.
  for(const type of ['transitionend','animationend'])win.addEventListener(type,state.layoutChanged,true);
  win.visualViewport?.addEventListener?.('resize',state.layoutChanged);
  if(win.MutationObserver){
   state.layoutObserver=new win.MutationObserver(state.layoutChanged);
   state.layoutObserver.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','role','tabindex','contenteditable','inert']});
  }
 }
 async function start(options,sidebarDesired=true){
  stop('surface-restart');lastBoundary=null;const run=epoch,state={startedAt:elapsedNow(),epoch:run,intentEpoch:0,url:doc.location.href,registered:false,handle:null,grants:new Map(),earlyJoins:new Map(),pending:new Set(),button:null,timer:null,renewTimer:null,renewing:false,renewalCeiling:null,observer:null,appearanceObserver:null,appearanceTimer:null,appearanceKeys:new Map(),frames:[],surfaceKey:null,surfaceRevision:0,mode:'waiting',desiredMode:options?.mode??initialMode,resumeMode:options?.mode??initialMode,dormant:false,waking:false,geometryPaused:false,geometryRevision:0,boundary:null};current=state;
  // Layout restarts and the document owner may carry a same-scope display
  // choice. This is not authority: every new mount still needs fresh grants.
  state.sidebarDesired=sidebarDesired!==false;
  state.retiredRegionEpoch=Number.isSafeInteger(options?.retiredRegionEpoch)?options.retiredRegionEpoch:null;
  state.pagehide=()=>{if(current===state)stop('page-hidden');};win.addEventListener('pagehide',state.pagehide);
  try{
   state.context=options?.context??await adapter.start(options);if(current!==state)return null;
   return await mountState(state);
  }catch{if(current===state)stop('surface-start-failed');return null;}
 }
 async function mountState(state){
  if(current!==state||state.mounting||state.handle||doc.location.href!==state.url||Date.parse(state.context.binding.expiresAt)<=now())return null;
  state.inspection=noteBoundaryCheck(state,'initial',adapter.inspect());
  if(!state.inspection?.ok){
   reportBoundary(state.inspection);
   state.layoutFailure=surfaceFailureStates.includes('surface-'+lastBoundary)?'surface-'+lastBoundary:null;
   watchInitialLayout(state);
   arm(state);return null;
  }
  // A detached owned sibling alone is not a new native topology. Waiting for
  // a newer region epoch bounds repeated removal and never creates a grant.
  if(state.retiredRegionEpoch!==null&&state.inspection.regionEpoch<=state.retiredRegionEpoch){watchInitialLayout(state);arm(state);return null;}
  state.retiredRegionEpoch=null;
  unwatchInitialLayout(state);state.mounting=true;
  try{
   state.policyViolation=event=>{if(current!==state||!['frame-src','child-src'].includes(event.effectiveDirective))return;let blocked;try{blocked=new URL(event.blockedURI);}catch{return;}if(blocked.protocol+'//'+blocked.host!==trustedOrigin)return;state.framePolicy=event.disposition==='enforce'?'frame-blocked':'frame-report-only';reportJoin(state);};doc.addEventListener?.('securitypolicyviolation',state.policyViolation);
   state.handle=await surface.mount(state.context,state.inspection,{onSurrender:event=>nativeSurrender(state,event),onManagementChanged:()=>{const g=state.grants.get('sidebar'),f=state.frames.find(f=>f.role==='sidebar');if(current===state&&valid(state)&&authorized(state)&&g&&Date.parse(g.expiresAt)>now()&&f)f.window.postMessage({type:'VAIWL_UI_MANAGEMENT_CHANGED',role:'sidebar',mountId:state.handle.id,grantId:g.id},trustedOrigin);},onSidebarScroll:scroll=>{const g=state.grants.get('sidebar'),frame=state.frames.find(f=>f.role==='sidebar');if(current===state&&valid(state)&&authorized(state)&&g&&Date.parse(g.expiresAt)>now()&&frame)frame.window.postMessage({type:'VAIWL_UI_SIDEBAR_VIEWPORT',role:'sidebar',mountId:state.handle.id,grantId:g.id,scroll},trustedOrigin);}});if(current!==state){dispose(state,'stale-mount');return null;}
   state.layoutFailure=null;lastBoundary=null;
   state.loadedRoles=new Set();state.joinedRoles=new Set();state.moduleRoles=new Set();
   state.frames=surface.frames(state.handle).map(value=>({...value,window:value.frame.contentWindow}));if(!state.frames.some(x=>x.role==='workspace')||new Set(state.frames.map(x=>x.role)).size!==state.frames.length||state.frames.some(x=>!['workspace','sidebar'].includes(x.role)))throw Error('incomplete-dual-surface');
   const initiallyWithoutSidebar=!state.frames.some(target=>target.role==='sidebar');
   for(const target of state.frames)target.frame.addEventListener?.('load',()=>{if(current===state){state.loadedRoles.add(target.role);reportJoin(state);frameDocumentsIntact(state);}},{once:true});
   reportJoin(state);
   if(!frameDocumentsIntact(state))return null;
   if(win.MutationObserver){state.frameObserver=new win.MutationObserver(()=>{if(current===state)frameDocumentsIntact(state);});for(const {frame}of state.frames)state.frameObserver.observe(frame,{attributes:true,attributeFilter:['srcdoc']});}
   state.listener=event=>{void receive(state,event);};win.addEventListener('message',state.listener);
   let ack;
   try{ack=await bridge.registerMount({handle:state.handle});}
   catch{
    // A lost registration reply is not an authority denial. Retire this mount
    // before the document owner may use its existing bounded fresh handshake.
    // Never retry this handle or accept its late acknowledgement.
    if(current===state)stop('mount-transport-unavailable');return null;
   }
   if(current!==state)return null;if(ack?.ok!==true)throw Error('mount-registration-denied');state.registered=true;reportJoin(state);
   if(!valid(state))throw Error('stale-mount-registration');
   // A sidebar omitted at first mount has no prior frame/grant to release.
   // A later proved native slot may create it, but never inherit workspace's
   // grant or skip the new frame's own JOIN and parent confirmation.
   if(initiallyWithoutSidebar)state.sidebarRecoveryReady=true;
   state.nativeToggle=event=>{if(event.newState==='open'&&!event.target.closest?.('[data-va-owned]'))suspend('native-layer');};doc.addEventListener?.('beforetoggle',state.nativeToggle,true);
   state.changed=()=>{try{if(!reconcileGeometry(state))return;if(adapter.hasNativeLayer())suspend('native-layer');else if(state.mode==='reading'||state.mode==='suspended')ensureReturn(state);}finally{publishSurface(state);}};
   doc.addEventListener?.('toggle',state.changed,true);
   win.addEventListener('popstate',state.changed);win.addEventListener('hashchange',state.changed);
   if(win.MutationObserver){const gap=state.inspection.returnPlacement==='header-gap';state.observer=new win.MutationObserver(records=>{if(gap&&records?.length&&records.every(r=>r.target===state.button&&r.attributeName==='style'&&state.button.getAttribute('style')===state.returnStyle))return;state.changed();});state.observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class','aria-modal',...(gap?['style','hidden','inert','aria-hidden']:[])]});}
   watchGeometry(state);watchAppearance(state);arm(state);const queued=[...state.earlyJoins.values()];state.earlyJoins.clear();for(const event of queued)void receive(state,event);return state.handle;
  }catch(error){if(current===state){
   const code='surface-'+(historyBoundary(state.inspection)??(state.inspection?.reason==='missing-or-ambiguous-native-boundary'&&['history','header','reading','composer','navigationSlot'].includes(state.inspection.boundaryKey)?'missing-'+state.inspection.boundaryKey:state.inspection?.ok===false&&boundaryReasons.includes(state.inspection.reason)?state.inspection.reason:error?.message));
   try{if(surfaceFailureStates.includes(code)&&state.layoutFailure!==code)onFailure(code);}catch{}
   if(surface.backend==='document-flow'&&!state.handle&&error instanceof NativeFlowPreflightError&&error.message!=='native-flow-check-failed'){
    // A topology refusal happens before mount has side effects. Preserve only
    // this document's waiting controller; fresh grants are still mandatory.
    // Do not retry arbitrary exceptions, partial mounts or registration denial.
    doc.removeEventListener?.('securitypolicyviolation',state.policyViolation);state.policyViolation=null;
    state.layoutFailure=code;watchInitialLayout(state);arm(state);
   }else stop('mount-unavailable');
  }return null;}finally{state.mounting=false;}
 }
 async function receive(state,event){
  if(current!==state||!frameDocumentsIntact(state))return;
  // Fixed diagnostic classes only; an untrusted signal never grants a join.
  if(current===state&&event.data?.type==='VAIWL_UI_BOOT'&&['workspace','sidebar'].includes(event.data?.role)){const frame=state.frames.find(x=>x.role===event.data.role);state.bootSignal=event.origin!==trustedOrigin?'origin-rejected':event.source!==frame?.window?'source-rejected':Object.getPrototypeOf(event.data)!==Object.prototype?'record-rejected':'correlated';reportJoin(state);}
  if(current===state&&event.data?.type==='VAIWL_UI_JOIN'&&['workspace','sidebar'].includes(event.data?.role)){
   const frame=state.frames.find(x=>x.role===event.data.role);
   state.joinSignal=event.origin!==trustedOrigin?'origin-rejected':event.source!==frame?.window?'source-rejected':Object.getPrototypeOf(event.data)!==Object.prototype?'record-rejected':'correlated';reportJoin(state);
  }
  if(current!==state||state.epoch!==epoch||doc.location.href!==state.url||event.origin!==trustedOrigin)return;
  const data=event.data;if(!data||Object.getPrototypeOf(data)!==Object.prototype)return;
  const target=state.frames.find(x=>x.role===data.role);if(!target||!target.frame.isConnected||target.frame.ownerDocument!==doc||event.source!==target.window||target.frame.contentWindow!==target.window)return;
  if(exactHostRecord(data,['type','role','stage'])&&data.type==='VAIWL_UI_BOOT'&&['entry-ready','dom-ready','entry-resource-failed','script-error','promise-rejected','module-ready'].includes(data.stage)){if(data.stage==='module-ready')state.moduleRoles?.add(data.role);(state.bootStages??={})[data.role]=data.stage;reportJoin(state);return;}
  if(state.dormant){
   if(exactHostRecord(data,['type','role','requestId'])&&data.type==='VAIWL_UI_IDLE_ACK'&&data.requestId===state.idleRequestId){state.idleAcks.add(data.role);if(dormantReady())state.resolveIdle?.(true);}
   return;
  }
  if(exactHostRecord(data,['type','role','scroll'])&&data.type==='VAIWL_UI_SIDEBAR_RESTORE'&&data.role==='sidebar'){
   if(surface.backend==='document-flow'&&valid(state)&&authorized(state)&&Date.parse(state.grants.get('sidebar')?.expiresAt)>now()&&(data.scroll===null||Number.isSafeInteger(data.scroll)&&data.scroll>=0&&data.scroll<=100000000))try{surface.restoreSidebar?.(state.handle,data.scroll,{apply:!state.nativeDispatch&&!adapter.hasNativeLayer()});}catch{}return;
  }
  if(exactHostRecord(data,['type','role','top','bottom'])&&data.type==='VAIWL_UI_REVEAL_ROW'&&data.role==='sidebar'){
   if(surface.backend==='document-flow'&&valid(state)&&authorized(state)&&Date.parse(state.grants.get('sidebar')?.expiresAt)>now()&&!state.nativeDispatch&&!adapter.hasNativeLayer()&&Number.isInteger(data.top)&&Number.isInteger(data.bottom)&&data.top>=0&&data.bottom>data.top&&data.bottom<=1000000)try{surface.revealSidebar?.(state.handle,{top:data.top,bottom:data.bottom});}catch{}return;
  }
  if(exactHostRecord(data,['type','role','top','bottom'])&&data.type==='VAIWL_UI_REVEAL_FOCUS'&&data.role==='sidebar'){
   if(valid(state)&&authorized(state)&&Date.parse(state.grants.get('sidebar')?.expiresAt)>now()&&!state.nativeDispatch&&!adapter.hasNativeLayer()&&doc.activeElement===target.frame&&Number.isInteger(data.top)&&Number.isInteger(data.bottom)&&data.top>=0&&data.bottom>data.top&&data.bottom<=(surface.backend==='document-flow'?1000000:1024)){try{surface.revealSidebar?.(state.handle,{top:data.top,bottom:data.bottom});}catch{}}
   return;
  }
  if(exactHostRecord(data,['type','role','x','y','delta'])&&data.type==='VAIWL_UI_SIDEBAR_WHEEL'&&data.role==='sidebar'){
   if(surface.backend!=='document-flow'&&valid(state)&&authorized(state)&&Date.parse(state.grants.get('sidebar')?.expiresAt)>now()&&!state.nativeDispatch&&!adapter.hasNativeLayer()&&[data.x,data.y,data.delta].every(Number.isInteger)&&data.x>=0&&data.x<=4096&&data.y>=0&&data.y<=(surface.backend==='document-flow'?1000000:1024)&&data.delta!==0&&Math.abs(data.delta)<=1024){try{surface.scrollSidebar?.(state.handle,{x:data.x,y:data.y,delta:data.delta});}catch{}}
   return;
  }
  if(exactHostRecord(data,['type','role','height'])&&data.type==='VAIWL_UI_INTRINSIC_SIZE'&&data.role==='sidebar'){
   if(valid(state)&&authorized(state)&&Date.parse(state.grants.get('sidebar')?.expiresAt)>now()&&Number.isInteger(data.height)&&data.height>=128&&data.height<=(surface.backend==='document-flow'?1000000:1024)){try{surface.resizeSidebar?.(state.handle,data.height,{apply:!state.nativeDispatch&&!adapter.hasNativeLayer()});}catch{/* A size hint cannot retire another role. */}}
   return;
  }
  // Correlated fixed failure metadata only; it can withdraw, never grant, UI access.
  if(exactHostRecord(data,['role','type','reason'])&&data.type==='VAIWL_UI_SUSPEND'&&frameFailureReasons.includes(data.reason)){try{onFailure('surface-frame-'+data.reason);}catch{}if(data.role==='sidebar')retireSidebar(state,'ui-frame-suspended');else{state.frameFailureReason=data.reason;stop('ui-frame-suspended');}return;}
  if(exactHostRecord(data,['role','type'])&&['VAIWL_UI_SUSPEND','VAIWL_UI_EXIT'].includes(data.type)){if(data.role==='sidebar'&&data.type==='VAIWL_UI_SUSPEND')retireSidebar(state,'sidebar-suspended');else stop(data.type==='VAIWL_UI_EXIT'?'ui-user-exit':'ui-frame-suspended');return;}
  if(data.type==='VAIWL_UI_JOIN'){state.joinedRoles?.add(data.role);reportJoin(state);}
  if(!valid(state,false)||Object.keys(data).sort().join(',')!=='nonce,role,type'||data.type!=='VAIWL_UI_JOIN'||!tokenOK(data.nonce)||state.pending.has(data.role)||state.grants.has(data.role))return;
  if(!state.registered){if(!state.earlyJoins.has(data.role))state.earlyJoins.set(data.role,{origin:event.origin,source:event.source,data:{type:data.type,role:data.role,nonce:data.nonce}});return;}
  state.pending.add(data.role);
  try{
   const ack=await bridge.confirmParent({mountId:state.handle.id,documentToken:state.handle.documentToken,regionEpoch:state.handle.regionEpoch,nonce:data.nonce,role:data.role});
   if(!valid(state)||!state.frames.includes(target)||event.source!==target.window||target.frame.contentWindow!==target.window)return;
   const grant=ack?.grant;if(ack?.ok!==true||!tokenOK(grant?.id)||grant.mountId!==state.handle.id||grant.role!==data.role||grant.parentDocumentId!==state.context.binding.browserDocumentId||!tokenOK(grant.uiDocumentId)||!tokenOK(grant.scopeGrantId)||!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=now())return;
   state.grants.set(data.role,Object.freeze({...grant}));reportJoin(state);publishAppearance(state,data.role);arm(state);
   // Private bridge callback after the authenticated two-channel JOIN only.
   // Public BOOT/geometry/VIEW receipts never establish a recovery generation.
   if(data.role==='workspace'&&authorized(state))bridge.workspaceEstablished?.({binding:state.context.binding,mountId:state.handle.id});
   if(data.role==='sidebar'&&['workspace','reading'].includes(state.mode)&&authorized(state))reconcileGeometry(state);
   if(state.cancelCloseJoining&&authorized(state)){state.cancelCloseJoining=false;bridge.cancelledCloseReady?.();}
   if(state.mode==='waiting'&&authorized(state)){
    // Native input can precede listener installation or the second grant. Preserve
    // that intent without exposing a surface or return entry before authorization.
    const entered=state.pendingWakeEntry===true,entryEpoch=state.intentEpoch+1;state.pendingWakeEntry=false;
    if(adapter.hasNativeLayer())suspend('native-layer');else if(state.pendingNativeInput||hasProtectedFocus(state))showNativeReading();else if((state.resumeMode??initialMode)==='reading')showReading();else if(showWorkspace(entered)&&entered&&state.intentEpoch===entryEpoch&&!state.pendingNativeInput&&!adapter.hasNativeLayer()&&!hasProtectedFocus(state))workspaceEntered(state);
   }
  }catch{state.presentation='join-exception';reportJoin(state);/* A failed public join never authorizes a surface. */}finally{state.pending.delete(data.role);reportJoin(state);}
 }
 // Advisory only: a busy worker must leave the current leases and frames intact.
 // Final release still repeats the guard after both frames acknowledge clearing.
 async function checkIdle({isCurrent,timeoutMs=6000}={}){
  const state=current;
  const intact=()=>current===state&&!!state&&!state.dormant&&!state.renewing&&state.pending.size===0&&['reading','suspended'].includes(state.mode)&&authorized(state)&&isCurrent()===true;
  if(typeof isCurrent!=='function'||typeof bridge.checkIdleMount!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>6000)return false;
  try{
   if(!intact())return false;
   const visible=surface.visibility?.(state.handle);if(visible?.workspace!==false||visible?.sidebar!==false)return false;
   const result=await withRequestDeadline(()=>bridge.checkIdleMount({handle:state.handle,timeoutMs}),{timeoutMs,now:elapsedNow,schedule,cancel});
   const after=surface.visibility?.(state.handle);
   return result?.ok===true&&intact()&&after?.workspace===false&&after?.sidebar===false;
  }catch{return false;}
 }
 // Caller must freeze its producer and obtain worker admission first. This
 // local transition only relinquishes UI authority; it does not grant idle permission.
 function postFrameTransition(state,type,requestId){
  for(const target of [...state.frames]){
   try{if(typeof target.window.postMessage!=='function')throw Error('frame-unavailable');target.window.postMessage({type,role:target.role,requestId},trustedOrigin);}
   catch(error){if(current===state&&target.role==='sidebar')retireSidebar(state,'sidebar-transition-unavailable');else throw error;}
   if(current!==state)throw Error('stale-frame-transition');
  }
 }
 function enterDormant(){
  const state=current;if(typeof onWake!=='function'||!state||!['reading','suspended'].includes(state.mode)||state.renewing||state.pending.size||!authorized(state)||typeof surface.visibility!=='function')return false;
  let visible;try{visible=surface.visibility(state.handle);}catch{return false;}
  if(visible?.workspace!==false||visible?.sidebar!==false||current!==state||state.frames.some(({frame,window})=>frame.contentWindow!==window))return false;
  state.idleRequestId=crypto.randomUUID();state.idleAcks=new Set();state.idleReady=new Promise(resolve=>{state.resolveIdle=resolve;});
  state.dormant=true;state.mode='reading';state.intentEpoch++;state.geometryRevision++;state.registered=false;
  for(const key of ['timer','renewTimer','appearanceTimer']){cancel(state[key]);state[key]=null;}
  state.grants.clear();state.earlyJoins.clear();state.appearanceKeys.clear();
  try{surface.suspend(state.handle,'ui-idle');}catch{if(current===state)stop('idle-suspend-failed');return false;}
  if(current!==state)return false;
  try{postFrameTransition(state,'VAIWL_UI_IDLE',state.idleRequestId);}catch{if(current===state)stop('idle-frame-unavailable');return false;}
  ensureReturn(state);return true;
 }
 // Clear both actual frame roots before asking the worker to retire this mount.
 // Failure leaves the native reading surface and fresh-wake entry available.
 async function settleDormant({isCurrent,timeoutMs=6000}={}){
  const state=current;if(!state?.dormant||state.settling||typeof isCurrent!=='function'||typeof bridge.releaseIdleMount!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>6000)return false;
  const started=elapsedNow();state.settling=true;state.releaseBusy=false;state.cancelCloseReady=false;
  const remaining=()=>{const elapsed=elapsedNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=timeoutMs)throw Error('idle-release-timeout');return timeoutMs-elapsed;};
  const check=()=>current===state&&state.dormant&&dormantReady()&&isCurrent()===true;
  try{
   if(await withRequestDeadline(()=>state.idleReady,{timeoutMs:remaining(),now:elapsedNow,schedule,cancel})!==true||!check())return false;
   const result=await withRequestDeadline(()=>bridge.releaseIdleMount({handle:state.handle,timeoutMs:remaining()}),{timeoutMs:remaining(),now:elapsedNow,schedule,cancel});
   if(result?.ok===false&&result.reason==='ui-release-busy'&&check())state.releaseBusy=true;
   return result?.ok===true&&check();
  }catch{return false;}finally{state.settling=false;}
 }
 // Preserve only the original producer lease after a busy final release.
 // Cleared frame grants are never restored by this transport-only renewal.
 async function renewDormantLease({timeoutMs=6000}={}){
  const state=current;if(!dormantReady()||state.releaseBusy!==true||state.settling||state.resuming||state.renewing||typeof bridge.renewDormantBinding!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>6000)return false;
  const prior=state.context.binding,keys=['documentToken','producerToken','browserDocumentId','routeEpoch','origin'];
  const intact=()=>current===state&&state.context.binding===prior&&dormantReady()&&Date.parse(prior.expiresAt)>now();
  if(!intact())return false;state.releaseBusy=false;state.renewing=true;
  try{
   const raw=await withRequestDeadline(()=>bridge.renewDormantBinding({handle:state.handle,binding:prior,timeoutMs}),{timeoutMs,now:elapsedNow,schedule,cancel});
   if(!intact())return false;const ack=structuredClone(raw),binding=ack?.binding,expiry=Date.parse(binding?.expiresAt);
   if(ack?.ok!==true||!binding||Object.keys(binding).sort().join(',')!==[...keys,'expiresAt'].sort().join(',')||keys.some(k=>binding[k]!==prior[k])||!Number.isFinite(expiry)||expiry<=now()||expiry>now()+20000)return false;
   if(adapter.updateBinding(binding)!==true||!intact())return false;
   state.context={...state.context,binding:Object.freeze({...binding})};state.cancelCloseReady=true;return true;
  }catch{return false;}finally{state.renewing=false;}
 }
 // A confirmed busy release did not retire the mount. Cancel that close with
 // the original producer; cleared UI grants must still be acquired anew.
 function cancelDormantClose(){
  const state=current;
  if(!dormantReady()||state.cancelCloseReady!==true||state.settling||state.resuming||state.renewing||state.pending.size||Date.parse(state.context.binding.expiresAt)<=now())return false;
  const inspection=adapter.inspect();
  if(!inspection?.ok||inspection.regionEpoch!==state.handle.regionEpoch||inspection.navigationSlot!==state.inspection.navigationSlot||!inspection.navigationSlot?.isConnected)return false;
  const requestId=state.idleRequestId;state.cancelCloseReady=false;
  state.dormant=false;state.registered=true;state.mode='waiting';state.resumeMode='reading';state.cancelCloseJoining=true;state.surfaceKey=null;state.pendingWakeEntry=false;state.intentEpoch++;state.idleAcks.clear();removeReturn(state);
  try{
   if(!valid(state))throw Error('stale-close-cancellation');arm(state);
   postFrameTransition(state,'VAIWL_UI_WAKE',requestId);
   return true;
  }catch{if(current===state)stop('close-cancellation-failed');return false;}
 }
 // The caller supplies a newly verified binding; existing frames still need
 // their normal private JOIN/parent confirmation before any surface can open.
 async function resumeDormant(options,{mode='workspace'}={}){
  const state=current;if(!['workspace','reading'].includes(mode)||!dormantReady()||state.resuming||state.settling||typeof surface.rebind!=='function'||typeof surface.isRebindCurrent!=='function')return null;
  // Record the wake intent before async authorization; later native input may supersede it.
  state.desiredMode=mode;state.resuming=true;state.pendingNativeInput=false;state.intentEpoch++;
  const previous=state.context.binding,requestId=state.idleRequestId;
  const intact=()=>current===state&&state.dormant&&state.epoch===epoch&&doc.location.href===state.url&&state.frames.every(({frame,window})=>frame.isConnected&&frame.ownerDocument===doc&&frame.contentWindow===window);
  try{
   const context=await adapter.start(options);if(!intact())throw Error('stale-dormant-resume');
   const binding=context?.binding;
   if(!binding||binding.browserDocumentId!==previous.browserDocumentId||binding.origin!==previous.origin||binding.producerToken===previous.producerToken||!tokenOK(binding.producerToken)||!tokenOK(binding.documentToken)||!(Date.parse(binding.expiresAt)>now()))throw Error('fresh-binding-required');
   const inspection=adapter.inspect();if(!inspection?.ok||inspection.navigationSlot!==state.inspection.navigationSlot||!inspection.navigationSlot?.isConnected)throw Error('invalid-return-slot');
   const handle=surface.rebind(state.handle,context,inspection);
   state.handle=handle;state.context=context;state.inspection=inspection;syncAppearanceRoots(state);state.renewalCeiling=null;
   const ack=await withRequestDeadline(()=>bridge.registerMount({handle}),{now:elapsedNow,schedule,cancel});
   if(!intact()||ack?.ok!==true||surface.isRebindCurrent(state.handle,adapter.inspect())!==true)throw Error('mount-registration-denied');
   state.dormant=false;state.resuming=false;state.registered=true;state.mode='waiting';state.resumeMode=mode;state.surfaceKey=null;state.idleAcks.clear();removeReturn(state);
   if(!valid(state))throw Error('stale-mount-registration');arm(state);
   postFrameTransition(state,'VAIWL_UI_WAKE',requestId);
   return handle;
  }catch{if(current===state)stop('dormant-resume-failed');return null;}
 }
 function dormantReady(){
  const state=current;
  return !!state&&state.dormant&&state.epoch===epoch&&doc.location.href===state.url&&state.frames.some(x=>x.role==='workspace')&&state.frames.every(({frame,window,role})=>state.idleAcks.has(role)&&frame.isConnected&&frame.ownerDocument===doc&&frame.contentWindow===window);
 }
 function withNativeReading(read){
  const state=current,revision=state?.intentEpoch,handle=state?.handle;
  const guard=()=>!!state&&current===state&&state.handle===handle&&state.intentEpoch===revision&&!state.resuming&&authorized(state)&&!adapter.hasNativeLayer();
  if(!guard())return null;
  return surface.withNativeReading?.(handle,read,guard)??null;
 }
 function localStatus(){
  const state=current;if(!state)return 'surface-controller-absent';if(state.epoch!==epoch||doc.location.href!==state.url)return 'surface-document-stale';
  if(state.dormant)return dormantReady()?'dormant':'unavailable';
  if(!state.handle&&state.layoutFailure)return state.layoutFailure;
  if(!state.registered||state.mode==='waiting'){
   // A stalled owned-frame handshake is not indefinitely 'connecting'. This
   // reads fixed controller state only; it neither probes DOM nor retries JOIN.
   const elapsed=elapsedNow()-state.startedAt;
   if(!Number.isFinite(elapsed)||elapsed<6000)return 'connecting';
   if(state.framePolicy==='frame-blocked')return 'surface-frame-policy-blocked';
   const boot=Object.values(state.bootStages??{});
   if(boot.includes('entry-resource-failed'))return 'surface-frame-resource-failed';
   if(boot.some(x=>['script-error','promise-rejected'].includes(x)))return 'surface-frame-script-failed';
   if(!state.registered)return 'surface-mount-registration-pending';
   if(['origin-rejected','source-rejected','record-rejected'].includes(state.joinSignal))return 'surface-frame-join-rejected';
   if(!state.moduleRoles?.has('workspace'))return 'surface-frame-module-pending';
   if(!state.joinedRoles?.has('workspace'))return 'surface-frame-join-pending';
   if(!state.grants.has('workspace'))return 'surface-frame-grant-pending';
   return 'surface-frame-presentation-pending';
  }
  if(state.geometryPaused)return 'surface-geometry-paused';
  const time=now();if(!Number.isFinite(time)||!(Date.parse(state.context.binding.expiresAt)>time))return 'surface-binding-expired';
  if(!state.grants.has('workspace'))return 'surface-grants-incomplete';
  if(!(Date.parse(state.grants.get('workspace').expiresAt)>time))return 'surface-grants-expired';
  if(!state.frames.some(x=>x.role==='workspace')||!state.frames.every(({frame,window})=>frame.isConnected&&frame.ownerDocument===doc&&frame.contentWindow===window))return 'surface-frames-detached';
  // Transport readiness is not presentation. Report private controller mode
  // without inspecting native content, moving focus or opening a surface.
  if(state.mode==='reading')return 'reading';
  if(state.mode==='suspended')return 'suspended';
  return state.mode==='workspace'?'ready':'unavailable';
 }
 function presentationSnapshot(){
  const state=current;if(!state)return null;
  let visibility=null,layoutRefusal=null,layoutGeometry=[];try{visibility=surface.visibility?.(state.handle);layoutRefusal=surface.activeLayoutFailure?.(state.handle)??null;layoutGeometry=surface.activeLayoutGeometry?.(state.handle)??[];}catch{}
  return {boundary:state.boundary?{...state.boundary}:null,layoutGeometry,layoutRefusal,mode:state.mode,desiredMode:state.desiredMode,transitions:structuredClone(transitions),attempt:state.presentation??'not-attempted',registered:state.registered===true,frames:state.frames.filter(x=>x.frame.isConnected&&x.frame.contentWindow===x.window).length,grants:state.grants.size,workspace:typeof visibility?.workspace==='boolean'?visibility.workspace:null,sidebar:typeof visibility?.sidebar==='boolean'?visibility.sidebar:null,geometryPaused:state.geometryPaused===true,returnPresent:state.button?.isConnected===true};
 }
 return Object.freeze({readNativeManagement(){const s=current;return s&&valid(s)&&authorized(s)&&s.handle?surface.readNativeManagement?.(s.handle)??[]:[];},isNativeStructureCurrent(){try{const state=current;if(!state||!authorized(state))return false;const inspection=inspectPresentation(state);return current===state&&inspection?.ok===true&&inspection.regionEpoch===state.handle.regionEpoch;}catch{return false;}},presentationSnapshot,localStatus,withNativeReading,cancelDormantClose,renewDormantLease,idleReleaseBusy:()=>current?.releaseBusy===true&&dormantReady(),checkIdle,enterDormant,settleDormant,dormantReady,resumeDormant,start,sidebarPresentationIntent:()=>current?.sidebarDesired??null,presentationIntent:()=>current?.desiredMode==='workspace'?'workspace':'reading',presentationMode:()=>current?.mode==='workspace'?'workspace':'reading',showWorkspace(){if(current)current.sidebarDesired=true;return showWorkspace(true);},isWorkspacePresented,showReading,showNativeReading,beginNativeDispatch,focusFrame,isFrameTarget(role,node){return !!current&&authorized(current)&&current.frames.some(x=>x.role===role&&x.frame===node);},isReturnTarget:node=>!!current&&current.button===node&&authorized(current),intentGuard(){const state=current,revision=state?.intentEpoch;return ()=>!!state&&current===state&&state.intentEpoch===revision&&authorized(state)&&!adapter.hasNativeLayer();},readingGuard(){const state=current,revision=state?.intentEpoch;return ()=>!!state&&current===state&&state.intentEpoch===revision&&state.mode==='reading'&&authorized(state)&&!adapter.hasNativeLayer();},suspend,stop,revoke:()=>stop('ui-authority-revoked')});
}

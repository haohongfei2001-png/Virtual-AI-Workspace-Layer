import {readFrameAppearance} from './frame-appearance.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {exactHostRecord} from './contract.mjs';
/** Isolated content composition. Public window messages only correlate an owned
 * frame. Grants and mount registration travel exclusively over the trusted bridge. */
export function createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin,onTerminated=()=>{},onWake=null,initialMode='workspace',now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const origin=new URL(extensionOrigin);if(onWake!==null&&typeof onWake!=='function'||!['workspace','reading'].includes(initialMode)||origin.protocol!=='chrome-extension:'||origin.host===''||!['','/'].includes(origin.pathname)||origin.search||origin.hash||!doc?.defaultView||!adapter||!surface||typeof bridge?.registerMount!=='function'||typeof bridge.confirmParent!=='function')throw Error('invalid-surface-controller');
 const trustedOrigin=`${origin.protocol}//${origin.host}`,win=doc.defaultView;
 let epoch=0,current=null;
 function removeReturn(state){state.button?.remove();state.button=null;}
 function dispose(state,reason){if(!state)return;state.resolveIdle?.(false);cancel(state.timer);cancel(state.renewTimer);cancel(state.appearanceTimer);state.geometryObserver?.disconnect();win.removeEventListener('resize',state.geometryChanged);win.visualViewport?.removeEventListener?.('resize',state.geometryChanged);state.appearanceObserver?.disconnect();state.media?.removeEventListener?.('change',state.appearanceChanged);win.removeEventListener('resize',state.appearanceChanged);state.observer?.disconnect();win.removeEventListener('message',state.listener);win.removeEventListener('popstate',state.changed);win.removeEventListener('hashchange',state.changed);doc.removeEventListener?.('beforetoggle',state.nativeToggle,true);doc.removeEventListener?.('toggle',state.changed,true);win.removeEventListener('pagehide',state.pagehide);removeReturn(state);if(state.handle){try{surface.suspend(state.handle,reason);}catch{}try{surface.dispose(state.handle);}catch{}try{Promise.resolve(bridge.revokeMount?.({mountId:state.handle.id})).catch(()=>{});}catch{}}}
 function stop(reason='surface-stopped'){epoch++;const prior=current;current=null;try{adapter.stop();}catch{/* Surface cleanup must still complete. */}dispose(prior,reason);if(prior)try{onTerminated(reason,Object.freeze({mode:prior.mode==='workspace'?'workspace':'reading'}));}catch{/* Recovery notification cannot undo cleanup. */}}
 function valid(state,requireRegistered=true){
  if(state.dormant||current!==state||state.epoch!==epoch||requireRegistered&&!state.registered||doc.location.href!==state.url)return false;
  const inspection=adapter.inspect();return inspection?.ok&&inspection.regionEpoch===state.handle.regionEpoch&&state.frames.every(({frame})=>frame.isConnected&&frame.ownerDocument===doc);
 }
 // Public, allowlisted presentation only; never a source of UI authority.
 function publishAppearance(state,targetRole=null){
  if(!valid(state)||Date.parse(state.context.binding.expiresAt)<=now())return;
  let appearance;try{appearance=readFrameAppearance(doc);}catch{return;}const key=JSON.stringify(appearance);
  for(const target of state.frames){if(targetRole&&target.role!==targetRole||!state.grants.has(target.role)||Date.parse(state.grants.get(target.role).expiresAt)<=now()||target.frame.contentWindow!==target.window)continue;if(!targetRole&&state.appearanceKeys.get(target.role)===key)continue;
   try{target.window.postMessage?.({type:'VAIWL_UI_APPEARANCE',role:target.role,appearance},trustedOrigin);state.appearanceKeys.set(target.role,key);}catch{/* Keep the current appearance; no network, replay or authorization change. */}
  }
 }
 function watchAppearance(state){
  state.appearanceChanged=()=>{if(current!==state||state.dormant||state.appearanceTimer!==null)return;state.appearanceTimer=schedule(()=>{state.appearanceTimer=null;if(current===state)publishAppearance(state);},0);};
  if(win.MutationObserver&&doc.documentElement){state.appearanceObserver=new win.MutationObserver(state.appearanceChanged);for(const node of [doc.documentElement,doc.body])if(node)state.appearanceObserver.observe(node,{attributes:true,attributeFilter:['class','style','dir']});}
  state.media=win.matchMedia?.('(prefers-color-scheme: dark)');state.media?.addEventListener?.('change',state.appearanceChanged);win.addEventListener('resize',state.appearanceChanged);
 }
 function refreshGeometry(state){
  if(typeof surface.refreshGeometry!=='function')return true;
  try{if(surface.refreshGeometry(state.handle,adapter.inspect())===true)return true;}catch{}
  if(current===state)stop('native-geometry-changed');return false;
 }
 function geometryContinuity(state){
  return current===state&&state.epoch===epoch&&state.registered&&doc.location.href===state.url&&Date.parse(state.context.binding.expiresAt)>now()&&state.grants.size===2&&[...state.grants.values()].every(g=>Date.parse(g.expiresAt)>now())&&state.frames.every(({frame,window})=>frame.isConnected&&frame.ownerDocument===doc&&frame.contentWindow===window)&&adapter.isSameNativeRegions?.(state.inspection)===true;
 }
 function reconcileGeometry(state){
  if(current!==state)return false;
  if(state.dormant){if(doc.location.href!==state.url||state.frames.some(({frame,window})=>!frame.isConnected||frame.ownerDocument!==doc||frame.contentWindow!==window)){stop('dormant-document-changed');return false;}ensureReturn(state);return false;}
  if(!valid(state)){
   if(adapter.inspect()?.reason==='unsafe-native-geometry'&&geometryContinuity(state)){
    if(!state.geometryPaused){state.geometryPaused=true;state.geometryRevision++;state.intentEpoch++;}
    cancel(state.renewTimer);state.renewTimer=null;state.mode='suspended';removeReturn(state);surface.suspend(state.handle,'temporary-native-geometry');return false;
   }
   stop('native-region-changed');return false;
  }
  if(state.geometryPaused){
   if(!geometryContinuity(state)){stop('native-region-changed');return false;}
   if(!refreshGeometry(state))return false;
   state.geometryPaused=false;state.mode='reading';ensureReturn(state);arm(state);return true;
  }
  return refreshGeometry(state);
 }
 function watchGeometry(state){
  if(typeof surface.refreshGeometry!=='function')return;
  state.geometryChanged=()=>{if(!reconcileGeometry(state))return;if(state.mode==='reading'||state.mode==='suspended')ensureReturn(state);};
  win.addEventListener('resize',state.geometryChanged);win.visualViewport?.addEventListener?.('resize',state.geometryChanged);
  if(win.ResizeObserver){state.geometryObserver=new win.ResizeObserver(state.geometryChanged);for(const node of new Set([state.inspection.reading,...state.inspection.historyMaskRoots,state.inspection.header,state.inspection.composer,...state.inspection.protectedRegions]))state.geometryObserver.observe(node);}
 }
 function authorized(state){return !state.geometryPaused&&valid(state)&&Date.parse(state.context.binding.expiresAt)>now()&&state.frames.every(({role})=>{const grant=state.grants.get(role);return grant&&Date.parse(grant.expiresAt)>now();});}
 // A private scheduling hint sampled from owned popovers, never authority.
 function publishSurface(state){
  if(!state||current!==state||!state.registered||doc.location.href!==state.url||Date.parse(state.context.binding.expiresAt)<=now()||typeof bridge.surfaceState!=='function'||typeof surface.visibility!=='function')return;
  let value;try{value=surface.visibility(state.handle);}catch{}
  const snapshot=value&&['workspace','sidebar'].every(role=>typeof value[role]==='boolean')?{workspace:value.workspace,sidebar:value.sidebar}:{workspace:null,sidebar:null};
  const key=JSON.stringify(snapshot);if(state.surfaceKey===key)return;
  const revision=state.surfaceRevision+1;if(!Number.isSafeInteger(revision))return;state.surfaceRevision=revision;state.surfaceKey=key;
  const failed=()=>{if(current===state&&state.surfaceRevision===revision)state.surfaceKey=null;};
  try{Promise.resolve(bridge.surfaceState({mountId:state.handle.id,revision,...snapshot})).then(result=>{if(result?.ok!==true)failed();},failed);}catch{failed();}
 }
 function showWorkspace(){
  const state=current;if(!state)return false;
  const handle=state.handle,intent=++state.intentEpoch;
  const same=()=>current===state&&state.handle===handle;
  const fresh=()=>same()&&state.intentEpoch===intent&&authorized(state)&&same()&&state.intentEpoch===intent;
  try{
   if(!fresh())return false;if(adapter.hasNativeLayer()){suspend('native-layer');return false;}
   if(!refreshGeometry(state)||!fresh())return false;
   const shown=surface.showWorkspace(handle);
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
   if(shown===false)return false;
   removeReturn(state);state.mode='workspace';return true;
  }finally{publishSurface(state);}
 }
 function workspaceEntered(state){
  if(current!==state||state.mode!=='workspace'||!authorized(state))return;
  try{Promise.resolve(bridge.workspaceEntered?.({mountId:state.handle.id})).catch(()=>{});}catch{/* Presentation never waits for the private entry notification. */}
 }
 function ensureReturn(state){
  if((!state.dormant&&!authorized(state))||adapter.hasNativeLayer()){removeReturn(state);return false;}
  const inspection=state.dormant?state.inspection:adapter.inspect(),slot=inspection.navigationSlot;
  if(!slot?.isConnected||slot!==state.inspection.navigationSlot){removeReturn(state);return false;}
  if(state.dormant&&([...slot.children].some(node=>node!==state.button)||[...(slot.childNodes??[])].some(node=>node.nodeType===3&&node.textContent.trim()))){removeReturn(state);return false;}
  if(!state.button){const button=doc.createElement('button');button.type='button';button.dataset.vaOwned=state.handle.id;button.setAttribute('aria-label','返回工作空间');button.textContent='▦';button.addEventListener('click',event=>{if(current!==state||event?.isTrusted!==true)return;if(state.dormant){if(state.waking||doc.location.href!==state.url||adapter.hasNativeLayer())return;state.waking=true;state.pendingWakeEntry=true;try{Promise.resolve(onWake()).catch(()=>{state.pendingWakeEntry=false;}).finally(()=>{state.waking=false;if(state.dormant)state.pendingWakeEntry=false;});}catch{state.waking=false;state.pendingWakeEntry=false;}return;}if(!showWorkspace())return;workspaceEntered(state);});slot.append(button);state.button=button;}return true;
 }
 function nativeSurrender(state,event){try{if(event?.reason==='native-input')state.pendingWakeEntry=false;if(current===state&&state.resuming&&event?.reason==='native-input')state.pendingNativeInput=true;if(current!==state||state.dormant||state.geometryPaused)return;if(state.mode==='waiting'){if(event?.reason==='native-input'){state.pendingNativeInput=true;state.intentEpoch++;}return;}if(event?.reason!=='native-reading'||state.mode!=='reading')state.intentEpoch++;state.mode='reading';if(!authorized(state))return;if(adapter.hasNativeLayer()){suspend('native-layer');return;}ensureReturn(state);}finally{publishSurface(state);}}
 function hasProtectedFocus(state){
  const roots=[state.inspection.composer,state.inspection.header,...(state.inspection.protectedRegions??[])];
  for(let active=doc.activeElement;active?.isConnected&&active.ownerDocument===doc;active=active.shadowRoot?.activeElement){
   if(roots.some(node=>node?.isConnected&&node.ownerDocument===doc&&(node===active||node.contains?.(active))))return true;
  }return false;
 }
 function showReading(){const state=current;try{if(state)state.intentEpoch++;if(!state||!authorized(state))return false;if(adapter.hasNativeLayer()){suspend('native-layer');return false;}surface.showReading(state.handle);state.mode='reading';return ensureReturn(state);}finally{publishSurface(state);}}
 function showNativeReading(){const state=current;try{if(state)state.intentEpoch++;if(!state||!authorized(state)||adapter.hasNativeLayer())return false;surface.suspend(state.handle);state.mode='reading';return ensureReturn(state);}finally{publishSurface(state);}}
 function suspend(reason='native-layer'){const state=current;if(state)state.pendingWakeEntry=false;if(state?.dormant){removeReturn(state);return;}try{if(state)state.intentEpoch++;if(!state?.handle)return;removeReturn(state);surface.suspend(state.handle,reason);state.mode='suspended';}finally{publishSurface(state);}}
 function arm(state){if(state.dormant)return;cancel(state.timer);const until=Math.min(Date.parse(state.context.binding.expiresAt),...Array.from(state.grants.values(),g=>Date.parse(g.expiresAt)));state.timer=schedule(()=>{if(current===state&&!state.dormant)stop('ui-grant-expired');},Math.max(0,until-now()));if(!state.geometryPaused&&typeof bridge.renewSession==='function'&&state.grants.size===2&&!state.renewing&&state.renewTimer===null)state.renewTimer=schedule(()=>{state.renewTimer=null;void renewSession(state);},Math.max(1,Math.min(10000,(until-now())/2)));}
 async function renewSession(state){
  if(state.dormant||state.geometryPaused)return;const geometryRevision=state.geometryRevision;
  if(!authorized(state)){if(current===state)stop('stale-session-renewal');return;}state.renewing=true;
  try{
   const raw=await withRequestDeadline(()=>bridge.renewSession({handle:state.handle,binding:state.context.binding}),{timeoutMs:6000,now:elapsedNow,schedule,cancel});
   if(current!==state||state.dormant||state.geometryRevision!==geometryRevision)return;if(!authorized(state))throw Error('stale-session-renewal');
   const ack=structuredClone(raw),binding=ack?.binding,keys=['documentToken','producerToken','browserDocumentId','routeEpoch','origin'];
   const future=value=>Number.isFinite(Date.parse(value))&&Date.parse(value)>now()&&Date.parse(value)<=now()+20000;
   if(ack?.ok!==true||!binding||Object.keys(binding).sort().join(',')!==[...keys,'expiresAt'].sort().join(',')||keys.some(k=>binding[k]!==state.context.binding[k])||!future(binding.expiresAt)||!Array.isArray(ack.grants)||ack.grants.length!==2)throw Error('invalid-session-renewal');
   const next=new Map();for(const grant of ack.grants){const previous=state.grants.get(grant?.role);if(!previous||next.has(grant.role)||['id','mountId','role','parentDocumentId','uiDocumentId','scopeGrantId'].some(k=>grant[k]!==previous[k])||!future(grant.expiresAt))throw Error('invalid-session-renewal');next.set(grant.role,Object.freeze({...grant}));}
   if(adapter.updateBinding(binding)!==true)throw Error('invalid-binding-renewal');
   state.context={...state.context,binding:Object.freeze({...binding})};state.grants=next;
  }catch{if(current===state&&!state.dormant&&state.geometryRevision===geometryRevision)stop('session-renew-failed');}
  finally{state.renewing=false;if(current===state&&!state.dormant){arm(state);publishSurface(state);}}
 }
 async function start(options){
  stop('surface-restart');const run=epoch,state={epoch:run,intentEpoch:0,url:doc.location.href,registered:false,handle:null,grants:new Map(),earlyJoins:new Map(),pending:new Set(),button:null,timer:null,renewTimer:null,renewing:false,observer:null,appearanceObserver:null,appearanceTimer:null,appearanceKeys:new Map(),surfaceKey:null,surfaceRevision:0,mode:'waiting',dormant:false,waking:false,geometryPaused:false,geometryRevision:0};current=state;
  try{
   state.context=await adapter.start(options);if(current!==state)return null;
   state.inspection=adapter.inspect();if(!state.inspection?.ok||!state.inspection.navigationSlot?.isConnected)throw Error('invalid-return-slot');
   state.handle=await surface.mount(state.context,state.inspection,{onSurrender:event=>nativeSurrender(state,event)});if(current!==state){dispose(state,'stale-mount');return null;}
   state.frames=surface.frames(state.handle).map(value=>({...value,window:value.frame.contentWindow}));if(state.frames.length!==2||new Set(state.frames.map(x=>x.role)).size!==2||state.frames.some(x=>!['workspace','sidebar'].includes(x.role)))throw Error('incomplete-dual-surface');
   state.listener=event=>{void receive(state,event);};win.addEventListener('message',state.listener);
   const ack=await bridge.registerMount({handle:state.handle});if(current!==state)return null;if(ack?.ok!==true)throw Error('mount-registration-denied');state.registered=true;
   if(!valid(state))throw Error('stale-mount-registration');
   state.nativeToggle=event=>{if(event.newState==='open'&&!event.target.closest?.('[data-va-owned]'))suspend('native-layer');};doc.addEventListener?.('beforetoggle',state.nativeToggle,true);
   state.changed=()=>{try{if(!reconcileGeometry(state))return;if(adapter.hasNativeLayer())suspend('native-layer');else if(state.mode==='reading'||state.mode==='suspended')ensureReturn(state);}finally{publishSurface(state);}};
   state.pagehide=()=>{if(current===state)stop('page-hidden');};win.addEventListener('pagehide',state.pagehide);doc.addEventListener?.('toggle',state.changed,true);
   win.addEventListener('popstate',state.changed);win.addEventListener('hashchange',state.changed);
   if(win.MutationObserver){state.observer=new win.MutationObserver(state.changed);state.observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class','aria-modal']});}
   watchGeometry(state);watchAppearance(state);arm(state);const queued=[...state.earlyJoins.values()];state.earlyJoins.clear();for(const event of queued)void receive(state,event);return state.handle;
  }catch{if(current===state)stop('mount-unavailable');return null;}
 }
 async function receive(state,event){
  if(current!==state||state.epoch!==epoch||doc.location.href!==state.url||event.origin!==trustedOrigin)return;
  const data=event.data;if(!data||Object.getPrototypeOf(data)!==Object.prototype)return;
  const target=state.frames.find(x=>x.role===data.role);if(!target||!target.frame.isConnected||target.frame.ownerDocument!==doc||event.source!==target.window||target.frame.contentWindow!==target.window)return;
  if(state.dormant){
   if(exactHostRecord(data,['type','role','requestId'])&&data.type==='VAIWL_UI_IDLE_ACK'&&data.requestId===state.idleRequestId){state.idleAcks.add(data.role);if(dormantReady())state.resolveIdle?.(true);}
   return;
  }
  if(exactHostRecord(data,['role','type'])&&['VAIWL_UI_SUSPEND','VAIWL_UI_EXIT'].includes(data.type)){stop(data.type==='VAIWL_UI_EXIT'?'ui-user-exit':'ui-frame-suspended');return;}
  if(!valid(state,false)||Object.keys(data).sort().join(',')!=='nonce,role,type'||data.type!=='VAIWL_UI_JOIN'||!tokenOK(data.nonce)||state.pending.has(data.role)||state.grants.has(data.role))return;
  if(!state.registered){if(!state.earlyJoins.has(data.role))state.earlyJoins.set(data.role,{origin:event.origin,source:event.source,data:{type:data.type,role:data.role,nonce:data.nonce}});return;}
  state.pending.add(data.role);
  try{
   const ack=await bridge.confirmParent({mountId:state.handle.id,documentToken:state.handle.documentToken,regionEpoch:state.handle.regionEpoch,nonce:data.nonce,role:data.role});
   if(!valid(state)||event.source!==target.window||target.frame.contentWindow!==target.window)return;
   const grant=ack?.grant;if(ack?.ok!==true||!tokenOK(grant?.id)||grant.mountId!==state.handle.id||grant.role!==data.role||grant.parentDocumentId!==state.context.binding.browserDocumentId||!tokenOK(grant.uiDocumentId)||!tokenOK(grant.scopeGrantId)||!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=now())return;
   state.grants.set(data.role,Object.freeze({...grant}));publishAppearance(state,data.role);arm(state);
   if(state.cancelCloseJoining&&authorized(state)){state.cancelCloseJoining=false;bridge.cancelledCloseReady?.();}
   if(state.mode==='waiting'&&authorized(state)){
    // Native input can precede listener installation or the second grant. Preserve
    // that intent without exposing a surface or return entry before authorization.
    const entered=state.pendingWakeEntry===true,entryEpoch=state.intentEpoch+1;state.pendingWakeEntry=false;
    if(adapter.hasNativeLayer())suspend('native-layer');else if(state.pendingNativeInput||hasProtectedFocus(state))showNativeReading();else if((state.resumeMode??initialMode)==='reading')showReading();else if(showWorkspace()&&entered&&state.intentEpoch===entryEpoch&&!state.pendingNativeInput&&!adapter.hasNativeLayer()&&!hasProtectedFocus(state))workspaceEntered(state);
   }
  }catch{/* A failed public join never authorizes a surface. */}finally{state.pending.delete(data.role);}
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
  for(const target of state.frames){try{if(typeof target.window.postMessage!=='function')throw Error('idle-frame-unavailable');target.window.postMessage({type:'VAIWL_UI_IDLE',role:target.role,requestId:state.idleRequestId},trustedOrigin);}catch{if(current===state)stop('idle-frame-unavailable');return false;}if(current!==state)return false;}
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
   for(const target of state.frames){target.window.postMessage({type:'VAIWL_UI_WAKE',role:target.role,requestId},trustedOrigin);if(current!==state)throw Error('stale-close-cancellation');}
   return true;
  }catch{if(current===state)stop('close-cancellation-failed');return false;}
 }
 // The caller supplies a newly verified binding; existing frames still need
 // their normal private JOIN/parent confirmation before any surface can open.
 async function resumeDormant(options,{mode='workspace'}={}){
  const state=current;if(!['workspace','reading'].includes(mode)||!dormantReady()||state.resuming||state.settling||typeof surface.rebind!=='function'||typeof surface.isRebindCurrent!=='function')return null;
  state.resuming=true;state.pendingNativeInput=false;state.intentEpoch++;
  const previous=state.context.binding,requestId=state.idleRequestId;
  const intact=()=>current===state&&state.dormant&&state.epoch===epoch&&doc.location.href===state.url&&state.frames.every(({frame,window})=>frame.isConnected&&frame.ownerDocument===doc&&frame.contentWindow===window);
  try{
   const context=await adapter.start(options);if(!intact())throw Error('stale-dormant-resume');
   const binding=context?.binding;
   if(!binding||binding.browserDocumentId!==previous.browserDocumentId||binding.origin!==previous.origin||binding.producerToken===previous.producerToken||!tokenOK(binding.producerToken)||!tokenOK(binding.documentToken)||!(Date.parse(binding.expiresAt)>now()))throw Error('fresh-binding-required');
   const inspection=adapter.inspect();if(!inspection?.ok||inspection.navigationSlot!==state.inspection.navigationSlot||!inspection.navigationSlot?.isConnected)throw Error('invalid-return-slot');
   const handle=surface.rebind(state.handle,context,inspection);
   state.handle=handle;state.context=context;state.inspection=inspection;
   const ack=await withRequestDeadline(()=>bridge.registerMount({handle}),{now:elapsedNow,schedule,cancel});
   if(!intact()||ack?.ok!==true||surface.isRebindCurrent(state.handle,adapter.inspect())!==true)throw Error('mount-registration-denied');
   state.dormant=false;state.resuming=false;state.registered=true;state.mode='waiting';state.resumeMode=mode;state.surfaceKey=null;state.idleAcks.clear();removeReturn(state);
   if(!valid(state))throw Error('stale-mount-registration');arm(state);
   for(const target of state.frames){target.window.postMessage({type:'VAIWL_UI_WAKE',role:target.role,requestId},trustedOrigin);if(current!==state)throw Error('stale-dormant-resume');}
   return handle;
  }catch{if(current===state)stop('dormant-resume-failed');return null;}
 }
 function dormantReady(){
  const state=current;
  return !!state&&state.dormant&&state.epoch===epoch&&doc.location.href===state.url&&state.frames.length===2&&state.frames.every(({frame,window,role})=>state.idleAcks.has(role)&&frame.isConnected&&frame.ownerDocument===doc&&frame.contentWindow===window);
 }
 return Object.freeze({cancelDormantClose,renewDormantLease,idleReleaseBusy:()=>current?.releaseBusy===true&&dormantReady(),checkIdle,enterDormant,settleDormant,dormantReady,resumeDormant,start,presentationMode:()=>current?.mode==='workspace'?'workspace':'reading',showWorkspace,showReading,showNativeReading,focusFrame(role){const state=current;if(!state||state.mode!=='workspace'||!authorized(state)||adapter.hasNativeLayer())return false;const target=state.frames.find(x=>x.role===role);if(!target?.frame?.focus)return false;target.frame.focus({preventScroll:true});let active=doc.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;return active===target.frame;},isFrameTarget(role,node){return !!current&&authorized(current)&&current.frames.some(x=>x.role===role&&x.frame===node);},isReturnTarget:node=>!!current&&current.button===node&&authorized(current),intentGuard(){const state=current,revision=state?.intentEpoch;return ()=>!!state&&current===state&&state.intentEpoch===revision&&authorized(state)&&!adapter.hasNativeLayer();},readingGuard(){const state=current,revision=state?.intentEpoch;return ()=>!!state&&current===state&&state.intentEpoch===revision&&state.mode==='reading'&&authorized(state)&&!adapter.hasNativeLayer();},suspend,stop,revoke:()=>stop('ui-authority-revoked')});
}

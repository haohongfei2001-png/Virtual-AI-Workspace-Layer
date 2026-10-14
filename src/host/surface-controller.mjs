import {readFrameAppearance} from './frame-appearance.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {exactHostRecord} from './contract.mjs';
/** Isolated content composition. Public window messages only correlate an owned
 * frame. Grants and mount registration travel exclusively over the trusted bridge. */
export function createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin,onTerminated=()=>{},initialMode='workspace',now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const origin=new URL(extensionOrigin);if(!['workspace','reading'].includes(initialMode)||origin.protocol!=='chrome-extension:'||origin.host===''||!['','/'].includes(origin.pathname)||origin.search||origin.hash||!doc?.defaultView||!adapter||!surface||typeof bridge?.registerMount!=='function'||typeof bridge.confirmParent!=='function')throw Error('invalid-surface-controller');
 const trustedOrigin=`${origin.protocol}//${origin.host}`,win=doc.defaultView;
 let epoch=0,current=null;
 function removeReturn(state){state.button?.remove();state.button=null;}
 function dispose(state,reason){if(!state)return;cancel(state.timer);cancel(state.renewTimer);cancel(state.appearanceTimer);state.appearanceObserver?.disconnect();state.media?.removeEventListener?.('change',state.appearanceChanged);win.removeEventListener('resize',state.appearanceChanged);state.observer?.disconnect();win.removeEventListener('message',state.listener);win.removeEventListener('popstate',state.changed);win.removeEventListener('hashchange',state.changed);doc.removeEventListener?.('beforetoggle',state.nativeToggle,true);doc.removeEventListener?.('toggle',state.changed,true);win.removeEventListener('pagehide',state.pagehide);removeReturn(state);if(state.handle){try{surface.suspend(state.handle,reason);}catch{}try{surface.dispose(state.handle);}catch{}try{Promise.resolve(bridge.revokeMount?.({mountId:state.handle.id})).catch(()=>{});}catch{}}}
 function stop(reason='surface-stopped'){epoch++;const prior=current;current=null;try{adapter.stop();}catch{/* Surface cleanup must still complete. */}dispose(prior,reason);if(prior)try{onTerminated(reason,Object.freeze({mode:prior.mode==='workspace'?'workspace':'reading'}));}catch{/* Recovery notification cannot undo cleanup. */}}
 function valid(state,requireRegistered=true){
  if(current!==state||state.epoch!==epoch||requireRegistered&&!state.registered||doc.location.href!==state.url)return false;
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
  state.appearanceChanged=()=>{if(current!==state||state.appearanceTimer!==null)return;state.appearanceTimer=schedule(()=>{state.appearanceTimer=null;if(current===state)publishAppearance(state);},0);};
  if(win.MutationObserver&&doc.documentElement){state.appearanceObserver=new win.MutationObserver(state.appearanceChanged);for(const node of [doc.documentElement,doc.body])if(node)state.appearanceObserver.observe(node,{attributes:true,attributeFilter:['class','style','dir']});}
  state.media=win.matchMedia?.('(prefers-color-scheme: dark)');state.media?.addEventListener?.('change',state.appearanceChanged);win.addEventListener('resize',state.appearanceChanged);
 }
 function authorized(state){return valid(state)&&Date.parse(state.context.binding.expiresAt)>now()&&state.frames.every(({role})=>{const grant=state.grants.get(role);return grant&&Date.parse(grant.expiresAt)>now();});}
 function showWorkspace(){const state=current;if(state)state.intentEpoch++;if(!state||!authorized(state))return false;if(adapter.hasNativeLayer()){suspend('native-layer');return false;}if(surface.showWorkspace(state.handle)===false)return false;removeReturn(state);state.mode='workspace';return true;}
 function ensureReturn(state){
  if(!authorized(state)||adapter.hasNativeLayer()){removeReturn(state);return false;}
  const inspection=adapter.inspect(),slot=inspection.navigationSlot;
  if(!slot?.isConnected||slot!==state.inspection.navigationSlot){removeReturn(state);return false;}
  if(!state.button){const button=doc.createElement('button');button.type='button';button.dataset.vaOwned=state.handle.id;button.setAttribute('aria-label','返回工作空间');button.textContent='▦';button.addEventListener('click',event=>{if(current!==state||event?.isTrusted!==true||!showWorkspace())return;try{Promise.resolve(bridge.workspaceEntered?.({mountId:state.handle.id})).catch(()=>{});}catch{/* Entering the visible workspace never waits for a private notification. */}});slot.append(button);state.button=button;}return true;
 }
 function nativeSurrender(state,event){if(current!==state||state.mode==='waiting')return;if(event?.reason!=='native-reading'||state.mode!=='reading')state.intentEpoch++;state.mode='reading';if(!authorized(state))return;if(adapter.hasNativeLayer()){suspend('native-layer');return;}ensureReturn(state);}
 function showReading(){const state=current;if(state)state.intentEpoch++;if(!state||!authorized(state))return false;if(adapter.hasNativeLayer()){suspend('native-layer');return false;}surface.showReading(state.handle);state.mode='reading';return ensureReturn(state);}
 function suspend(reason='native-layer'){const state=current;if(state)state.intentEpoch++;if(!state?.handle)return;removeReturn(state);surface.suspend(state.handle,reason);state.mode='suspended';}
 function arm(state){cancel(state.timer);const until=Math.min(Date.parse(state.context.binding.expiresAt),...Array.from(state.grants.values(),g=>Date.parse(g.expiresAt)));state.timer=schedule(()=>{if(current===state)stop('ui-grant-expired');},Math.max(0,until-now()));if(typeof bridge.renewSession==='function'&&state.grants.size===2&&!state.renewing&&state.renewTimer===null)state.renewTimer=schedule(()=>{state.renewTimer=null;void renewSession(state);},Math.max(1,Math.min(10000,(until-now())/2)));}
 async function renewSession(state){
  if(!authorized(state)){if(current===state)stop('stale-session-renewal');return;}state.renewing=true;
  try{
   const raw=await withRequestDeadline(()=>bridge.renewSession({handle:state.handle,binding:state.context.binding}),{timeoutMs:6000,now:elapsedNow,schedule,cancel});
   if(current!==state)return;if(!authorized(state))throw Error('stale-session-renewal');
   const ack=structuredClone(raw),binding=ack?.binding,keys=['documentToken','producerToken','browserDocumentId','routeEpoch','origin'];
   const future=value=>Number.isFinite(Date.parse(value))&&Date.parse(value)>now()&&Date.parse(value)<=now()+20000;
   if(ack?.ok!==true||!binding||Object.keys(binding).sort().join(',')!==[...keys,'expiresAt'].sort().join(',')||keys.some(k=>binding[k]!==state.context.binding[k])||!future(binding.expiresAt)||!Array.isArray(ack.grants)||ack.grants.length!==2)throw Error('invalid-session-renewal');
   const next=new Map();for(const grant of ack.grants){const previous=state.grants.get(grant?.role);if(!previous||next.has(grant.role)||['id','mountId','role','parentDocumentId','uiDocumentId','scopeGrantId'].some(k=>grant[k]!==previous[k])||!future(grant.expiresAt))throw Error('invalid-session-renewal');next.set(grant.role,Object.freeze({...grant}));}
   if(adapter.updateBinding(binding)!==true)throw Error('invalid-binding-renewal');
   state.context={...state.context,binding:Object.freeze({...binding})};state.grants=next;
  }catch{if(current===state)stop('session-renew-failed');}
  finally{state.renewing=false;if(current===state)arm(state);}
 }
 async function start(options){
  stop('surface-restart');const run=epoch,state={epoch:run,intentEpoch:0,url:doc.location.href,registered:false,handle:null,grants:new Map(),earlyJoins:new Map(),pending:new Set(),button:null,timer:null,renewTimer:null,renewing:false,observer:null,appearanceObserver:null,appearanceTimer:null,appearanceKeys:new Map(),mode:'waiting'};current=state;
  try{
   state.context=await adapter.start(options);if(current!==state)return null;
   state.inspection=adapter.inspect();if(!state.inspection?.ok||!state.inspection.navigationSlot?.isConnected)throw Error('invalid-return-slot');
   state.handle=await surface.mount(state.context,state.inspection,{onSurrender:event=>nativeSurrender(state,event)});if(current!==state){dispose(state,'stale-mount');return null;}
   state.frames=surface.frames(state.handle).map(value=>({...value,window:value.frame.contentWindow}));if(state.frames.length!==2||new Set(state.frames.map(x=>x.role)).size!==2||state.frames.some(x=>!['workspace','sidebar'].includes(x.role)))throw Error('incomplete-dual-surface');
   state.listener=event=>{void receive(state,event);};win.addEventListener('message',state.listener);
   const ack=await bridge.registerMount({handle:state.handle});if(current!==state)return null;if(ack?.ok!==true)throw Error('mount-registration-denied');state.registered=true;
   if(!valid(state))throw Error('stale-mount-registration');
   state.nativeToggle=event=>{if(event.newState==='open'&&!event.target.closest?.('[data-va-owned]'))suspend('native-layer');};doc.addEventListener?.('beforetoggle',state.nativeToggle,true);
   state.changed=()=>{if(current!==state)return;if(!valid(state)){stop('native-region-changed');return;}if(adapter.hasNativeLayer())suspend('native-layer');else if(state.mode==='reading'||state.mode==='suspended')ensureReturn(state);};
   state.pagehide=()=>{if(current===state)stop('page-hidden');};win.addEventListener('pagehide',state.pagehide);doc.addEventListener?.('toggle',state.changed,true);
   win.addEventListener('popstate',state.changed);win.addEventListener('hashchange',state.changed);
   if(win.MutationObserver){state.observer=new win.MutationObserver(state.changed);state.observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class','aria-modal']});}
   watchAppearance(state);arm(state);const queued=[...state.earlyJoins.values()];state.earlyJoins.clear();for(const event of queued)void receive(state,event);return state.handle;
  }catch{if(current===state)stop('mount-unavailable');return null;}
 }
 async function receive(state,event){
  if(!valid(state,false)||event.origin!==trustedOrigin)return;
  const data=event.data;if(!data||Object.getPrototypeOf(data)!==Object.prototype)return;
  const target=state.frames.find(x=>x.role===data.role);if(!target||!target.frame.isConnected||event.source!==target.window||target.frame.contentWindow!==target.window)return;
  if(exactHostRecord(data,['role','type'])&&['VAIWL_UI_SUSPEND','VAIWL_UI_EXIT'].includes(data.type)){stop(data.type==='VAIWL_UI_EXIT'?'ui-user-exit':'ui-frame-suspended');return;}
  if(Object.keys(data).sort().join(',')!=='nonce,role,type'||data.type!=='VAIWL_UI_JOIN'||!tokenOK(data.nonce)||state.pending.has(data.role)||state.grants.has(data.role))return;
  if(!state.registered){if(!state.earlyJoins.has(data.role))state.earlyJoins.set(data.role,{origin:event.origin,source:event.source,data:{type:data.type,role:data.role,nonce:data.nonce}});return;}
  state.pending.add(data.role);
  try{
   const ack=await bridge.confirmParent({mountId:state.handle.id,documentToken:state.handle.documentToken,regionEpoch:state.handle.regionEpoch,nonce:data.nonce,role:data.role});
   if(!valid(state)||event.source!==target.window||target.frame.contentWindow!==target.window)return;
   const grant=ack?.grant;if(ack?.ok!==true||!tokenOK(grant?.id)||grant.mountId!==state.handle.id||grant.role!==data.role||grant.parentDocumentId!==state.context.binding.browserDocumentId||!tokenOK(grant.uiDocumentId)||!tokenOK(grant.scopeGrantId)||!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=now())return;
   state.grants.set(data.role,Object.freeze({...grant}));publishAppearance(state,data.role);arm(state);if(state.mode==='waiting'&&authorized(state)){if(initialMode==='reading')showReading();else showWorkspace();}
  }catch{/* A failed public join never authorizes a surface. */}finally{state.pending.delete(data.role);}
 }
 return Object.freeze({start,presentationMode:()=>current?.mode==='workspace'?'workspace':'reading',showWorkspace,showReading,focusFrame(role){const state=current;if(!state||state.mode!=='workspace'||!authorized(state)||adapter.hasNativeLayer())return false;const target=state.frames.find(x=>x.role===role);if(!target?.frame?.focus)return false;target.frame.focus({preventScroll:true});let active=doc.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;return active===target.frame;},isFrameTarget(role,node){return !!current&&authorized(current)&&current.frames.some(x=>x.role===role&&x.frame===node);},isReturnTarget:node=>!!current&&current.button===node&&authorized(current),readingGuard(){const state=current,revision=state?.intentEpoch;return ()=>!!state&&current===state&&state.intentEpoch===revision&&state.mode==='reading'&&authorized(state)&&!adapter.hasNativeLayer();},suspend,stop,revoke:()=>stop('ui-authority-revoked')});
}

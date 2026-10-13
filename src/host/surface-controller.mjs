import {tokenOK} from '../b1/identity.mjs';
/** Isolated content composition. Public window messages only correlate an owned
 * frame. Grants and mount registration travel exclusively over the trusted bridge. */
export function createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin,now=Date.now,schedule=setTimeout,cancel=clearTimeout}={}){
 const origin=new URL(extensionOrigin);if(origin.protocol!=='chrome-extension:'||origin.host===''||!['','/'].includes(origin.pathname)||origin.search||origin.hash||!doc?.defaultView||!adapter||!surface||typeof bridge?.registerMount!=='function'||typeof bridge.confirmParent!=='function')throw Error('invalid-surface-controller');
 const trustedOrigin=`${origin.protocol}//${origin.host}`,win=doc.defaultView;
 let epoch=0,current=null;
 function removeReturn(state){state.button?.remove();state.button=null;}
 function dispose(state,reason){if(!state)return;cancel(state.timer);state.observer?.disconnect();win.removeEventListener('message',state.listener);win.removeEventListener('popstate',state.changed);win.removeEventListener('hashchange',state.changed);doc.removeEventListener?.('beforetoggle',state.nativeToggle,true);removeReturn(state);if(state.handle){try{surface.suspend(state.handle,reason);}catch{}try{surface.dispose(state.handle);}catch{}try{Promise.resolve(bridge.revokeMount?.({mountId:state.handle.id})).catch(()=>{});}catch{}}}
 function stop(reason='surface-stopped'){epoch++;const prior=current;current=null;adapter.stop();dispose(prior,reason);}
 function valid(state,requireRegistered=true){
  if(current!==state||state.epoch!==epoch||requireRegistered&&!state.registered||doc.location.href!==state.url)return false;
  const inspection=adapter.inspect();return inspection?.ok&&inspection.regionEpoch===state.handle.regionEpoch&&state.frames.every(({frame})=>frame.isConnected&&frame.ownerDocument===doc);
 }
 function authorized(state){return valid(state)&&state.frames.every(({role})=>{const grant=state.grants.get(role);return grant&&Date.parse(grant.expiresAt)>now();});}
 function showWorkspace(){const state=current;if(!state||!authorized(state))return false;if(adapter.hasNativeLayer()){suspend('native-layer');return false;}removeReturn(state);surface.showWorkspace(state.handle);state.mode='workspace';return true;}
 function showReading(){const state=current;if(!state||!authorized(state))return false;if(adapter.hasNativeLayer()){suspend('native-layer');return false;}surface.showReading(state.handle);state.mode='reading';if(!state.button){const button=doc.createElement('button');button.type='button';button.dataset.vaOwned=state.handle.id;button.setAttribute('aria-label','返回工作空间');button.textContent='▦';button.addEventListener('click',showWorkspace);state.inspection.navigationSlot.append(button);state.button=button;}return true;}
 function suspend(reason='native-layer'){const state=current;if(!state?.handle)return;removeReturn(state);surface.suspend(state.handle,reason);state.mode='suspended';}
 function arm(state){cancel(state.timer);const until=Math.min(Date.parse(state.context.binding.expiresAt),...Array.from(state.grants.values(),g=>Date.parse(g.expiresAt)));state.timer=schedule(()=>{if(current===state)stop('ui-grant-expired');},Math.max(0,until-now()));}
 async function start(options){
  stop('surface-restart');const run=epoch,state={epoch:run,url:doc.location.href,registered:false,handle:null,grants:new Map(),earlyJoins:new Map(),pending:new Set(),button:null,timer:null,observer:null,mode:'waiting'};current=state;
  try{
   state.context=await adapter.start(options);if(current!==state)return null;
   state.inspection=adapter.inspect();if(!state.inspection?.ok||!state.inspection.navigationSlot?.isConnected)throw Error('invalid-return-slot');
   state.handle=await surface.mount(state.context,state.inspection);if(current!==state){dispose(state,'stale-mount');return null;}
   state.frames=surface.frames(state.handle).map(value=>({...value,window:value.frame.contentWindow}));if(state.frames.length!==2||new Set(state.frames.map(x=>x.role)).size!==2||state.frames.some(x=>!['workspace','sidebar'].includes(x.role)))throw Error('incomplete-dual-surface');
   state.listener=event=>{void receive(state,event);};win.addEventListener('message',state.listener);
   const ack=await bridge.registerMount({handle:state.handle});if(current!==state)return null;if(ack?.ok!==true)throw Error('mount-registration-denied');state.registered=true;
   if(!valid(state))throw Error('stale-mount-registration');
   state.nativeToggle=event=>{if(event.newState==='open'&&!event.target.closest?.('[data-va-owned]'))suspend('native-layer');};doc.addEventListener?.('beforetoggle',state.nativeToggle,true);
   state.changed=()=>{if(current!==state)return;if(!valid(state)){stop('native-region-changed');return;}if(adapter.hasNativeLayer())suspend('native-layer');};
   win.addEventListener('popstate',state.changed);win.addEventListener('hashchange',state.changed);
   if(win.MutationObserver){state.observer=new win.MutationObserver(state.changed);state.observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class','aria-modal']});}
   arm(state);const queued=[...state.earlyJoins.values()];state.earlyJoins.clear();for(const event of queued)void receive(state,event);return state.handle;
  }catch{if(current===state)stop('mount-unavailable');return null;}
 }
 async function receive(state,event){
  if(!valid(state,false)||event.origin!==trustedOrigin)return;
  const data=event.data;if(!data||Object.getPrototypeOf(data)!==Object.prototype)return;
  const target=state.frames.find(x=>x.role===data.role);if(!target||!target.frame.isConnected||event.source!==target.window||target.frame.contentWindow!==target.window)return;
  if(data.type==='VAIWL_UI_SUSPEND'&&Object.keys(data).sort().join(',')==='role,type'){stop('ui-frame-suspended');return;}
  if(Object.keys(data).sort().join(',')!=='nonce,role,type'||data.type!=='VAIWL_UI_JOIN'||!tokenOK(data.nonce)||state.pending.has(data.role)||state.grants.has(data.role))return;
  if(!state.registered){if(!state.earlyJoins.has(data.role))state.earlyJoins.set(data.role,{origin:event.origin,source:event.source,data:{type:data.type,role:data.role,nonce:data.nonce}});return;}
  state.pending.add(data.role);
  try{
   const ack=await bridge.confirmParent({mountId:state.handle.id,documentToken:state.handle.documentToken,regionEpoch:state.handle.regionEpoch,nonce:data.nonce,role:data.role});
   if(!valid(state)||event.source!==target.window||target.frame.contentWindow!==target.window)return;
   const grant=ack?.grant;if(ack?.ok!==true||!tokenOK(grant?.id)||grant.mountId!==state.handle.id||grant.role!==data.role||grant.parentDocumentId!==state.context.binding.browserDocumentId||!tokenOK(grant.uiDocumentId)||!tokenOK(grant.scopeGrantId)||!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=now())return;
   state.grants.set(data.role,Object.freeze({...grant}));arm(state);if(state.mode==='waiting'&&authorized(state))showWorkspace();
  }catch{/* A failed public join never authorizes a surface. */}finally{state.pending.delete(data.role);}
 }
 return Object.freeze({start,showWorkspace,showReading,suspend,stop,revoke:()=>stop('ui-authority-revoked')});
}

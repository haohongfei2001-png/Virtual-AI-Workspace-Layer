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
 let seq=0,epoch=0,current=null,enabled=false,rebindQueued=false,rebindRun=0;
 const bindingFields=b=>({documentToken:b.documentToken,producerToken:b.producerToken,routeEpoch:b.routeEpoch});
 function live(s){return current===s&&!s.abort.signal.aborted&&doc.location.href===s.url;}
 function bindingOK(b,prior){return exactHostRecord(b,['documentToken','producerToken','browserDocumentId','routeEpoch','origin','expiresAt'])&&['documentToken','producerToken','browserDocumentId'].every(k=>tokenOK(b[k]))&&Number.isSafeInteger(b.routeEpoch)&&b.routeEpoch>=0&&b.origin===origin&&Date.parse(b.expiresAt)>now()&&Date.parse(b.expiresAt)<=now()+20000&&(!prior||['documentToken','producerToken','browserDocumentId','routeEpoch','origin'].every(k=>b[k]===prior[k]));}
 async function rpc(s,message,timeoutMs=6000){
  if(!live(s))throw Error('stale-content-session');let abort;
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('stale-content-session'));s.abort.signal.addEventListener('abort',abort,{once:true});});
  try{const result=await withRequestDeadline(()=>Promise.race([Promise.resolve().then(()=>{if(!live(s))throw Error('stale-content-session');return runtime.sendMessage(message);}),cancelled]),{timeoutMs,now:elapsedNow,schedule,cancel});if(!live(s))throw Error('stale-content-session');return result;}
  finally{s.abort.signal.removeEventListener('abort',abort);}
 }
 function dispose(s){if(!s)return;try{s.controller?.stop();}catch{}s.abort.abort();try{runtime.onMessage.removeListener(s.listener);}catch{}doc.defaultView.removeEventListener('pagehide',s.pagehide);try{s.adapter?.stop();}catch{}}
 function reset(){epoch++;const s=current;current=null;dispose(s);}
 function stop(){enabled=false;rebindQueued=false;rebindRun++;reset();doc.defaultView.removeEventListener('pagehide',stop);}
 function rebind(s){
  if(!enabled||current!==s||rebindQueued)return;
  rebindQueued=true;const run=++rebindRun;reset();doc.defaultView.addEventListener('pagehide',stop);
  // Collapse a burst into one replacement. Only external events can request a
  // subsequent attempt; failures never schedule their own recovery loop.
  queueMicrotask(()=>{if(!enabled||run!==rebindRun)return;rebindQueued=false;void begin(true);});
 }
 async function start(){enabled=true;rebindQueued=false;rebindRun++;return begin();}
 async function begin(rebinding=false){
  reset();const s={run:epoch,url:doc.location.href,abort:new AbortController(),binding:null,controller:null,adapter:null,listener:()=>{},pagehide:stop,plans:null,rebinding,ready:false};current=s;doc.defaultView.addEventListener('pagehide',s.pagehide);
  s.listener=(m,sender,reply)=>{
   if(current!==s||!enabled||sender?.id!==runtime.id)return;
   if(exactHostRecord(m,['type'])&&m.type==='HOST_DOCUMENT_INVALIDATED'){rebind(s);return;}
   if(!s.plans||!live(s)||Date.parse(s.binding.expiresAt)<=now()||!exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','targets'])||m.type!=='HOST_NATIVE_PLAN'||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v))return;
   try{reply(s.plans.plan({targets:m.targets}));}catch{reply(null);}
  };runtime.onMessage.addListener(s.listener);
  try{
   const hello=await rpc(s,{v:1,type:'HOST_HELLO',clientId,seq:++seq});if(!bindingOK(hello?.binding))throw Error('invalid-host-binding');s.binding=Object.freeze({...hello.binding});
   const auth=await rpc(s,{v:1,type:'HOST_REFRESH',clientId,seq:++seq,...bindingFields(s.binding)});if(auth?.state!=='verified')throw Error('scope-not-verified');
   const adapter=s.adapter=adapterFactory({document:doc,urlPolicy:createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}),now,elapsedNow,onRebindNeeded:()=>rebind(s)});
   s.plans=plansFactory({adapter,bindingCurrent:()=>live(s)&&Date.parse(s.binding.expiresAt)>now()&&adapter.inspect().ok?s.binding.documentToken+':'+s.binding.routeEpoch:false});
   const surface=surfaceFactory({document:doc,createFrameURL:({role})=>runtime.getURL(role+'.html'),hasNativeLayer:()=>adapter.hasNativeLayer()});
   const bridge={
    registerMount:({handle})=>rpc(s,{v:1,type:'HOST_UI_MOUNT',...bindingFields(s.binding),mountId:handle.id,regionEpoch:handle.regionEpoch}),
    confirmParent:v=>rpc(s,{v:1,type:'HOST_UI_CONFIRM',...v,...bindingFields(s.binding)}),
    revokeMount:({mountId})=>{if(s.binding)void withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_RELEASE',...bindingFields(s.binding),mountId}),{now:elapsedNow,schedule,cancel}).catch(()=>{});},
    renewSession:async({handle,binding})=>{if(!bindingOK(binding,s.binding))throw Error('stale-content-binding');const started=elapsedNow();const renewed=await rpc(s,{v:1,type:'HOST_DOCUMENT_RENEW',clientId,seq:++seq,...bindingFields(binding)});if(renewed?.ok!==true||!bindingOK(renewed.binding,s.binding))throw Error('invalid-host-binding');const remaining=6000-(elapsedNow()-started);if(remaining<=0)throw Error('request-timeout');const status=await rpc(s,{v:1,type:'HOST_UI_STATUS',...bindingFields(binding),mountId:handle.id},remaining);if(status?.ok===true)s.binding=Object.freeze({...renewed.binding});return {...status,binding:renewed.binding};}
   };
   s.controller=controllerFactory({document:doc,adapter,surface,extensionOrigin:'chrome-extension://'+runtime.id,bridge,now,elapsedNow,schedule,cancel});
   const handle=await s.controller.start({binding:s.binding,emit:p=>rpc(s,p)});if(!live(s)||!handle)throw Error('surface-start-failed');s.ready=true;return handle;
  }catch{if(current===s){current=null;dispose(s);}return null;}
 }
 return Object.freeze({start,stop,showWorkspace:()=>current?.controller?.showWorkspace()??false,showReading:()=>current?.controller?.showReading()??false});
}

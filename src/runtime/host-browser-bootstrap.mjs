import {createBrowserRequestContext} from './browser-request-context.mjs';

/** Synchronous, light worker bootstrap. The sole C2 owner starts before the
 * repository/UI module graph evaluates. It retains only its existing bounded
 * receipts; no browser events, headers or notifications are queued for replay.
 */
export function createHostBrowserBootstrap({chrome,origin='https://chatgpt.com',scopeProfile={}}={}){
 const enabled=scopeProfile.browserRequestContext===true,projectRequestContext=scopeProfile.projectRequestContext??null,conversationRequestContext=scopeProfile.conversationRequestContext??null;
 const lifecycle=[chrome?.webNavigation?.onCommitted,chrome?.webNavigation?.onHistoryStateUpdated,chrome?.tabs?.onRemoved];
 if(!chrome?.runtime?.id||typeof chrome.runtime.getContexts!=='function'||typeof chrome.webNavigation?.getFrame!=='function'||lifecycle.some(event=>typeof event?.addListener!=='function'||typeof event?.removeListener!=='function'))throw Error('host-browser-unavailable');
 let active=true,claimed=false,handlers=null,contextObserver=null;const listeners=[];
 const dispatch=(name,...args)=>active&&handlers?handlers[name](...args):undefined;
 function stop(){if(!active)return;active=false;handlers=null;contextObserver?.stop();for(const [event,listener]of listeners)event.removeListener(listener);}
 try{
  contextObserver=enabled?createBrowserRequestContext({webRequest:chrome.webRequest,getTab:id=>chrome.tabs.get(id),getFrame:query=>chrome.webNavigation.getFrame(query),origin,projectRequestContext,conversationRequestContext,
   // Before service attachment even a valid browser receipt cannot complete
   // the body association bridge or authorize a scope.
   associatePage:({tabId,documentId,...query})=>active&&handlers?chrome.tabs.sendMessage(tabId,{type:'HOST_CONTEXT_ASSOCIATE',...query},{documentId}):null,
   onInvalidate:details=>dispatch('onContextInvalidate',details),onReady:details=>dispatch('onContextReady',details)}):null;
  const navigate=(details,replacement)=>{
   if(!active||details.frameId!==0||!Number.isSafeInteger(details.tabId))return;
   if(replacement)contextObserver?.invalidateCommitted(details);else contextObserver?.invalidateHistory(details);
   dispatch('onNavigation',details,replacement);
  };
  const removed=tabId=>{if(!active)return;contextObserver?.invalidateTab(tabId);dispatch('onRemoved',tabId);};
  listeners.push([lifecycle[0],details=>navigate(details,true)],[lifecycle[1],details=>navigate(details,false)],[lifecycle[2],removed]);
  for(const [event,listener]of listeners)event.addListener(listener);
 }catch(error){stop();throw error;}
 function claim({chrome:targetChrome,origin:targetOrigin,scopeProfile:targetProfile}={}){
  if(!active||claimed)throw Error('host-browser-bootstrap-not-available');
  if(targetChrome!==chrome||targetOrigin!==origin||(targetProfile?.browserRequestContext===true)!==enabled||(targetProfile?.projectRequestContext??null)!==projectRequestContext||(targetProfile?.conversationRequestContext??null)!==conversationRequestContext)throw Error('host-browser-bootstrap-config-mismatch');
  // Reserve ownership before service construction. A failed second runtime
  // cannot acquire cleanup authority over another runtime's live observer.
  claimed=true;
  function attach(callbacks={}){
   if(!active||handlers)throw Error('host-browser-bootstrap-not-available');
   if(!['onContextInvalidate','onContextReady','onNavigation','onRemoved'].every(name=>typeof callbacks[name]==='function'))throw Error('host-browser-bootstrap-invalid-handlers');
   // Service and message listeners already exist. Do not replay earlier
   // notifications; the first authenticated refresh reads this same owner.
   handlers=Object.freeze({...callbacks});
  }
  return Object.freeze({contextObserver,attach,stop});
 }
 return Object.freeze({contextObserver,claim,stop});
}

import {ScopeRepository} from './scope-repository.mjs';
import {createDocumentBindingBroker,fixtureScopeResolver,fixtureURL}
  from './document-binding-broker.mjs';

// R0/B1 fixture only: synthetic URL-derived scope is NOT a ChatGPT account identity.
// A real host adapter must be separately verified and integrated in another phase.
const repository=new ScopeRepository({indexedDB});
const broker=createDocumentBindingBroker({
  extensionId:chrome.runtime.id,
  getFrame:({tabId,frameId})=>chrome.webNavigation.getFrame({tabId,frameId}),
  resolveScope:fixtureScopeResolver,
  repository,
  allowedURL:fixtureURL
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  broker.handle(message,sender).then(sendResponse,()=>sendResponse({ok:false,reason:'internal'}));
  return true;
});
chrome.webNavigation.onHistoryStateUpdated.addListener(details=>{
  if(details.frameId!==0)return;
  if(broker.invalidate(details)){
    chrome.tabs.sendMessage(details.tabId,{type:'B1_REVOKE'}, {frameId:0})
      .catch(()=>{});
  }
}, {url:[{hostEquals:'127.0.0.1'}]});
chrome.tabs.onRemoved.addListener(tabId=>broker.tabClosed(tabId));

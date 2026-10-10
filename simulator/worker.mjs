import { createFixtureService } from './service.mjs';
import { syntheticURL } from './data.mjs';
const service=createFixtureService({indexedDB,extensionId:chrome.runtime.id,getFrame:x=>chrome.webNavigation.getFrame(x)});
globalThis.hfWorkerBoot=crypto.randomUUID();
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  service.broker.handle(message,sender).then(reply,()=>reply({ok:false,reason:'service-failed'}));return true;
});
function invalidate(details){if(details.frameId!==0)return;service.broker.invalidate(details);if(syntheticURL(details.url))chrome.tabs.sendMessage(details.tabId,{type:'HF_DOCUMENT_INVALIDATED'},{documentId:details.documentId}).catch(()=>{});}
const filter={url:[{schemes:['http'],hostEquals:'127.0.0.1',pathPrefix:'/hf/'}]};
chrome.webNavigation.onCommitted.addListener(invalidate,filter);
chrome.webNavigation.onHistoryStateUpdated.addListener(invalidate,filter);
chrome.tabs.onRemoved.addListener(id=>service.broker.tabClosed(id));
chrome.action.onClicked.addListener(tab=>{if(syntheticURL(tab.url))chrome.tabs.sendMessage(tab.id,{type:'HF_TOGGLE'}).catch(()=>{});});

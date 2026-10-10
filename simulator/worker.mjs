import { createFixtureService } from './service.mjs';
import { syntheticURL, routeInfo, scopeOf } from './data.mjs';
const service=createFixtureService({indexedDB,extensionId:chrome.runtime.id,getFrame:x=>chrome.webNavigation.getFrame(x)});
globalThis.hfWorkerBoot=crypto.randomUUID();
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  // A read-only diagnostic available ONLY to the synthetic host test origin.
  // Never forward this bridge into a real ChatGPT adapter.
  if(message?.type==='HF_TEST_WORKER_PROBE' && sender?.id===chrome.runtime.id &&
     sender?.frameId===0 && sender?.documentLifecycle==='active' && syntheticURL(sender?.url)){
    const info=routeInfo(sender.url);
    if(!info || !['A','B'].includes(info.account)){reply({ok:false});return false;}
    Promise.all([service.repository.get(scopeOf(info.account),'T0'),
      chrome.webNavigation.getFrame({tabId:sender.tab.id,frameId:0})])
      .then(([record,frame])=>reply({ok:true,boot:hfWorkerBoot,persistedRef:!!record,revision:record?.revision??null,
        syntheticSenderUrl:sender.url,syntheticSenderDoc:sender.documentId,
        syntheticFrameUrl:frame?.url,syntheticFrameDoc:frame?.documentId}))
      .catch(()=>reply({ok:false}));
    return true;
  }
  service.broker.handle(message,sender).then(reply,()=>reply({ok:false,reason:'service-failed'}));return true;
});
function invalidate(details){if(details.frameId!==0)return;service.broker.invalidate(details);if(syntheticURL(details.url))chrome.tabs.sendMessage(details.tabId,{type:'HF_DOCUMENT_INVALIDATED'},{documentId:details.documentId}).catch(()=>{});}
const filter={url:[{schemes:['http'],hostEquals:'127.0.0.1',pathPrefix:'/hf/'}]};
chrome.webNavigation.onCommitted.addListener(invalidate,filter);
chrome.webNavigation.onHistoryStateUpdated.addListener(invalidate,filter);
chrome.tabs.onRemoved.addListener(id=>service.broker.tabClosed(id));
chrome.action.onClicked.addListener(tab=>{if(syntheticURL(tab.url))chrome.tabs.sendMessage(tab.id,{type:'HF_TOGGLE'}).catch(()=>{});});

import { createFixtureService } from './service.mjs';
import { syntheticURL, routeInfo, scopeOf } from './data.mjs';
const service=createFixtureService({indexedDB,extensionId:chrome.runtime.id,getFrame:x=>chrome.webNavigation.getFrame(x)});
service.subscribe(message=>{void service.broker.notificationTarget(message.leaseId).then(target=>{
  if(target)return chrome.tabs.sendMessage(target.tabId,message,{documentId:target.documentId});
}).catch(()=>{});});
globalThis.hfWorkerBoot=crypto.randomUUID();
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  // A read-only diagnostic available ONLY to the synthetic host test origin.
  // Never forward this bridge into a real ChatGPT adapter.
  if(message?.type==='HF_TEST_WORKER_PROBE' && sender?.id===chrome.runtime.id &&
     sender?.frameId===0 && sender?.documentLifecycle==='active' && syntheticURL(sender?.url)){
    (async()=>{
      const frame=await chrome.webNavigation.getFrame({tabId:sender.tab.id,frameId:0});
      if(!frame||frame.documentId!==sender.documentId||!syntheticURL(frame.url)||
         new URL(frame.url).origin!==new URL(sender.url).origin)throw Error('stale-probe');
      const info=routeInfo(frame.url);if(!info||!['A','B'].includes(info.account))throw Error('unknown-scope');
      const scope=scopeOf(info.account),record=await service.repository.get(scope,'T0');
      const workspace=await service.workspaces.read(scope);
      const current=await chrome.webNavigation.getFrame({tabId:sender.tab.id,frameId:0});
      if(current?.documentId!==frame.documentId||current?.url!==frame.url)throw Error('stale-probe');
      reply({ok:true,boot:hfWorkerBoot,persistedRef:!!record,revision:record?.revision??null,
        workspaceRevision:workspace.state.revision,workspaceCount:Object.keys(workspace.state.workspaces).length,
        syntheticSenderUrl:sender.url,syntheticSenderDoc:sender.documentId,
        syntheticFrameUrl:frame.url,syntheticFrameDoc:frame.documentId});
    })().catch(()=>reply({ok:false}));
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

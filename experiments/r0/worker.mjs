import {experimentBroker,healthEnvelope} from './policy.mjs';
const boot=crypto.randomUUID();
const broker=experimentBroker({extensionId:chrome.runtime.id,getFrame:x=>chrome.webNavigation.getFrame(x)});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 // Only a minimal BIND health check, never references, histories, writes or content.
 if(message?.type!=='BIND'){reply({ok:false,reason:'experiment-read-only'});return false;}
 broker.handle(message,sender).then(x=>reply(healthEnvelope(boot,x)),()=>reply({ok:false,reason:'probe-failed-closed'}));return true;
});
chrome.webNavigation.onHistoryStateUpdated.addListener(x=>{if(x.frameId===0)broker.invalidate(x);},{url:[{hostEquals:'chatgpt.com'}]});
chrome.tabs.onRemoved.addListener(id=>broker.tabClosed(id));

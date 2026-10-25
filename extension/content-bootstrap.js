// Passive startup receipt survives a failed module import. Only our private
// status page may read it; no DOM, title, URL, identity or storage is returned.
(() => {
 const runtime=chrome.runtime,build=/* build-content-fingerprint */ 'source';
 let stage='module-loading';
 const listener=(message,sender,reply)=>{
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Reflect.ownKeys(message).length!==2||message.v!==1||message.type!=='HOST_LOCAL_BOOT'||sender?.id!==runtime.id||sender?.url!==runtime.getURL('status.html')||sender.tab!==undefined)return;
  reply({v:1,stage,build});
 };
 runtime.onMessage.addListener(listener);
 window.addEventListener('pagehide',event=>{if(!event.persisted)runtime.onMessage.removeListener(listener);});
 document.documentElement.dataset.vaiwlBoot='loading';
 void import(runtime.getURL('extension/content-entry.mjs')).then(()=>{
  stage='module-loaded';document.documentElement.dataset.vaiwlBoot='loaded';
 },()=>{stage='module-load-failed';document.documentElement.dataset.vaiwlBoot='module-load-failed';});
})();

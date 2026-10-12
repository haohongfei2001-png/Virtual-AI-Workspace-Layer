(()=>{
 // Manually injected into this experiment's fresh guest tab only; no page world bridge,
 // host DOM writes, text collection, storage, fetch, login or synthetic account fallback.
 if(location.protocol!=='https:'||location.hostname!=='chatgpt.com'||top!==self)return;
 if(globalThis.__VAIWL_R0_PROBE__)return;
 const tracked=[...document.querySelectorAll('main,main textarea,main [data-message-role],main [data-message-author-role]')];
 const clientId=crypto.randomUUID();let seq=0,stopped=false;
 const probe={
  async health(){if(stopped)return {stopped:true};return chrome.runtime.sendMessage({v:1,type:'BIND',clientId,seq:++seq});},
  ownership(){return {trackedCount:tracked.length,originalNativeNodesConnected:tracked.every(n=>n.isConnected),composerUnchanged:tracked.filter(n=>n.tagName==='TEXTAREA').every(n=>n===document.querySelector('main textarea')),ownedDOMRoots:document.querySelectorAll('[data-vaiwl-owned]').length,nativeDOMWritten:false};},
  stop(){stopped=true;delete globalThis.__VAIWL_R0_PROBE__;return {stopped:true,ownedDOMRoots:document.querySelectorAll('[data-vaiwl-owned]').length};}
 };
 globalThis.__VAIWL_R0_PROBE__=Object.freeze(probe);
})();

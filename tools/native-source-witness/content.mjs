import {createContextAssociationBridge} from '../../src/host/context-association.mjs';
import {CHATGPT_OBSERVED_PROFILE} from '../../src/host/chatgpt-observed-profile.mjs';
// Idle until this extension's private worker sends a fixed association challenge.
// No fetch, text extraction, MAIN bridge, identity source or storage.
if(window===window.top&&location.origin==='https://chatgpt.com'){
 const bridge=createContextAssociationBridge({document,runtime:chrome.runtime,origin:location.origin,profile:CHATGPT_OBSERVED_PROFILE});
 const ready=(m,sender,reply)=>{if(sender?.id===chrome.runtime.id&&!sender.tab&&m?.type==='SOURCE_WITNESS_READY'&&Object.keys(m).length===1)reply({ready:true});};
 chrome.runtime.onMessage.addListener(ready);
 window.addEventListener('pagehide',event=>{if(!event.persisted){bridge.stop();chrome.runtime.onMessage.removeListener(ready);}});
}

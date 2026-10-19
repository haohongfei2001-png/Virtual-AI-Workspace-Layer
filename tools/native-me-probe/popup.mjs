import {TARGET_TAB_ID} from './native-me-probe-config.mjs';
const key='vaiwl-native-me-probe-20261019-consumed',status=document.getElementById('result'),button=document.getElementById('run');
const show=value=>{status.textContent=JSON.stringify(value);};
// An extension-private, non-sensitive consumption marker survives UI/worker restart.
// Never clear it automatically. A lost delivery consumes permission conservatively.
button.disabled=localStorage.getItem(key)!==null;
if(button.disabled)show({state:'already-consumed-no-retry'});
button.addEventListener('click',async()=>{
 button.disabled=true;
 try{await navigator.locks.request(key,async()=>{
  if(localStorage.getItem(key)!==null){show({state:'already-consumed-no-retry'});return;}
  const tab=await chrome.tabs.get(TARGET_TAB_ID);
  if(tab.url!=='https://chatgpt.com/'){show({state:'wrong-target-no-request'});return;}
  const ready=await chrome.tabs.sendMessage(TARGET_TAB_ID,{type:'VAIWL_ME_PROBE_READY'},{frameId:0});
  if(ready?.ready!==true||ready.spent!==false||typeof ready.documentKey!=='string'){show({state:'not-ready-no-request'});return;}
  localStorage.setItem(key,'consumed');
  show({state:'consumed-awaiting-result-do-not-repeat'});
  show(await chrome.tabs.sendMessage(TARGET_TAB_ID,{type:'VAIWL_ME_PROBE_ONCE',documentKey:ready.documentKey},{frameId:0}));
 });}catch{show({state:localStorage.getItem(key)!==null?'consumed-delivery-unconfirmed-no-retry':'connection-failed-no-request'});}
});
document.getElementById('read').addEventListener('click',async()=>{
 try{show(await chrome.tabs.sendMessage(TARGET_TAB_ID,{type:'VAIWL_ME_PROBE_STATUS'},{frameId:0}));}catch{show({state:'result-unavailable-no-retry'});}
});

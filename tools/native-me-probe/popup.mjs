import {TARGET_TAB_ID,PROBE_KEY,PROBE_PREFIX} from './native-me-probe-config.mjs';
const key=PROBE_KEY,status=document.getElementById('result'),button=document.getElementById('run');
const show=value=>{status.textContent=JSON.stringify(value);};
// Keep the same durable marker, including the legacy 'consumed' value. Opening
// another popup or selecting another home must never renew the one request.
button.disabled=localStorage.getItem(key)!==null;
if(button.disabled)show({state:'already-consumed-no-retry'});
button.addEventListener('click',async()=>{
 button.disabled=true;let phase='select-home';
 try{await navigator.locks.request(key,async()=>{
  if(localStorage.getItem(key)!==null){show({state:'already-consumed-no-retry'});return;}
  const tabs=await chrome.tabs.query({active:true,currentWindow:true}),tab=tabs.length===1?tabs[0]:null;
  if(!Number.isSafeInteger(tab?.id)||tab.id<0||tab.url!=='https://chatgpt.com/'){
   show({state:'select-chatgpt-home-no-request',help:'请切到专用 Profile 的 ChatGPT 空白首页，再打开这个诊断入口。'});return;
  }
  phase='receiver';
  const ready=await chrome.tabs.sendMessage(tab.id,{type:PROBE_PREFIX+'_READY'},{frameId:0});
  if(ready?.ready!==true||ready.spent!==false||typeof ready.documentKey!=='string'){show({state:'not-ready-no-request'});return;}
  phase='recheck-home';
  const current=await chrome.tabs.get(tab.id);
  if(current.url!=='https://chatgpt.com/'){show({state:'target-changed-no-request'});return;}
  localStorage.setItem(key,JSON.stringify({tabId:tab.id}));
  show({state:'consumed-awaiting-result-do-not-repeat'});
  show(await chrome.tabs.sendMessage(tab.id,{type:PROBE_PREFIX+'_ONCE',documentKey:ready.documentKey},{frameId:0}));
 });}catch{
  if(localStorage.getItem(key)!==null)show({state:'consumed-delivery-unconfirmed-no-retry'});
  else if(phase==='receiver')show({state:'receiver-not-loaded-no-request',help:'新扩展尚未连接此页。请在新标签打开 ChatGPT 空白首页，再打开诊断；保留现有页面和草稿，不需重登。'});
  else show({state:'tab-selection-failed-no-request'});
 }finally{button.disabled=localStorage.getItem(key)!==null;}
});
document.getElementById('read').addEventListener('click',async()=>{
 const marker=localStorage.getItem(key);if(marker===null){show({state:'no-request-issued'});return;}
 let tabId=TARGET_TAB_ID;
 if(marker!=='consumed'){try{tabId=JSON.parse(marker).tabId;}catch{show({state:'result-unavailable-no-retry'});return;}}
 if(!Number.isSafeInteger(tabId)||tabId<0){show({state:'result-unavailable-no-retry'});return;}
 try{show(await chrome.tabs.sendMessage(tabId,{type:PROBE_PREFIX+'_STATUS'},{frameId:0}));}catch{show({state:'result-unavailable-no-retry'});}
});

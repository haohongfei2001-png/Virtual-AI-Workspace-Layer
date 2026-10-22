const send=m=>chrome.runtime.sendMessage(m),target=Number(location.hash.slice(1));
const batch='vaiwl-local-context-observation-20261022-v1';
const output=document.getElementById('result'),button=document.getElementById('run'),confirm=document.getElementById('confirm'),download=document.getElementById('download');
let pending=false,report=null,spent=false,poll=null,readPending=false,compatible=false,legacyReport=null;
const show=value=>{
 if(report&&value?.schema!==batch)return;
 if(value?.schema==='vaiwl-local-source-witness-20261022-v1'){
  legacyReport=value;compatible=false;confirm.disabled=true;button.disabled=true;
  if(poll!==null){clearInterval(poll);poll=null;}
  output.textContent=JSON.stringify(spent?{state:'BLOCKED',reason:'passive-worker-version-changed-no-retry',unspent:false}:{state:'NOT_RUN',reason:'passive-worker-not-loaded-no-request'});return;
 }
 output.textContent=JSON.stringify(value,null,2);
 if(value?.schema===batch){report=value;download.disabled=false;}
 if(value?.unspent===false||value?.schema){spent=true;button.disabled=true;}
 const running=['PREPARING','WAITING_NATIVE','RUNNING'].includes(value?.state);
 if(running&&poll===null)poll=setInterval(read,1000);
 else if(!running&&poll!==null){clearInterval(poll);poll=null;}
};
async function read(){if(readPending)return;readPending=true;try{show(await send({type:'SOURCE_WITNESS_READ'}));}catch{show({state:'BLOCKED',reason:'extension-connection-lost-do-not-repeat'});}finally{readPending=false;}}
try{if(!location.hash||!Number.isSafeInteger(target))throw Error('target');const env=await send({type:'SOURCE_WITNESS_PREVIEW',tabId:target});compatible=env.state==='READY'&&env.mode==='PASSIVE_C2_ONLY'&&env.batch===batch;document.getElementById('environment').textContent=compatible?`当前窗口的 Chrome Profile（浏览器不提供名称）；ChatGPT ${env.route} 页面；非隐身；扩展 ${env.version}，被动批次已匹配。请核对这是已授权测试账户。`:env.state==='READY'?'原扩展尚未加载被动观察版本；本页不会执行。请仅重载原扩展，不要卸载。':'未找到原 ChatGPT 标签；不会发请求。';if(!compatible)confirm.disabled=true;}catch{confirm.disabled=true;}
await read();
const previous=document.getElementById('previous-result');
if(previous)try{previous.textContent=JSON.stringify(legacyReport??await send({type:'SOURCE_WITNESS_PREVIOUS'}),null,2);}catch{previous.textContent='旧结果读取失败；不会重发或清除旧批次。';}
confirm.addEventListener('change',()=>{if(!pending&&!spent&&!report&&!confirm.disabled)button.disabled=!confirm.checked;});
button.addEventListener('click',async event=>{
 if(!event.isTrusted||!compatible||pending||spent||report||confirm.disabled||!confirm.checked)return;pending=true;button.disabled=true;confirm.disabled=true;
 try{const result=await send({type:'SOURCE_WITNESS_ARM',tabId:target,batch});show(result);if(result.unspent===true){pending=false;confirm.disabled=false;button.disabled=!confirm.checked;}}catch{show({state:'BLOCKED',reason:'delivery-unknown-read-only-no-retry'});}
});
document.getElementById('read').addEventListener('click',read);
download.addEventListener('click',()=>{if(!report)return;const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vaiwl-source-witness-redacted.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
// Local result reads only, no keepalive port, API retry or resumed worker work.
window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});

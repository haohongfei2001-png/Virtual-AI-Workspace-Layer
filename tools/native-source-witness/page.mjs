const send=m=>chrome.runtime.sendMessage(m),target=Number(location.hash.slice(1));
const output=document.getElementById('result'),button=document.getElementById('run'),confirm=document.getElementById('confirm'),download=document.getElementById('download');
let pending=false,report=null,spent=false,poll=null,readPending=false;
const show=value=>{
 if(report&&!value?.schema)return;
 output.textContent=JSON.stringify(value,null,2);
 if(value?.schema==='vaiwl-local-source-witness-20261022-v1'){report=value;download.disabled=false;}
 if(value?.unspent===false||value?.schema){spent=true;button.disabled=true;}
 const running=['PREPARING','WAITING_NATIVE','RUNNING'].includes(value?.state);
 if(running&&poll===null)poll=setInterval(read,1000);
 else if(!running&&poll!==null){clearInterval(poll);poll=null;}
};
async function read(){if(readPending)return;readPending=true;try{show(await send({type:'SOURCE_WITNESS_READ'}));}catch{show({state:'BLOCKED',reason:'extension-connection-lost-do-not-repeat'});}finally{readPending=false;}}
try{if(!location.hash||!Number.isSafeInteger(target))throw Error('target');const env=await send({type:'SOURCE_WITNESS_PREVIEW',tabId:target});document.getElementById('environment').textContent=env.state==='READY'?`当前窗口的 Chrome Profile（浏览器不提供名称）；ChatGPT ${env.route} 页面；非隐身；扩展 ${env.version}。请核对这是已授权测试账户。`:'未找到原 ChatGPT 标签；不会发请求。';if(env.state!=='READY')confirm.disabled=true;}catch{confirm.disabled=true;}
await read();
confirm.addEventListener('change',()=>{if(!pending&&!spent&&!report&&!confirm.disabled)button.disabled=!confirm.checked;});
button.addEventListener('click',async event=>{
 if(!event.isTrusted||pending||!confirm.checked)return;pending=true;button.disabled=true;confirm.disabled=true;
 try{const result=await send({type:'SOURCE_WITNESS_ARM',tabId:target});show(result);if(result.unspent===true){pending=false;confirm.disabled=false;button.disabled=!confirm.checked;}}catch{show({state:'BLOCKED',reason:'delivery-unknown-read-only-no-retry'});}
});
document.getElementById('read').addEventListener('click',read);
download.addEventListener('click',()=>{if(!report)return;const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vaiwl-source-witness-redacted.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
// Local result reads only, no keepalive port, API retry or resumed worker work.
window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});

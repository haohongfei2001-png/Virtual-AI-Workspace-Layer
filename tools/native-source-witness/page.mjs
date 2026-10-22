const send=m=>chrome.runtime.sendMessage(m),target=Number(location.hash.slice(1));
const batch='vaiwl-local-context-observation-20261022-v1';
const output=document.getElementById('result'),button=document.getElementById('run'),confirm=document.getElementById('confirm'),download=document.getElementById('download');
const nextStep=document.getElementById('next-step'),returnTarget=document.getElementById('return-target');
let pending=false,report=null,spent=false,poll=null,readPending=false,compatible=false,legacyReport=null,homeReady=false,waiting=false,returnPending=false;
const guide=value=>{
 waiting=compatible&&value?.state==='WAITING_NATIVE';
 returnTarget.hidden=!waiting;returnTarget.disabled=!waiting||returnPending;
 nextStep.textContent=waiting?'观察已就绪，正在计时。点击下方按钮回到本次绑定的标签，再用原生侧栏打开一条已有聊天。':
  value?.state==='PREPARING'?'正在安装观察器，请暂时停留本页。看到“观察已就绪”后再返回聊天。':
  value?.state==='RUNNING'?'正在核对本次关联，请勿再次导航或启动。':
  value?.unspent===false||value?.schema?'本批已结束或状态不确定，不能重跑。请读取或保存现有结果。':
  homeReady?'尚未开始。勾选确认并准备后，等待“观察已就绪”。':'本页未就绪。请从已授权 ChatGPT 空白首页打开入口；不会启动观察。';
};
const show=value=>{
 if(report&&value?.schema!==batch)return;
 if(value?.schema==='vaiwl-local-source-witness-20261022-v1'){
  legacyReport=value;compatible=false;confirm.disabled=true;button.disabled=true;
  if(poll!==null){clearInterval(poll);poll=null;}
  guide({state:'BLOCKED',unspent:!spent});
  output.textContent=JSON.stringify(spent?{state:'BLOCKED',reason:'passive-worker-version-changed-no-retry',unspent:false}:{state:'NOT_RUN',reason:'passive-worker-not-loaded-no-request'});return;
 }
 output.textContent=JSON.stringify(value,null,2);
 guide(value);
 if(value?.schema===batch){report=value;download.disabled=false;}
 if(value?.unspent===false||value?.schema){spent=true;button.disabled=true;}
 const running=['PREPARING','WAITING_NATIVE','RUNNING'].includes(value?.state);
 if(running&&poll===null)poll=setInterval(read,1000);
 else if(!running&&poll!==null){clearInterval(poll);poll=null;}
};
async function read(){if(readPending)return;readPending=true;try{show(await send({type:'SOURCE_WITNESS_READ'}));}catch{show({state:'BLOCKED',reason:'extension-connection-lost-do-not-repeat'});}finally{readPending=false;}}
try{if(!location.hash||!Number.isSafeInteger(target))throw Error('target');const env=await send({type:'SOURCE_WITNESS_PREVIEW',tabId:target});compatible=env.state==='READY'&&env.mode==='PASSIVE_C2_ONLY'&&env.batch===batch;homeReady=compatible&&env.route==='home';document.getElementById('environment').textContent=compatible?`入口绑定的 Chrome 标签（浏览器不提供 Profile 名称）；ChatGPT ${env.route} 页面；非隐身；扩展 ${env.version}，被动批次已匹配。请核对这是已授权测试账户。`:env.state==='READY'?'原扩展尚未加载被动观察版本；本页不会执行。请仅重载原扩展，不要卸载。':'未找到原 ChatGPT 标签；不会发请求。';if(!homeReady)confirm.disabled=true;}catch{confirm.disabled=true;}
await read();
const previous=document.getElementById('previous-result');
if(previous)try{previous.textContent=JSON.stringify(legacyReport??await send({type:'SOURCE_WITNESS_PREVIOUS'}),null,2);}catch{previous.textContent='旧结果读取失败；不会重发或清除旧批次。';}
confirm.addEventListener('change',()=>{if(!pending&&!spent&&!report&&!confirm.disabled)button.disabled=!confirm.checked;});
button.addEventListener('click',async event=>{
 if(!event.isTrusted||!compatible||!homeReady||pending||spent||report||confirm.disabled||!confirm.checked)return;pending=true;button.disabled=true;confirm.disabled=true;guide({state:'PREPARING'});
 try{const result=await send({type:'SOURCE_WITNESS_ARM',tabId:target,batch});show(result);if(result.unspent===true){pending=false;confirm.disabled=false;button.disabled=!confirm.checked;}}catch{show({state:'BLOCKED',reason:'delivery-unknown-read-only-no-retry'});}
});
returnTarget.addEventListener('click',async event=>{
 if(!event.isTrusted||!waiting||returnPending)return;returnPending=true;returnTarget.disabled=true;
 try{const result=await send({type:'SOURCE_WITNESS_RETURN'});if(result?.state!=='TARGET_SHOWN'){await read();if(waiting)nextStep.textContent='无法定位本次绑定标签。请保留结果，不要另开标签或重新准备。';}}
 catch{nextStep.textContent='标签定位结果不确定，请保留当前观察，不要重新准备。';}
 finally{returnPending=false;returnTarget.disabled=!waiting;}
});
document.getElementById('read').addEventListener('click',read);
download.addEventListener('click',()=>{if(!report)return;const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vaiwl-source-witness-redacted.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
// Local result reads only, no keepalive port, API retry or resumed worker work.
window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});

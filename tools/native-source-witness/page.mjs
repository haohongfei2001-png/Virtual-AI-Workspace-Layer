const send=m=>chrome.runtime.sendMessage(m),target=Number(location.hash.slice(1));
const batch='vaiwl-local-context-observation-20261022-v2';
const output=document.getElementById('result'),button=document.getElementById('run'),download=document.getElementById('download');
const nextStep=document.getElementById('next-step'),returnTarget=document.getElementById('return-target');
let pending=false,report=null,spent=false,poll=null,readPending=false,compatible=false,legacyReport=null,homeReady=false,waiting=false,returnPending=false,canStart=false,showCompletion=false,closed=false;
const syncRun=()=>{button.disabled=pending||spent||!!report||!compatible||!homeReady||!canStart;};
const priorBlocked=value=>['previous-consumed-context-result-required','previous-consumed-passive-result-required'].includes(value?.reason);
async function showCompletedPage(){
 // Only this page's explicit start can request a return. Reading an old result
 // or reopening this page never activates a tab. Do not focus another window.
 if(!showCompletion||closed)return;showCompletion=false;
 try{
  const own=await chrome.tabs.getCurrent();if(closed||!Number.isSafeInteger(own?.id))return;
  const window=await chrome.windows.getCurrent();if(closed||!window.focused||window.id!==own.windowId)return;
  const active=await chrome.tabs.query({active:true,currentWindow:true});
  if(closed||active.length!==1||active[0].id!==target||active[0].windowId!==own.windowId)return;
  await chrome.tabs.update(own.id,{active:true});
 }catch{/* The result stays readable here; never retry a focus action. */}
}
const guide=value=>{
 waiting=compatible&&value?.state==='WAITING_NATIVE';
 returnTarget.hidden=!waiting;returnTarget.disabled=!waiting||returnPending;
 nextStep.textContent=priorBlocked(value)?'尚未开始：旧批次记录不匹配，本次许可未消费。请保留下面已展开的旧结果；无需打开聊天、刷新、重登或反复点开始。':
  waiting?'观察已就绪，正在计时。请在原生侧栏点一次已有聊天。开始按钮会自动返回原标签；若重开了本结果页，可用下方按钮定位原标签。':
  value?.state==='PREPARING'?'正在安装观察器，请暂时停留本页。准备完成后自动返回原标签。':
  value?.state==='RUNNING'?'正在核对本次关联，请勿再次导航或启动。':
  value?.unspent===false||value?.schema?'本批已结束或状态不确定，不能重跑。请读取或保存现有结果。':
  homeReady?'尚未开始。核对环境后点一次“确认此 Profile，开始观察”，随后只需在原生侧栏点一次已有聊天。':'本页未就绪。请从已授权 ChatGPT 空白首页打开入口；不会启动观察。';
};
const show=value=>{
 if(report&&value?.schema!==batch)return;
 // A local read begun before ARM can finish after its durable reservation.
 // Never let that stale preflight undo the confirmed running/spent UI state.
 if(spent&&value?.state==='NOT_RUN'&&value?.unspent===true)return;
 if(value?.schema&&value.schema!==batch){
  legacyReport=value;compatible=false;canStart=false;showCompletion=false;syncRun();
  if(poll!==null){clearInterval(poll);poll=null;}
  guide({state:'BLOCKED',unspent:!spent});
  output.textContent=JSON.stringify(spent?{state:'BLOCKED',reason:'passive-worker-version-changed-no-retry',unspent:false}:{state:'NOT_RUN',reason:'passive-worker-not-loaded-no-request'});return;
 }
 output.textContent=JSON.stringify(value,null,2);
 guide(value);
 canStart=value?.state==='NOT_RUN'&&value?.unspent===true&&!priorBlocked(value);
 if(priorBlocked(value)){const prior=document.getElementById('previous-batches');if(prior)prior.open=true;}
 if(value?.schema===batch){report=value;download.disabled=false;void showCompletedPage();}
 if(value?.unspent===false||value?.schema)spent=true;
 syncRun();
 const running=['PREPARING','WAITING_NATIVE','RUNNING'].includes(value?.state);
 if(running&&poll===null)poll=setInterval(read,1000);
 else if(!running&&poll!==null){clearInterval(poll);poll=null;}
};
async function read(){if(readPending)return;readPending=true;try{show(await send({type:'SOURCE_WITNESS_READ',batch}));}catch{show({state:'BLOCKED',reason:'extension-connection-lost-do-not-repeat'});}finally{readPending=false;}}
try{if(!location.hash||!Number.isSafeInteger(target))throw Error('target');const env=await send({type:'SOURCE_WITNESS_PREVIEW',tabId:target});compatible=env.state==='READY'&&env.mode==='PASSIVE_C2_ONLY'&&env.batch===batch;homeReady=compatible&&env.route==='home';document.getElementById('environment').textContent=compatible?`入口绑定的 Chrome 标签（浏览器不提供 Profile 名称）；ChatGPT ${env.route} 页面；非隐身；扩展 ${env.version}，被动批次已匹配。请核对这是已授权测试账户。`:env.state==='READY'?'原扩展尚未加载被动观察版本；本页不会执行。请仅重载原扩展，不要卸载。':'未找到原 ChatGPT 标签；不会发请求。';}catch{compatible=false;}
await read();
const previous=document.getElementById('previous-result');
if(previous)try{previous.textContent=JSON.stringify(legacyReport??await send({type:'SOURCE_WITNESS_PREVIOUS'}),null,2);}catch{previous.textContent='旧结果读取失败；不会重发或清除旧批次。';}
button.addEventListener('click',async event=>{
 if(!event.isTrusted||!compatible||!homeReady||pending||spent||report||!canStart)return;pending=true;canStart=false;syncRun();guide({state:'PREPARING'});
 try{
  const result=await send({type:'SOURCE_WITNESS_ARM',tabId:target,batch});
  showCompletion=compatible&&!closed&&result?.startedHere===true;show(result);
  if(report)void showCompletedPage();
  else if(showCompletion&&waiting&&!closed)await returnToTarget();
 }
 catch{showCompletion=false;show({state:'BLOCKED',reason:'delivery-unknown-read-only-no-retry'});}
 finally{pending=false;syncRun();}
});
async function returnToTarget(){
 if(!waiting||returnPending||closed)return;returnPending=true;returnTarget.disabled=true;
 try{const result=await send({type:'SOURCE_WITNESS_RETURN',batch});if(result?.state!=='TARGET_SHOWN'){await read();if(waiting)nextStep.textContent='无法定位本次绑定标签。请保留结果，不要另开标签或重新准备。';}}
 catch{nextStep.textContent='标签定位结果不确定，请保留当前观察，不要重新准备。';}
 finally{returnPending=false;returnTarget.disabled=!waiting;}
}
returnTarget.addEventListener('click',event=>{if(event.isTrusted)return returnToTarget();});
document.getElementById('read').addEventListener('click',read);
download.addEventListener('click',()=>{if(!report)return;const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vaiwl-source-witness-redacted.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
// Local result reads only, no keepalive port, API retry or resumed worker work.
window.addEventListener('pagehide',()=>{closed=true;showCompletion=false;clearInterval(poll);},{once:true});

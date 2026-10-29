import {HOST_CONFIG} from './config.mjs';
import {readActiveLocalStatus,readActiveLocalLayout,readLocalBoot,validLocalPipeline,createSidebarSnapshot,createMainMountSnapshot} from '../src/host/local-status.mjs';
import {HISTORY_DIAGNOSTIC_BATCH,validHistoryStructureReport,runHistoryDiagnosticOnce,sidebarStructureCoverage} from '../src/host/history-structure-diagnostic.mjs';
const messages={'foreground-failed':'本次检查：前台会话复核未通过，旧空间保持锁定，原生页面可用。','layout-failed':'本次检查：页面布局尚未满足安全挂载条件，增强界面未启动。原生页面和草稿保持不变；无需重新确认账号或重装扩展。','hello-failed':'本次检查：内容脚本已启动，但与扩展后台的初始连接未完成。旧数据未解锁。','adapter-failed':'本次检查：原生页面适配未完成，增强界面未启动。原生页面保持可用。','authorization-failed':'本次检查：工作空间授权阶段未完成，旧私人数据保持锁定。','surface-failed':'本次检查：工作空间界面挂载未完成，原生页面保持可用。',reading:'本次检查：已连接，当前保留原生阅读或输入。可使用页面顶部的四格“返回工作空间”入口展开 VAIWL。',suspended:'本次检查：已连接，增强界面正在为原生弹层或交互让位。结束当前原生操作后，可使用四格入口返回；私人空间状态见下方。','frame-blocked':'本次检查：界面框架被替换，VAIWL 已安全退出，原生页面仍可使用。若正在使用浏览器自动控制，请结束控制后正常打开页面。无需重新确认账号或重装扩展。',ready:'本次检查：增强界面已连接。',dormant:'本次检查：增强界面已休眠，原生 ChatGPT 仍可使用。',connecting:'本次检查：正在连接工作空间，原生 ChatGPT 仍可使用。',waiting:'本次检查：暂时无法验证工作空间，正在等待新的上下文证据。原生 ChatGPT 仍可使用。','verification-required':'本次检查：服务端要求浏览器验证，增强界面已停止连接。请查看原生 ChatGPT 页面；若出现验证请手动完成，没有验证页则无需反复刷新。',unavailable:'本次检查：此标签页尚未接入增强界面。请确认这是受支持的 ChatGPT 页面；原生页面仍可使用。'};
let localFailure=null,localTarget=null,bootTarget=null;const state=await readActiveLocalStatus({tabs:chrome.tabs,webNavigation:chrome.webNavigation,onTarget:t=>{localTarget=t;},onProbeTarget:t=>{bootTarget=t;},onFailure:code=>{localFailure=code;}});
const layoutRegionNames={header:'原生标题栏',reading:'独立阅读区',composer:'原生输入区',navigationSlot:'返回入口区域',historyList:'原生历史列表',returnHitRoot:'页面内容容器',readingViewport:'阅读滚动区域'};
const missing=/^layout-(missing|ambiguous)-(header|reading|composer|navigationSlot|historyList|returnHitRoot|readingViewport)$/.exec(state);
const layoutMessage=missing?'本次检查：布局未就绪，'+layoutRegionNames[missing[2]]+(missing[1]==='missing'?'尚未找到。':'存在多个候选。')+'原生页面保持可用；本地空间状态见下方。':state.startsWith('layout-project-')?'本次检查：项目页面布局尚未就绪，增强界面未挂载；原生页面和草稿保持不变。':state.startsWith('layout-history-')?'本次检查：原生近期列表尚未就绪，原生页面保持可用。':state.startsWith('layout-sidebar-')?'本次检查：历史列表布局尚未就绪，原生页面保持可用。':state.startsWith('layout-geometry-')?'本次检查：布局安全检查未通过，增强界面未挂载；原生页面保持可用。':state==='layout-check-failed'?'本次检查：布局准备未完成；原生页面保持可用。':null;
const initializationLabels={preparation:'会话初始化',candidates:'导航候选初始化',snippets:'片段初始化',navigation:'原生导航初始化',surface:'界面承载初始化',controller:'界面控制器初始化'};
const initialization=/^initialization-(preparation|candidates|snippets|navigation|surface|controller)-failed$/.exec(state);
const initializationMessage=initialization?'本次检查：已通过本次工作空间授权检查，但'+initializationLabels[initialization[1]]+'未完成。这不是账号确认提示；无需重复确认或重装扩展。原生页面保持可用。':null;
document.getElementById('status').textContent=messages[state]??initializationMessage??layoutMessage??(state.startsWith('foreground-')?'本次检查：前台连续性检查未通过，私人界面已撤回，原生页面保持可用。':null)??(state.startsWith('hello-')?'本次检查：初始文档连接未完成。旧数据保持锁定；原生页面保持可用。':null)??(state.startsWith('surface-')?'本次检查：增强界面暂不可用，原生页面保持可用；本地空间状态见下方。':'本次检查：状态不可用。');
if(state==='unavailable')document.getElementById('status').textContent+=' 本地检查：'+({timeout:'查询超时。','tab-unavailable':'当前标签不可用。','invalid-reply':'未取得有效本地回复。','transport-error':'内容脚本通信不可用。','tab-query-failed':'当前标签查询失败。','document-query-failed':'当前文档查询失败。','document-unavailable':'当前文档尚未激活。','document-changed':'检查期间文档发生变化；未将旧回复用于新页面。','receiver-unavailable':'本次发送时内容脚本接收端不存在。','receiver-disconnected':'接收端在回复前断开。','tab-closed':'本次发送时标签已关闭。'}[localFailure]??'内容脚本已响应，但会话不可用。');
const diagnostics=document.getElementById('diagnostic-details');
const statusCode=document.createElement('p');statusCode.id='status-code';statusCode.className='note';statusCode.textContent='本次状态码：'+state+(localFailure?'；本地检查：'+localFailure:'');diagnostics.append(statusCode);
const runtimeBuild=document.createElement('p');runtimeBuild.id='runtime-build';runtimeBuild.className='note';runtimeBuild.textContent='运行构建：正在核对当前文档回执…';diagnostics.append(runtimeBuild);
const bootReceipt=readLocalBoot({tabs:chrome.tabs,webNavigation:chrome.webNavigation,target:bootTarget});
void bootReceipt.then(boot=>{
 runtimeBuild.textContent=boot?'当前文档运行构建：'+boot.build+'；启动阶段：'+boot.stage+'。此回执不代表产品验收通过。':'运行构建：未核实。未取得与当前文档一致的有效启动回执；不能用磁盘文件推定运行版本。';
 if(boot){const note=document.createElement('pre');note.textContent='当前文档启动（无内容） '+JSON.stringify(boot);diagnostics.append(note);}
});
if(state.startsWith('layout-')||HOST_CONFIG.browserLocal&&localTarget&&state!=='verification-required'){const shape=await readActiveLocalLayout({tabs:chrome.tabs,webNavigation:chrome.webNavigation,target:localTarget});if(shape){
 if(HOST_CONFIG.mainMountDiagnostic){
  const snapshot=await createMainMountSnapshot({webNavigation:chrome.webNavigation,target:localTarget,boot:await bootReceipt,shape});
  const receipt=document.createElement('p');receipt.id='main-mount-receipt';receipt.textContent=snapshot?'首次主区挂载检查已绑定本次文档；构建 '+snapshot.build.slice(0,12)+'；'+snapshot.mainMountCheck.reason+'；拒绝路径 '+snapshot.mainMountCheck.coverage+'。这不是整页结构或产品验收；重复打开不重新采集。':'本次文档没有可交付的主区挂载报告；未执行重试，不据此推断拒绝原因。';diagnostics.append(receipt);
  if(snapshot){const save=document.createElement('button');save.id='save-main-mount-snapshot';save.textContent='保存匿名主区挂载报告';save.addEventListener('click',()=>{
   const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='vaiwl-main-mount-check.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });diagnostics.append(save);}
 }
 if(shape.sidebarStructure){const coverage=document.createElement('pre');coverage.id='sidebar-structure-coverage';coverage.textContent='侧栏快照完整性（仅结构，不证明成员归属或允许接管） '+JSON.stringify(sidebarStructureCoverage(shape.sidebarStructure));diagnostics.append(coverage);}
 const snapshot=HOST_CONFIG.browserLocal&&!HOST_CONFIG.mainMountDiagnostic?await createSidebarSnapshot({webNavigation:chrome.webNavigation,target:localTarget,boot:await bootReceipt,shape}):null;
 if(HOST_CONFIG.browserLocal&&!HOST_CONFIG.mainMountDiagnostic){
  const receipt=document.createElement('p');receipt.id='sidebar-snapshot-receipt';receipt.textContent=snapshot?'匿名快照已绑定本次文档；构建 '+snapshot.build.slice(0,12)+'；结构 '+snapshot.coverage.state+'。完整快照不等于成员语义已确认。':'本次匿名快照未取得有效构建及文档绑定；没有生成可交付报告。';diagnostics.append(receipt);
  if(snapshot){const save=document.createElement('button');save.id='save-sidebar-snapshot';save.textContent='保存匿名侧栏快照';save.addEventListener('click',()=>{
   const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='vaiwl-sidebar-structure.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });diagnostics.append(save);}
 }
 const note=document.createElement('pre');note.id='local-layout-shape';note.textContent=(shape.navigation?'导航末页及本代累计接收（无内容；累计不是去重库存） ':'布局类别（无内容） ')+JSON.stringify(shape);diagnostics.append(note);}}

if(HOST_CONFIG.browserLocal){
 const note=document.createElement('p');note.className='note';note.textContent='本页记录可继续使用。恢复本地资料需确认当前账号与空间。';document.body.append(note);
 const result=document.createElement('p');result.setAttribute('role','status');document.body.append(result);let pipelineCurrent=true;
 // Surface readiness does not prove a personal binding. Read the existing
 // private control status once; never unlock or infer a grant from a descriptor.
 if(['ready','reading','suspended','dormant'].includes(state)||state.startsWith('layout-')||state.startsWith('surface-')){
  result.textContent='正在检查当前文档的本地空间状态…';
  let timer;try{
   const r=await Promise.race([chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1000);})]);
   result.textContent=r?.ok===true&&typeof r.exists==='boolean'&&r.mode==='personal'?'当前文档的本地空间已解锁；本次无需重复确认。':r?.ok===true&&typeof r.exists==='boolean'&&r.mode==='locked'?(r.exists?'旧私人数据已锁定；当前仅显示即时视图。恢复旧资料需要本人确认当前账号与工作空间。':'当前仅显示即时视图；本人确认后才绑定并保存本地个人空间。'):'当前文档的本地绑定状态未能确认；不会据此解锁旧数据。';
  }catch{result.textContent='当前文档的本地绑定状态未能确认；不会据此解锁旧数据。';}finally{clearTimeout(timer);}
 }
 const unlock=document.createElement('button');unlock.textContent='确认当前账号与工作空间，解锁本地空间';unlock.disabled=state==='frame-blocked';document.body.append(unlock);
 const lock=document.createElement('button');lock.textContent='锁定本地空间';document.body.append(lock);
 const perform=async action=>{pipelineCurrent=false;unlock.disabled=true;lock.disabled=true;try{const r=await chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action});result.textContent=r?.ok?(action==='unlock'?'本地空间已绑定到当前文档。':'旧数据已锁定；关闭面板后可继续即时查看。'):'未能绑定；原生页面与旧数据保持不变。';}catch{result.textContent='连接不可用，未解锁旧数据。';}finally{unlock.disabled=state==='frame-blocked';lock.disabled=false;}};
 unlock.addEventListener('click',()=>void perform('unlock'));lock.addEventListener('click',()=>void perform('lock'));
 // Independent optional read: slow storage must not delay binding status or
 // buttons, and its late result must not overwrite a new confirmation/lock.
 if(['ready','reading','suspended','dormant'].includes(state)||state.startsWith('layout-')||state.startsWith('surface-')){
  let timer;void Promise.race([chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'pipeline'}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1000);})]).then(r=>{
   if(pipelineCurrent&&r?.ok===true&&validLocalPipeline(r.pipeline)){const trace=document.createElement('pre');trace.textContent='本地库、工作空间回复与框架回执（仅数量/版本；rendered仅证明节点已建立，不代表可见） '+JSON.stringify(r.pipeline);diagnostics.append(trace);}
  },()=>{}).finally(()=>clearTimeout(timer));
 }
 if(!HOST_CONFIG.mainMountDiagnostic&&chrome.storage?.local&&globalThis.navigator?.locks){
 const diagnostic=document.createElement('details'),summary=document.createElement('summary');summary.textContent='本次匿名近期列表诊断（一次性）';diagnostic.append(summary);
 const explain=document.createElement('p');explain.textContent='仅本首页，最多6秒；记录行类别、标记是否存在、位置及匿名节点变化。不读取标题、聊天ID、正文或凭据，不解锁旧库、不刷新、不联网。已消费后只显示原报告。';diagnostic.append(explain);
 const run=document.createElement('button');run.textContent='执行一次匿名列表观察';const report=document.createElement('pre');report.id='history-structure-report';diagnostic.append(run,report);diagnostics.append(diagnostic);
 const saved=(await chrome.storage.local.get(HISTORY_DIAGNOSTIC_BATCH))[HISTORY_DIAGNOSTIC_BATCH];
 if(saved!==undefined){run.disabled=true;report.textContent=JSON.stringify({state:'spent',report:validHistoryStructureReport(saved?.report)?saved.report:null});}
 run.addEventListener('click',async()=>{run.disabled=true;report.textContent='正在进行一次只读观察…';try{report.textContent=JSON.stringify(await runHistoryDiagnosticOnce({chrome,locks:navigator.locks}));}catch{report.textContent='诊断不可用；不自动重试。';}});
 }
}

// Keep optional engineering details after the local-data controls.
document.body.append(diagnostics);

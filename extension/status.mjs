import {HOST_CONFIG} from './config.mjs';
import {readActiveLocalStatus,readActiveLocalLayout} from '../src/host/local-status.mjs';
import {HISTORY_DIAGNOSTIC_BATCH,validHistoryStructureReport,runHistoryDiagnosticOnce} from '../src/host/history-structure-diagnostic.mjs';
const messages={'foreground-failed':'本次检查：前台会话复核未通过，旧空间保持锁定，原生页面可用。','layout-failed':'本次检查：页面布局尚未满足安全挂载条件，增强界面未启动。原生页面和草稿保持不变；无需重新确认账号或重装扩展。','hello-failed':'本次检查：内容脚本已启动，但与扩展后台的初始连接未完成。旧数据未解锁。','adapter-failed':'本次检查：原生页面适配未完成，增强界面未启动。原生页面保持可用。','authorization-failed':'本次检查：工作空间授权阶段未完成，旧私人数据保持锁定。','surface-failed':'本次检查：工作空间界面挂载未完成，原生页面保持可用。',reading:'本次检查：已连接，当前保留原生阅读或输入。可使用页面顶部的四格“返回工作空间”入口展开 VAIWL。',suspended:'本次检查：已连接，增强界面正在为原生弹层或交互让位。结束当前原生操作后，可使用四格入口返回；私人空间状态见下方。','frame-blocked':'本次检查：界面框架被替换，VAIWL 已安全退出，原生页面仍可使用。若正在使用浏览器自动控制，请结束控制后正常打开页面。无需重新确认账号或重装扩展。',ready:'本次检查：增强界面已连接。',dormant:'本次检查：增强界面已休眠，原生 ChatGPT 仍可使用。',connecting:'本次检查：正在连接工作空间，原生 ChatGPT 仍可使用。',waiting:'本次检查：暂时无法验证工作空间，正在等待新的上下文证据。原生 ChatGPT 仍可使用。','verification-required':'本次检查：服务端要求浏览器验证，增强界面已停止连接。请查看原生 ChatGPT 页面；若出现验证请手动完成，没有验证页则无需反复刷新。',unavailable:'本次检查：此标签页尚未接入增强界面。请确认这是受支持的 ChatGPT 页面；原生页面仍可使用。'};
let localFailure=null;const state=await readActiveLocalStatus({tabs:chrome.tabs,onFailure:code=>{localFailure=code;}});
const layoutRegionNames={header:'原生标题栏',reading:'独立阅读区',composer:'原生输入区',navigationSlot:'返回入口区域',historyList:'原生历史列表',returnHitRoot:'页面内容容器',readingViewport:'阅读滚动区域'};
const missing=/^layout-(missing|ambiguous)-(header|reading|composer|navigationSlot|historyList|returnHitRoot|readingViewport)$/.exec(state);
const layoutMessage=missing?'本次检查：布局未就绪，'+layoutRegionNames[missing[2]]+(missing[1]==='missing'?'尚未找到。':'存在多个候选。')+'原生页面保持可用；本地空间状态见下方。':state.startsWith('layout-project-')?'本次检查：Project 页面布局尚未就绪（'+state.slice('layout-project-'.length)+'），增强界面未挂载；原生页面和草稿保持不变。':state.startsWith('layout-history-')?'本次检查：原生近期列表尚未就绪（'+state.slice(15)+'），原生页面保持可用。':state.startsWith('layout-sidebar-')?'本次检查：历史边界未就绪（'+state.slice(15)+'），原生页面保持可用。':state.startsWith('layout-geometry-')?'本次检查：布局安全检查未通过（'+state.slice('layout-geometry-'.length)+'），增强界面未挂载；原生页面保持可用。':state==='layout-check-failed'?'本次检查：布局准备未完成；原生页面保持可用。':null;
document.getElementById('status').textContent=messages[state]??layoutMessage??(state.startsWith('foreground-')?'本次检查：前台连续性检查未通过（'+state.slice(11)+'），私人界面已撤回，原生页面保持可用。':null)??(state.startsWith('hello-')?'本次检查：初始文档连接未完成（'+state.slice(6)+'）。旧数据保持锁定；未启动界面或读取内部接口。':null)??(state.startsWith('surface-')?'本次检查：挂载检查未通过（'+state.slice(8)+'），原生页面保持可用；本地空间状态见下方。':'本次检查：状态不可用。');
if(state==='unavailable')document.getElementById('status').textContent+=' 本地检查：'+({timeout:'查询超时。','tab-unavailable':'当前标签不可用。','invalid-reply':'未取得有效本地回复。','transport-error':'内容脚本通信不可用。'}[localFailure]??'内容脚本已响应，但会话不可用。');
if(state.startsWith('layout-')||HOST_CONFIG.browserLocal&&['ready','reading','suspended'].includes(state)){const shape=await readActiveLocalLayout({tabs:chrome.tabs});if(shape){const note=document.createElement('pre');note.textContent=(shape.navigation?'导航接收（无内容） ':'布局类别（无内容） ')+JSON.stringify(shape);document.getElementById('status').append(note);}}

if(HOST_CONFIG.browserLocal){
 const note=document.createElement('p');note.className='note';note.textContent='即时层只显示本页已知导航。确认后，才读写你绑定的本地个人空间。这不是服务器身份认证：请确认当前账号及 Workspace 正确。同一页面内切换标签、普通操作和后台恢复无需重新确认。账户或空间切换风险会锁定旧数据。刷新和完整重启浏览器后先显示即时视图，恢复旧资料时再确认。';document.body.append(note);
 const result=document.createElement('p');result.setAttribute('role','status');document.body.append(result);
 // Surface readiness does not prove a personal binding. Read the existing
 // private control status once; never unlock or infer a grant from a descriptor.
 if(['ready','reading','suspended','dormant'].includes(state)||state.startsWith('layout-')||state.startsWith('surface-')){
  result.textContent='正在检查当前文档的本地空间状态…';
  let timer;try{
   const r=await Promise.race([chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action:'status'}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1000);})]);
   result.textContent=r?.ok===true&&typeof r.exists==='boolean'&&r.mode==='personal'?'当前文档的本地空间已解锁；本次无需重复确认。':r?.ok===true&&typeof r.exists==='boolean'&&r.mode==='locked'?(r.exists?'旧私人数据已锁定；当前仅显示即时视图。恢复旧资料需要本人确认当前账号与 Workspace。':'当前仅显示即时视图；本人确认后才绑定并保存本地个人空间。'):'当前文档的本地绑定状态未能确认；不会据此解锁旧数据。';
  }catch{result.textContent='当前文档的本地绑定状态未能确认；不会据此解锁旧数据。';}finally{clearTimeout(timer);}
 }
 const unlock=document.createElement('button');unlock.textContent='确认当前账号与 Workspace，解锁本地空间';unlock.disabled=state==='frame-blocked';document.body.append(unlock);
 const lock=document.createElement('button');lock.textContent='锁定本地空间';document.body.append(lock);
 const perform=async action=>{unlock.disabled=true;lock.disabled=true;try{const r=await chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action});result.textContent=r?.ok?(action==='unlock'?'本地空间已绑定到当前文档。':'旧数据已锁定；关闭面板后可继续即时查看。'):'未能绑定；原生页面与旧数据保持不变。';}catch{result.textContent='连接不可用，未解锁旧数据。';}finally{unlock.disabled=state==='frame-blocked';lock.disabled=false;}};
 unlock.addEventListener('click',()=>void perform('unlock'));lock.addEventListener('click',()=>void perform('lock'));
 if(chrome.storage?.local&&globalThis.navigator?.locks){
 const diagnostic=document.createElement('details'),summary=document.createElement('summary');summary.textContent='本次匿名近期列表诊断（一次性）';diagnostic.append(summary);
 const explain=document.createElement('p');explain.textContent='仅本首页，最多6秒；记录行类别、标记是否存在、位置及匿名节点变化。不读取标题、聊天ID、正文或凭据，不解锁旧库、不刷新、不联网。已消费后只显示原报告。';diagnostic.append(explain);
 const run=document.createElement('button');run.textContent='执行一次匿名列表观察';const report=document.createElement('pre');report.id='history-structure-report';diagnostic.append(run,report);document.body.append(diagnostic);
 const saved=(await chrome.storage.local.get(HISTORY_DIAGNOSTIC_BATCH))[HISTORY_DIAGNOSTIC_BATCH];
 if(saved!==undefined){run.disabled=true;report.textContent=JSON.stringify({state:'spent',report:validHistoryStructureReport(saved?.report)?saved.report:null});}
 run.addEventListener('click',async()=>{run.disabled=true;report.textContent='正在进行一次只读观察…';try{report.textContent=JSON.stringify(await runHistoryDiagnosticOnce({chrome,locks:navigator.locks}));}catch{report.textContent='诊断不可用；不自动重试。';}});
 }
}

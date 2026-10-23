import {HOST_CONFIG} from './config.mjs';
import {readActiveLocalStatus} from '../src/host/local-status.mjs';
const messages={ready:'本次检查：增强界面已连接。',dormant:'本次检查：增强界面已休眠，原生 ChatGPT 仍可使用。',connecting:'本次检查：正在连接工作空间，原生 ChatGPT 仍可使用。',waiting:'本次检查：暂时无法验证工作空间，正在等待新的上下文证据。原生 ChatGPT 仍可使用。','verification-required':'本次检查：服务端要求浏览器验证，增强界面已停止连接。请查看原生 ChatGPT 页面；若出现验证请手动完成，没有验证页则无需反复刷新。',unavailable:'本次检查：此标签页尚未接入增强界面。请确认这是受支持的 ChatGPT 页面；原生页面仍可使用。'};
const state=await readActiveLocalStatus({tabs:chrome.tabs});
document.getElementById('status').textContent=messages[state];

if(HOST_CONFIG.browserLocal){
 const note=document.createElement('p');note.className='note';note.textContent='即时层只显示本页已知导航。确认后，才读写你绑定的本地个人空间。这不是服务器身份认证：请确认当前账号及 Workspace 正确。同一页面内切换标签、普通操作和后台恢复无需重新确认。账户或空间切换风险会锁定旧数据。刷新和完整重启浏览器后先显示即时视图，恢复旧资料时再确认。';document.body.append(note);
 const result=document.createElement('p');result.setAttribute('role','status');document.body.append(result);
 const unlock=document.createElement('button');unlock.textContent='确认当前账号与 Workspace，解锁本地空间';document.body.append(unlock);
 const lock=document.createElement('button');lock.textContent='锁定本地空间';document.body.append(lock);
 const perform=async action=>{unlock.disabled=true;lock.disabled=true;try{const r=await chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action});result.textContent=r?.ok?(action==='unlock'?'本地空间已绑定到当前文档。':'旧数据已锁定；关闭面板后可继续即时查看。'):'未能绑定；原生页面与旧数据保持不变。';}catch{result.textContent='连接不可用，未解锁旧数据。';}finally{unlock.disabled=false;lock.disabled=false;}};
 unlock.addEventListener('click',()=>void perform('unlock'));lock.addEventListener('click',()=>void perform('lock'));
}

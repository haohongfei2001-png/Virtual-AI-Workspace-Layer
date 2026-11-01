import {localPanelActiveElement,localPanelOwnsFocus,focusLocalPanel} from './local-panel-focus.mjs';
import {exactHostRecord} from './contract.mjs';
const kinds=['workspace','native','evidence'];
const labels={workspace:'工作集与个人设置',native:'项目与聊天索引',evidence:'活跃度记录'};
const descriptions={workspace:'恢复已保存的工作集、人工名称和个人设置。',native:'恢复已保存的原生项目与聊天索引，不修改原生聊天。',evidence:'恢复已保存的活跃度记录，不重发消息或恢复已撤销的授权。'};
function plansOf(reply){
 if(!exactHostRecord(reply,['ok','plans'])||reply.ok!==true||!exactHostRecord(reply.plans,kinds))throw Error('invalid-recovery-status');
 const plans={};for(const kind of kinds){const p=reply.plans[kind];if(!exactHostRecord(p,Object.hasOwn(p??{},'planId')?['corrupt','recoverable','planId']:['corrupt','recoverable'])||typeof p.corrupt!=='boolean'||typeof p.recoverable!=='boolean'||(p.planId!==undefined&&p.planId!==null&&(typeof p.planId!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(p.planId)))||(p.recoverable&&(!p.corrupt||!p.planId))||(!p.recoverable&&p.planId!==undefined&&p.planId!==null))throw Error('invalid-recovery-plan');plans[kind]={...p};}return plans;
}
/** Frame-local explicit recovery controls. Request injection owns all authorization. */
export function createFreeFrameRecovery({document:doc,container,request,onResume}={}){
 if(!doc?.createElement||!container?.append||typeof request!=='function'||typeof onResume!=='function')throw Error('invalid-frame-recovery');
 let stopped=false,panel=null,generation=0,busy=false,plans=null,status='正在检查可恢复状态…',error=false,resumed=false,dirty=false;
 const element=(tag,text='',attrs={})=>{const n=doc.createElement(tag);n.textContent=text;for(const [key,value]of Object.entries(attrs))n.setAttribute(key,value);return n;};
 const active=run=>!stopped&&panel!==null&&generation===run;
 function releasePlans(value=plans){const planIds=[...new Set(kinds.map(kind=>value?.[kind]?.planId).filter(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id)))];if(planIds.length)try{Promise.resolve(request({v:1,type:'HOST_UI_RECOVERY_RELEASE',planIds})).catch(()=>{});}catch{}}
 function discardPlans(){releasePlans();plans=null;}
 function remove(){generation++;discardPlans();panel?.remove();panel=null;plans=null;busy=false;dirty=false;}
 function resume(){if(stopped||!panel||resumed)return;resumed=true;const restoreFocus=localPanelOwnsFocus(panel);remove();try{Promise.resolve(onResume({restoreFocus})).catch(()=>{});}catch{}}
 function button(label,callback,disabled=false){const n=element('button',label,{type:'button','data-panel-action':label});n.disabled=disabled;const run=generation;n.addEventListener('click',()=>{if(active(run)&&!n.disabled)callback();});return n;}
 function render(){if(stopped||!panel)return;const focused=localPanelOwnsFocus(panel),key=localPanelActiveElement(panel)?.getAttribute?.('data-panel-action');panel.replaceChildren();const heading=element('h2','恢复本地工作空间',{tabindex:'-1'});panel.append(heading,element('p','原生聊天仍可使用。修复仅在你点击后执行；未经核验的记录保持原样。'),element('p',status,{role:error?'alert':'status','aria-live':'polite'}));
  if(plans)for(const kind of kinds){const p=plans[kind],section=element('section','',{'aria-label':labels[kind]});section.append(element('h3',labels[kind]),element('p',descriptions[kind]),element('p',p.corrupt?(p.recoverable?'发现可用于恢复的本地记录。':'暂时无法安全修复，原记录已保留。'):'未发现损坏。'));if(p.corrupt&&p.recoverable)section.append(button('修复'+labels[kind],()=>{void repair(kind,p.planId);},busy));panel.append(section);}
  if(error)panel.append(button('重新检查',()=>{if(!busy)void inspect();},busy));panel.append(button('返回工作空间',resume));panel.setAttribute('aria-busy',String(busy));if(focused){const target=[...panel.querySelectorAll('[data-panel-action]')].find(n=>n.getAttribute('data-panel-action')===key&&!n.disabled);focusLocalPanel(panel,target??heading);}
 }
 async function inspect(followup=false){
  if(stopped||!panel||busy)return;const run=++generation;busy=true;dirty=false;error=false;discardPlans();status='正在检查可恢复状态…';render();
  try{const reply=await request({v:1,type:'HOST_UI_RECOVERY_STATUS'});if(!active(run)||dirty){releasePlans(reply?.plans);return;}try{plans=plansOf(reply);}catch(error){releasePlans(reply?.plans);throw error;}status='选择需要修复的本地记录。';}
  catch{if(active(run)&&!dirty){error=true;status='无法检查恢复状态，请重试。原记录已保留。';}}
  finally{if(active(run)){busy=false;if(dirty&&!followup){dirty=false;void inspect(true);}else{if(dirty){dirty=false;plans=null;error=true;status='恢复状态已变化，请重新检查。';}render();}}}
 }
 async function repair(kind,planId){if(stopped||!panel||busy||plans?.[kind]?.planId!==planId||!plans[kind].recoverable)return;const run=++generation;busy=true;dirty=false;error=false;status='正在修复'+labels[kind]+'…';render();try{const operationId=(doc.defaultView?.crypto??globalThis.crypto).randomUUID(),reply=await request({v:1,type:'HOST_UI_RECOVER',kind,planId,operationId});if(!active(run))return;if(!exactHostRecord(reply,['ok','kind'])||reply.ok!==true||reply.kind!==kind)throw Error('recovery-failed');resume();}catch{if(active(run)){error=true;status='修复结果未确认，请重新检查后重试。原生聊天仍可使用。';discardPlans();}}finally{if(active(run)){busy=false;if(dirty){dirty=false;void inspect(true);}else render();}}}
 function invalidate(){if(stopped||!panel)return;discardPlans();error=false;if(busy){dirty=true;render();}else void inspect();}
 function open(){if(stopped||panel)return;resumed=false;panel=element('section','',{'aria-label':'本地数据恢复'});container.append(panel);const work=inspect();focusLocalPanel(panel,panel.querySelector?.('h2'));return work;}
 function stop(){if(stopped)return;stopped=true;remove();}
 return Object.freeze({open,stop,invalidate});
}

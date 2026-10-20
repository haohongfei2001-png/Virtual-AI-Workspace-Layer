import {localPanelActiveElement,localPanelOwnsFocus,focusLocalPanel} from './local-panel-focus.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
// Every selector is restricted to this owned panel, including narrow frame layouts.
const panelStyle=`
[data-vaiwl-snippets]{box-sizing:border-box;font:calc(14px * var(--vaiwl-font-scale,1))/1.5 var(--vaiwl-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif);color:var(--ink,#202123);background:var(--surface,#fff);padding:16px;max-width:780px;margin:0 auto;overflow-wrap:anywhere}
[data-vaiwl-snippets] h2{font-size:calc(15px * var(--vaiwl-font-scale,1));font-weight:600;margin:0 0 12px}
[data-vaiwl-snippets] h3{font-size:calc(14px * var(--vaiwl-font-scale,1));font-weight:550;margin:0 0 6px}
[data-vaiwl-snippets] p{margin:8px 0 12px;color:var(--muted,#646464);white-space:pre-wrap}
[data-vaiwl-snippets] [data-snippet-row]{border:1px solid var(--line,#e5e5e5);border-radius:13px;padding:12px;margin:12px 0;min-width:0}
[data-vaiwl-snippets] button,[data-vaiwl-snippets] a{box-sizing:border-box;display:inline-block;font:inherit;color:inherit;background:var(--bubble,#f4f4f4);border:1px solid var(--line,#e5e5e5);border-radius:8px;padding:6px 10px;min-height:34px;margin:2px 6px 2px 0;text-decoration:none;cursor:pointer;max-width:100%;overflow-wrap:anywhere}
[data-vaiwl-snippets] button:hover,[data-vaiwl-snippets] a:hover{background:var(--hover,#eee)}
[data-vaiwl-snippets] button:focus-visible,[data-vaiwl-snippets] a:focus-visible{outline:2px solid var(--focus,#3877ba);outline-offset:2px}
[data-vaiwl-snippets] button:disabled,[data-vaiwl-snippets] button[aria-disabled="true"]{opacity:.4;cursor:default}
@media(max-width:360px){[data-vaiwl-snippets]{padding:10px}[data-vaiwl-snippets] [data-snippet-row]{padding:10px}}
`;
/** Explicit frame-local controls; request owns authorization and native capture. */
export function createFreeFrameSnippets({document:doc,container,request,currentRef,onClose,parentOrigin}={}){
 const policy=createURLPolicy({origin:parentOrigin});
 if(!doc?.createElement||!container?.append||typeof request!=='function'||typeof onClose!=='function')throw Error('invalid-frame-snippets');
 let panel=null,stopped=false,generation=0,busy=false,page=null,revision=null,offset=0,status='',error=false,dirty=false,actionFailure='',failureAction=null;
 const el=(tag,text='',attrs={})=>{const n=doc.createElement(tag);n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const live=run=>!stopped&&panel&&run===generation;
 const target=(id,url)=>{const p=policy.parse(url);return p.kind==='conversation'&&p.conversationId===id?p.navigationURL:null;};
 const current=()=>{const r=typeof currentRef==='function'?currentRef():currentRef;return r&&tokenOK(r.id)&&target(r.id,r.nativeUrl)?r:null;};
 function close(){if(!panel)return;const restoreFocus=localPanelOwnsFocus(panel);actionFailure='';generation++;panel.remove();panel=null;page=null;revision=null;busy=false;try{onClose({restoreFocus});}catch{}}
 function button(label,fn,disabled=false,key=label,pending=false){const n=el('button',label,{type:'button','data-panel-action':key}),run=generation;n.disabled=disabled;if(pending)n.setAttribute('aria-disabled','true');n.addEventListener('click',()=>{if(live(run)&&!n.disabled&&!pending)fn();});return n;}
 function render(){if(!panel||stopped)return;const focused=localPanelOwnsFocus(panel),focusKey=localPanelActiveElement(panel)?.getAttribute?.('data-panel-action');panel.replaceChildren(el('style',panelStyle));panel.setAttribute('aria-busy',String(busy));const heading=el('h2','已保存片段',{tabindex:'-1'});panel.append(heading,el('p','仅保存你明确选择的片段，不会自动收集聊天正文。'),button('保存当前选区',()=>void action('save',current()?.id),busy||revision===null||!current()),el('p',status,{role:error?'alert':'status','aria-live':'polite'}));
  if(actionFailure&&status!==actionFailure)panel.append(el('p',actionFailure,{role:'alert','aria-live':'polite'}));
  if(page){for(const item of page.items){const row=el('section','',{'aria-label':'已保存片段','data-snippet-row':''});row.append(el('h3',item.title??'原聊天'),el('p',item.preview));const href=target(item.refId,item.nativeUrl);if(current()?.id===item.refId)row.append(button('定位片段',()=>void action('locate',item.id),busy,'locate:'+item.id));else if(href)row.append(el('a','打开原聊天',{href,target:'_blank',rel:'noopener noreferrer','data-panel-action':'open:'+item.id}));row.append(button('删除片段',()=>void action('remove',item.id),busy,'remove:'+item.id));panel.append(row);}panel.append(el('p',`共 ${page.total} 个片段`),button('上一页',()=>void read(Math.max(0,offset-12)),offset===0,'上一页',busy),button('下一页',()=>void read(offset+12),offset+page.items.length>=page.total,'下一页',busy));}
  if(error)panel.append(button('重新加载',()=>void read(offset),busy));panel.append(button('返回工作空间',close));if(focused){const target=[...panel.querySelectorAll('[data-panel-action]')].find(n=>n.getAttribute('data-panel-action')===focusKey&&!n.disabled);focusLocalPanel(panel,target??heading);}
 }
 function validate(reply,wanted){if(!exactHostRecord(reply,['ok','workspaceRevision','snippets'])||reply.ok!==true||!Number.isSafeInteger(reply.workspaceRevision)||reply.workspaceRevision<0)throw Error();const p=reply.snippets;if(!exactHostRecord(p,['total','offset','limit','items'])||!Number.isSafeInteger(p.total)||p.total<0||p.total>100||p.offset!==wanted||p.limit!==12||!Array.isArray(p.items)||p.items.length>12||p.items.length!==Math.min(12,Math.max(0,p.total-wanted)))throw Error();const ids=new Set();for(const r of p.items){if(!exactHostRecord(r,['id','refId','preview','title','nativeUrl'])||!tokenOK(r.id)||!tokenOK(r.refId)||ids.has(r.id)||typeof r.preview!=='string'||r.preview.length>160||r.title!==null&&(typeof r.title!=='string'||r.title.length>512)||r.nativeUrl!==null&&(typeof r.nativeUrl!=='string'||!target(r.refId,r.nativeUrl)))throw Error();ids.add(r.id);}return p;}
 async function read(next=offset,retries=1){if(stopped||!panel||busy)return;const run=++generation;busy=true;dirty=false;error=false;status='正在读取片段…';render();try{const reply=await request({type:'HOST_UI_SNIPPET_LIST',offset:next,limit:12});if(!live(run)||dirty)return;const fresh=validate(reply,next);if(next>0&&next>=fresh.total){page=null;revision=null;offset=next;
   // Share the existing single follow-up allowance with invalidation refreshes.
   // Only a freshly validated total may relocate the page; never replay actions.
   if(retries>0){busy=false;await read(fresh.total?Math.floor((fresh.total-1)/12)*12:0,retries-1);return;}
   page=null;revision=null;offset=next;error=true;status='片段列表已变化，请重新加载。';return;
  }page=fresh;revision=reply.workspaceRevision;offset=next;status=page.total?'选择片段以定位或打开原聊天。':'暂无已保存片段。';}catch{if(live(run)){error=true;status='无法读取片段，请重试。';}}finally{if(live(run)){busy=false;if(dirty){dirty=false;if(retries>0){await read(next,retries-1);return;}error=true;status='片段列表已变化，请重新加载。';}render();}}}
 async function action(kind,id){if(stopped||!panel||busy||revision===null||!tokenOK(id)||kind==='save'&&current()?.id!==id)return;const run=++generation,nextOffset=kind==='remove'&&page?.items.length===1?Math.max(0,offset-12):offset;busy=true;error=false;status='正在处理…';render();try{const reply=await request({type:'HOST_UI_SNIPPET',operationId:(doc.defaultView?.crypto??globalThis.crypto).randomUUID(),expectedRevision:revision,action:kind,id});if(!live(run))return;if(reply?.ok!==true)throw Error();if(failureAction?.kind===kind&&failureAction?.id===id){actionFailure='';failureAction=null;}busy=false;const changed=dirty;dirty=false;if(kind==='locate'&&!changed){status='已定位片段。';render();}else await read(nextOffset);}catch{if(live(run)){error=true;status=kind==='save'?'保存结果未确认，请重新选中文本后重试。':'操作结果未确认，可使用原生搜索查找片段。';actionFailure=status;failureAction={kind,id};}}finally{if(live(run)){busy=false;render();}}}
 function invalidate(){if(stopped||!panel)return;page=null;revision=null;if(busy){dirty=true;render();return;}generation++;void read(offset);}
 function open(){if(stopped||panel)return;panel=el('section','',{'aria-label':'片段管理','data-vaiwl-snippets':''});container.append(panel);const work=read(0);focusLocalPanel(panel,panel.querySelector?.('h2'));return work;}
 function stop(){if(stopped)return;stopped=true;generation++;panel?.remove();panel=null;page=null;revision=null;busy=false;}
 return Object.freeze({open,stop,invalidate});
}

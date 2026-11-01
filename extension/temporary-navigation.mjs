import {css} from '../src/navigation/styles.mjs';
import {createURLPolicy} from '../src/host/url-policy.mjs';
import {HOST_CONFIG} from './config.mjs';
import {withRequestDeadline} from '../src/data/request-deadline.mjs';
if(HOST_CONFIG.temporaryReadOnly!==true)throw Error('temporary-mode-not-enabled');
document.title='VAIWL 临时只读导航';
// Give Chrome an intrinsic popup size; only its inner scroller follows the
// allocated viewport. A 90vh preferred height recursively shrinks native popups.
// Chrome autosize reserves a root scrollbar when the preferred height exceeds
// available screen space, even with overflow:hidden. Only the shadow workspace
// contains scrollable content; retain its scrollbar and suppress the empty root's.
document.documentElement.style.scrollbarWidth='none';
const root=document.createElement('div'),shadow=root.attachShadow({mode:'open'});document.body.replaceChildren(root);document.body.style.cssText='margin:0;width:570px;height:550px;overflow:hidden;padding:0';
// Same palette as the existing Free frame shell, without importing its layout
// rules. This private popup follows browser appearance, not account/page data.
const palette=`
:host{--ink:#202123;--surface:#fff;--bubble:#f4f4f4;--line:#e5e5e5;--muted:#646464;--hover:#eee;--focus:#3877ba}
@media(prefers-color-scheme:dark){:host{--ink:#ececec;--surface:#212121;--bubble:#2f2f2f;--line:#424242;--muted:#b4b4b4;--hover:#383838;--focus:#8ab4f8}}
input::placeholder{color:var(--muted);opacity:1}
`;
const style=document.createElement('style');style.textContent=css+palette+'\n:host{display:block;position:fixed;inset:0;width:100vw;height:100vh;font:14px/1.5 system-ui;color:var(--ink);background:var(--surface)}.workspace{height:100%;padding:20px;overscroll-behavior:contain}.cards{grid-template-columns:1fr;gap:10px}.toolbar{padding:0 0 12px}.notice{font-size:12px;color:var(--muted,#6e6e76)}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #8885;border-radius:9px;background:var(--surface);color:var(--ink)}.row{white-space:normal;overflow-wrap:anywhere}.card h2{margin:0 0 8px}';shadow.append(style);
const el=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
const main=el('main','','workspace'),heading=el('h1','临时只读导航'),notice=el('p','仅当前页面已显示的原生链接；账户、项目成员和活动未核验。关闭此弹窗即丢弃列表。','notice'),detail=el('p','在新标签打开，保留原页与输入。再次点击扩展图标返回列表。未加载历史、片段、工作集与恢复功能不可用。','notice'),input=el('input'),status=el('p','正在读取当前页…','notice'),refresh=el('button','重新读取当前页','more'),lists=el('section','','cards');input.type='search';input.placeholder='搜索本次列表';input.setAttribute('aria-label','搜索本次列表');heading.style.fontSize='18px';main.append(heading,notice,detail,input,status,refresh,lists);shadow.append(main);
let rows=[],tabId=null,serial=0,closed=false;
const policy=createURLPolicy({origin:HOST_CONFIG.origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}});
function clear(message){serial++;rows=[];input.value='';lists.replaceChildren();status.textContent=message;refresh.disabled=false;}
function render(){lists.replaceChildren();const q=input.value.trim().toLocaleLowerCase();for(const [kind,label]of [['project','原生项目链接'],['conversation','原生聊天链接（归属未核验）']]){const section=el('section','','card');section.append(el('h2',label));const filtered=rows.filter(r=>r.kind===kind&&r.title.toLocaleLowerCase().includes(q));for(const row of filtered){const a=el('a',row.title,'row');a.href=row.href;a.target='_blank';a.rel='noopener noreferrer';section.append(a);}if(!filtered.length)section.append(el('p','本次列表中没有匹配条目。','notice'));lists.append(section);}}
async function load(){clear('正在读取当前页…');const run=serial,started=performance.now();refresh.disabled=true;
 // Every API phase belongs to this read and its original total budget. A timed
 // out Chrome promise cannot be cancelled, so fence its late continuation too.
 const current=()=>{if(closed||run!==serial||performance.now()-started>=1000)throw Error('temporary-read-expired');};
 try{await withRequestDeadline(async()=>{current();const tabs=await chrome.tabs.query({active:true,currentWindow:true});current();if(tabs.length!==1||!Number.isSafeInteger(tabs[0].id))throw Error();tabId=tabs[0].id;const before=await chrome.webNavigation.getFrame({tabId,frameId:0});current();
 const value=await chrome.tabs.sendMessage(tabId,{v:1,type:'HOST_TEMPORARY_NATIVE_LIST'},{frameId:0});current();
 const after=await chrome.webNavigation.getFrame({tabId,frameId:0});current();
 if(!before?.documentId||before.documentId!==after?.documentId||before.url!==after.url||!value||Object.keys(value).sort().join(',')!=='items,mode,partial,route,v'||value.v!==1||value.mode!=='temporary-native-navigation'||value.route!==after.url||new URL(after.url).origin!==HOST_CONFIG.origin||!Array.isArray(value.items)||value.items.length>256||typeof value.partial!=='boolean'||new TextEncoder().encode(JSON.stringify(value)).length>65536)throw Error();
 const seen=new Set();for(const r of value.items){if(!r||Object.keys(r).sort().join(',')!=='href,kind,title'||!['project','conversation'].includes(r.kind)||typeof r.title!=='string'||!r.title.length||r.title.length>2048||typeof r.href!=='string'||policy.nativeHref(r.href)!==r.href||policy.parse(r.href).kind!==r.kind||new URL(r.href).origin!==HOST_CONFIG.origin||seen.has(r.href))throw Error();seen.add(r.href);}
 current();rows=value.items;status.textContent=value.partial?'本次仅显示有界部分条目；可使用原生导航查看其余内容。':'本次读取 '+rows.length+' 条原生链接；不代表完整历史。';render();
 },{timeoutMs:1000});}catch{if(!closed&&run===serial)clear('当前页面未提供可读取的导航列表。请使用原生界面。');}finally{if(!closed&&run===serial)refresh.disabled=false;}}
input.addEventListener('input',render);refresh.addEventListener('click',load);
const invalidate=(details)=>{if(details.tabId===tabId&&details.frameId===0)clear('原生页面已变化，旧列表已清除。可重新读取当前页。');};
const message=(m,s)=>{if(m?.v===1&&m.type==='HOST_TEMPORARY_NATIVE_INVALIDATED'&&Object.keys(m).length===2&&s.id===chrome.runtime.id&&s.tab?.id===tabId&&s.frameId===0)clear('原生导航已变化，旧列表已清除。可重新读取当前页。');};
chrome.webNavigation.onCommitted.addListener(invalidate);chrome.webNavigation.onHistoryStateUpdated.addListener(invalidate);chrome.runtime.onMessage.addListener(message);
window.addEventListener('pagehide',()=>{closed=true;clear('');chrome.webNavigation.onCommitted.removeListener(invalidate);chrome.webNavigation.onHistoryStateUpdated.removeListener(invalidate);chrome.runtime.onMessage.removeListener(message);});
void load();

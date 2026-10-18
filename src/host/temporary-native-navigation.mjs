import {CHATGPT_SIDEBAR_SELECTOR} from './native-surface-boundary.mjs';
import {createURLPolicy} from './url-policy.mjs';
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
/** Unauthenticated DOM navigation snapshot. Never a scope, membership or persistence source. */
export function installTemporaryNativeNavigation({document:doc,runtime,origin,profile}){
 if(doc.defaultView!==doc.defaultView.top||doc.location.origin!==origin)throw Error('invalid-temporary-document');
 const win=doc.defaultView,policy=createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}});
 const sidebarSelector=profile.id==='chatgpt-zh-desktop-observed-20261018'?CHATGPT_SIDEBAR_SELECTOR:profile.id==='chatgpt-legacy-reconstruction'&&new URL(origin).hostname==='127.0.0.1'?'body > aside[aria-label="Sidebar"]':null;
 const excluded='main,[data-app-action-timeline-scroll],[data-thread-scroll-footer],[contenteditable],dialog';
 let stopped=false,subscribed=false,roots=[],sidebar=null;
 const visible=node=>{if(!node.isConnected||node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})===false||!node.getClientRects().length)return false;let depth=0;for(let n=node;n;n=n.parentElement){if(++depth>64||n.hidden||n.getAttribute('aria-hidden')==='true')return false;const s=win.getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')return false;}return true;};
 const visibleSidebars=()=>sidebarSelector?[...doc.querySelectorAll(sidebarSelector)].filter(n=>!n.closest(excluded)&&visible(n)):[];
 const invalidate=()=>{if(!subscribed||stopped)return;subscribed=false;Promise.resolve(runtime.sendMessage({v:1,type:'HOST_TEMPORARY_NATIVE_INVALIDATED'})).catch(()=>{});};
 // Watch the verified sidebar too: an empty snapshot has no nav roots yet, and
 // a disclosure can add a sibling nav without touching any previously read root.
 const observer=new win.MutationObserver(records=>{
  if(!subscribed||stopped)return;
  // Desktop and narrow-window sidebars are siblings. Their visibility can
  // change outside the selected root; recheck only these explicit boundaries,
  // without reading any link text, before keeping the previous snapshot usable.
  try{const current=visibleSidebars();if(current.length!==1||current[0]!==sidebar){invalidate();return;}}catch{invalidate();return;}
  if(records.some(r=>[sidebar,...roots].filter(Boolean).some(root=>root===r.target||root.contains?.(r.target)||r.type==='attributes'&&r.target.contains?.(root)||[...r.removedNodes].some(n=>n===root||n.contains?.(root)))))invalidate();
 });
 // Native disclosure/style state can use open, ARIA or data attributes. Filtering
 // attribute names would miss CSS visibility changes; region checks stay narrow.
 observer.observe(doc.documentElement,{childList:true,subtree:true,characterData:true,attributes:true});
 const scan=()=>{
  const route=doc.location.href,items=new Map(),conflicts=new Set();let partial=false,bytes=0,inspected=0;
  subscribed=false;sidebar=null;roots=[];
  if(!sidebarSelector)throw Error('unsupported-temporary-sidebar');
  const sidebars=visibleSidebars();
  if(sidebars.length!==1)throw Error('ambiguous-temporary-sidebar');
  sidebar=sidebars[0];
  roots=[...new Set([profile.regions.projects,profile.regions.history].flatMap(selector=>[...sidebar.querySelectorAll(selector)]))].filter(n=>!n.closest(excluded));
  for(const root of roots)for(const node of root.querySelectorAll('a[href]')){
   if(++inspected>2048){partial=true;break;}if(node.closest(excluded)||!visible(node))continue;
   const parsed=policy.parse(node.getAttribute('href'));if(!['project','conversation'].includes(parsed.kind))continue;
   const href=policy.nativeHref(node.getAttribute('href'));if(!href||new URL(href).origin!==origin)continue;
   const title=(node.innerText??'').trim();if(!title||title.length>2048){partial=true;continue;}
   const key=parsed.kind+':'+(parsed.projectId??parsed.conversationId);if(conflicts.has(key))continue;
   if(items.has(key)){if(items.get(key).title!==title){items.delete(key);conflicts.add(key);partial=true;}continue;}
   const row={kind:parsed.kind,title,href},size=new TextEncoder().encode(JSON.stringify(row)).length;
   if(items.size>=256||bytes+size>49152){partial=true;continue;}items.set(key,row);bytes+=size;
  }
  if(doc.location.href!==route)throw Error('temporary-route-changed');subscribed=true;
  return {v:1,mode:'temporary-native-navigation',route,items:[...items.values()],partial};
 };
 const listener=(message,sender,reply)=>{
  if(stopped||!exact(message,['v','type'])||message.v!==1||message.type!=='HOST_TEMPORARY_NATIVE_LIST'||sender?.id!==runtime.id||sender.url!==runtime.getURL('status.html')||sender.tab!==undefined)return;
  observer.takeRecords();try{reply(scan());}catch{reply({v:1,mode:'temporary-native-navigation',unavailable:true});}
 };
 runtime.onMessage.addListener(listener);win.addEventListener('pagehide',invalidate);win.addEventListener('resize',invalidate);doc.addEventListener('visibilitychange',invalidate);
 return ()=>{if(stopped)return;invalidate();stopped=true;observer.disconnect();runtime.onMessage.removeListener(listener);win.removeEventListener('pagehide',invalidate);win.removeEventListener('resize',invalidate);doc.removeEventListener('visibilitychange',invalidate);roots=[];sidebar=null;};
}

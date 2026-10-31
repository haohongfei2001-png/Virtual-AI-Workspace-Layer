import {createURLPolicy} from './url-policy.mjs';

/** Presentation intent only. Native expanded state by itself is not a user
 * request, membership evidence, navigation authority or permission to hide DOM.
 * Only a trusted activation of an explicit native disclosure can arm a panel.
 */
export function observeNativeProjectManagement({document:doc,root,isCurrent=()=>true,onChanged=()=>{}}){
 const policy=createURLPolicy({origin:doc.location.origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}});
 const armed=new Map(),geometryNodes=new Set();let pending=null,stopped=false,last='[]',geometryFrame=null,geometryObserver=null;
 const visible=(node,geometry=null)=>{
  geometry?.add(node);
  const box=node.getBoundingClientRect();let area={left:box.left,right:box.right,top:box.top,bottom:box.bottom};
  if(![area.left,area.right,area.top,area.bottom].every(Number.isFinite)||box.width<=0||box.height<=0)return false;
  for(let n=node,depth=0;n;n=n.parentElement){
   geometry?.add(n);
   if(++depth>64||n.hidden||n.inert||n.getAttribute('aria-hidden')==='true')return false;
   const s=doc.defaultView.getComputedStyle(n);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)return false;
   if(n!==node){const r=n.getBoundingClientRect();if(['hidden','clip','auto','scroll'].includes(s.overflowX)){area.left=Math.max(area.left,r.left);area.right=Math.min(area.right,r.right);}if(['hidden','clip','auto','scroll'].includes(s.overflowY)){area.top=Math.max(area.top,r.top);area.bottom=Math.min(area.bottom,r.bottom);}if(area.right<=area.left||area.bottom<=area.top)return false;}
   // Do not clip against the outer NAV viewport: scrolling is not management exit.
   if(n===root)return true;
  }return false;
 };
 function descriptor(button,requireVisible=true){
  if(!root?.isConnected||!root.contains(button)||!button.matches('button[aria-controls][aria-expanded]')||requireVisible&&!visible(button))return null;
  const id=button.getAttribute('aria-controls');if(!id||id.length>128||/\s/.test(id))return null;
  const panels=[...doc.querySelectorAll('#'+doc.defaultView.CSS.escape(id))];if(panels.length!==1)return null;const panel=panels[0];
  if(!root.contains(panel)||panel.contains(button))return null;
  for(let row=button.parentElement,depth=0;row&&root.contains(row)&&depth<3;row=row.parentElement,depth++){
   const links=[...row.querySelectorAll('a[href]')].filter(n=>!panel.contains(n));if(links.length>32)return null;
   const projects=new Set(links.map(n=>policy.parse(n.href)).filter(p=>p.kind==='project').map(p=>p.projectId));
   if(projects.size===1)return {button,panel,projectId:[...projects][0]};if(projects.size>1)return null;
  }return null;
 }
 function watchGeometry(next){
  if(!geometryObserver)return;
  for(const node of geometryNodes)if(!next.has(node)){geometryObserver.unobserve(node);geometryNodes.delete(node);}
  for(const node of next)if(!geometryNodes.has(node)){geometryNodes.add(node);geometryObserver.observe(node);}
 }
 function snapshot(){
  if(stopped||!isCurrent()||!root?.isConnected){armed.clear();pending=null;watchGeometry(new Set());return [];}
  advancePending();
  const result=[],geometry=new Set();
  if(pending){visible(pending.button,geometry);visible(pending.panel,geometry);}
  for(const [button,entry]of armed){const fresh=descriptor(button,false);if(!fresh||fresh.panel!==entry.panel||fresh.projectId!==entry.projectId||button.getAttribute('aria-expanded')!=='true'){armed.delete(button);continue;}
   // Temporary clipping or native interactivity does not undo the user's
   // expansion. Suppression requires fresh visibility on every read; a
   // collapsed/replaced disclosure or lost document binding retires intent.
   const buttonVisible=visible(button,geometry),panelVisible=visible(entry.panel,geometry);if(!buttonVisible||!panelVisible)continue;
   const links=[...entry.panel.querySelectorAll('a[href]')];if(links.length>200)continue;
   const refIds=[];for(const link of links){if(!visible(link,geometry))continue;const parsed=policy.parse(link.href);if(parsed.kind==='conversation'&&!refIds.includes(parsed.conversationId))refIds.push(parsed.conversationId);}
   result.push({projectId:entry.projectId,refIds});if(result.length>=32)break;
  }watchGeometry(geometry);return result;
 }
 function changed(){const value=snapshot(),key=JSON.stringify(value);if(key!==last){last=key;onChanged();}}
 function advancePending(){
  if(!pending)return;
  const entry=pending,fresh=descriptor(entry.button,false),age=doc.defaultView.performance.now()-entry.at,expanded=entry.button.getAttribute('aria-expanded');
  if(!Number.isFinite(age)||age<0||age>=6000||!fresh||fresh.panel!==entry.panel||fresh.projectId!==entry.projectId||!['false','true'].includes(expanded)||expanded==='false'&&entry.opened){pending=null;return;}
  if(expanded==='true'){
   entry.opened=true;
   if(visible(entry.button)&&visible(entry.panel)){armed.set(entry.button,entry);pending=null;}
  }
 }
 const click=e=>{if(!e.isTrusted||stopped||!isCurrent())return;pending=null;const button=e.target?.closest?.('button[aria-controls][aria-expanded]');const entry=button&&descriptor(button);if(!entry)return;
  // Capture phase sees the old state. A later real false->true mutation must
  // establish the expansion. Ordinary member clicks cannot arm this mode.
  pending=null;if(button.getAttribute('aria-expanded')==='false')pending={...entry,at:doc.defaultView.performance.now(),opened:false};else armed.delete(button);changed();
 };
 // Scroll and responsive clipping change visible duplicates without a DOM
 // mutation. Watch only geometry already examined for trusted pending/armed
 // panels; never create or extend management intent or poll the page.
 // The outer NAV viewport does not clip this presentation contract.
 const geometryChanged=()=>{if(stopped||geometryFrame!==null)return;geometryFrame=doc.defaultView.requestAnimationFrame(()=>{geometryFrame=null;if(!stopped)changed();});};
 if(doc.defaultView.ResizeObserver)geometryObserver=new doc.defaultView.ResizeObserver(geometryChanged);
 const cancelPending=e=>{if(e.isTrusted)pending=null;};
 root?.addEventListener('click',click,true);root?.addEventListener('pointerdown',cancelPending,true);root?.addEventListener('scroll',geometryChanged,true);
 doc.defaultView.addEventListener('resize',geometryChanged);
 const observer=new doc.defaultView.MutationObserver(changed);if(root)observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-expanded','aria-controls','hidden','aria-hidden','inert','class','style','href','id']});
 return {read:snapshot,stop(){stopped=true;pending=null;if(geometryFrame!==null)doc.defaultView.cancelAnimationFrame(geometryFrame);geometryFrame=null;armed.clear();observer.disconnect();geometryObserver?.disconnect();geometryNodes.clear();doc.defaultView.removeEventListener('resize',geometryChanged);root?.removeEventListener('click',click,true);root?.removeEventListener('pointerdown',cancelPending,true);root?.removeEventListener('scroll',geometryChanged,true);}};
}

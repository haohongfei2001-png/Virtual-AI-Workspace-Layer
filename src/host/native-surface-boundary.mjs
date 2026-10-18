// Observed navigation boundaries only. A visible sidebar never supplies scope,
// Project membership or native identity; the caller still validates each item.
export const CHATGPT_SIDEBAR_SELECTOR='aside[data-app-shell-left-panel-appearance] [data-sidebar-navigation-root] [data-slate-sidebar-content], div[role="dialog"][aria-modal="true"][data-state="open"] [data-sidebar-navigation-root]';
const excluded='main,[data-app-action-timeline-scroll],[data-thread-scroll-footer],[contenteditable],dialog,[data-va-owned],[data-vaiwl-owned]';
export function profileElement(document,profile,selector){
 try{
  let root=document;
  if(profile.sidebarBoundary&&[profile.regions?.projects,profile.regions?.history,profile.nativeLayout?.historyList].includes(selector)){
   const candidates=document.querySelectorAll(profile.sidebarBoundary);
   if(candidates.length>8)return null;
   const visible=[...candidates].filter(node=>{
    if(!node.isConnected||node.ownerDocument!==document||node.closest(excluded)||node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})===false||!node.getClientRects().length)return false;
    let depth=0;
    for(let parent=node;parent;parent=parent.parentElement){
     if(++depth>64||parent.hidden||parent.getAttribute('aria-hidden')==='true')return false;
     const style=document.defaultView.getComputedStyle(parent);
     if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false;
    }
    return true;
   });
   if(visible.length!==1)return null;
   root=visible[0];
  }
  const nodes=root.querySelectorAll(selector);
  return nodes.length===1?nodes[0]:null;
 }catch{return null;}
}

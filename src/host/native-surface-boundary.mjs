// Observed navigation boundaries only. A visible sidebar never supplies scope,
// Project membership or native identity; the caller still validates each item.
export const CHATGPT_SIDEBAR_SELECTOR='aside[data-app-shell-left-panel-appearance] [data-sidebar-navigation-root] [data-slate-sidebar-content], div[role="dialog"][aria-modal="true"][data-state="open"] [data-sidebar-navigation-root]';
const projectExcluded='[contenteditable],dialog,[data-thread-scroll-footer],[data-app-action-timeline-scroll],[data-va-owned],[data-vaiwl-owned]';
const excluded='main,[data-app-action-timeline-scroll],[data-thread-scroll-footer],[contenteditable],dialog,[data-va-owned],[data-vaiwl-owned]';
const visible=(document,node)=>{
 if(!node?.isConnected||node.ownerDocument!==document||node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})===false||!node.getClientRects().length)return false;
 let depth=0;for(let parent=node;parent;parent=parent.parentElement){
  if(++depth>64||parent.hidden||parent.getAttribute('aria-hidden')==='true')return false;
  const style=document.defaultView.getComputedStyle(parent);
  if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false;
 }return true;
};
const oneVisible=(document,root,selector,exclude=null)=>{const nodes=root.querySelectorAll(selector);if(nodes.length>8)return null;const found=[...nodes].filter(node=>visible(document,node)&&(!exclude||!node.closest(exclude)));return found.length===1?found[0]:null;};
export function profileElement(document,profile,selector,route=null){
 try{
  let root=document;
  if(profile.sidebarBoundary&&[profile.regions?.projects,profile.regions?.history,profile.nativeLayout?.historyList].includes(selector)){
   const selected=oneVisible(document,document,profile.sidebarBoundary,excluded);
   if(!selected||selected.closest(excluded))return null;
   root=selected;
  }
  if(profile.projectListBoundary&&selector===profile.regions?.members){
   // Route controls observation only. This list supplies no Project identity,
   // membership, completeness, current-context or principal evidence.
   if(route?.kind!=='project')return null;
   const selected=oneVisible(document,document,profile.projectListBoundary);
   if(!selected||selected.closest(projectExcluded))return null;
   return oneVisible(document,selected,selector,projectExcluded);
  }
  const nodes=root.querySelectorAll(selector);
  return nodes.length===1?nodes[0]:null;
 }catch{return null;}
}

// This observed native row has two separate text fields. Read only the first
// text-only DIV; missing/hidden/changed structure never falls back to preview.
export function observedProjectListTitle(document,node,root){
 try{
  if(node.closest(projectExcluded)||node.tagName!=='A'||node.parentElement?.tagName!=='LI'||node.parentElement.parentElement?.tagName!=='OL'||node.parentElement.parentElement.parentElement?.tagName!=='SECTION'||node.parentElement.parentElement.parentElement.parentElement!==root||node.children.length!==1)return null;
  const wrapper=node.firstElementChild;if(wrapper.tagName!=='DIV'||wrapper.children.length!==2)return null;
  const leaf=wrapper.firstElementChild;
  if(leaf.closest(projectExcluded)||leaf.tagName!=='DIV'||wrapper.lastElementChild.tagName!=='DIV'||leaf.children.length||!visible(document,leaf))return null;
  const text=(leaf.textContent??'').trim();return text&&text.length<=200?{nativeTitle:text,titleState:'exact'}:null;
 }catch{return null;}
}

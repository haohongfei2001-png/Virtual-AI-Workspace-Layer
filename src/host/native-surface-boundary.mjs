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
   const original=document.querySelectorAll(profile.sidebarBoundary);
   // Chat pages may omit the home-only wrapper. Admit only the same visible
   // native navigation with the already-observed conversation-row grammar;
   // an existing hidden/ambiguous wrapper never triggers this fallback.
   const selected=original.length===0&&profile.sidebarBoundaryFallback?oneVisible(document,document,profile.sidebarBoundaryFallback,excluded):oneVisible(document,document,profile.sidebarBoundary,excluded);
   if(!selected||selected.closest(excluded))return null;
   root=selected;
   if(root.matches(selector))return root;
  }
  if(profile.projectListBoundary&&selector===profile.regions?.members){
   // Route selects a candidate region only. A separate relationship witness
   // is required for membership; this never supplies scope or completeness.
   if(route?.kind!=='project')return null;
   const selected=oneVisible(document,document,profile.projectListBoundary);
   if(!selected||selected.closest(projectExcluded))return null;
   return oneVisible(document,selected,selector,projectExcluded);
  }
  // Native SPA routing retains hidden prior surfaces. They are not current
  // layout targets. Require exactly one visible candidate; never take the first
  // match or treat an invisible cached node as a usable return region.
  if(profile.visibleLayoutBoundary===true&&['nativeLayout','nativeHomeLayout'].some(name=>['header','navigationSlot','returnHitRoot'].some(key=>profile[name]?.[key]===selector)))return oneVisible(document,root,selector);
  const nodes=root.querySelectorAll(selector);
  return nodes.length===1?nodes[0]:null;
 }catch{return null;}
}

// This observed native row has two separate text fields. Read only the first
// text-only DIV; missing/hidden/changed structure never falls back to preview.
export function observedProjectListTitle(document,node,root,onReject=()=>{}){
 let stage=1;try{
  if(node.closest(projectExcluded)||node.tagName!=='A'||node.parentElement?.tagName!=='LI'||node.parentElement.parentElement?.tagName!=='OL'||node.parentElement.parentElement.parentElement?.tagName!=='SECTION'||node.parentElement.parentElement.parentElement.parentElement!==root||node.children.length!==1){onReject(stage);return null;}
  stage=2;const wrapper=node.firstElementChild;if(wrapper.tagName!=='DIV'||wrapper.children.length!==2){onReject(stage);return null;}
  stage=3;const leaf=wrapper.firstElementChild;
  if(leaf.closest(projectExcluded)||leaf.tagName!=='DIV'||wrapper.lastElementChild.tagName!=='DIV'||leaf.children.length){onReject(stage);return null;}
  stage=4;if(!visible(document,leaf)){onReject(stage);return null;}
  stage=5;const text=(leaf.textContent??'').trim();if(!text||text.length>200){onReject(stage);return null;}return {nativeTitle:text,titleState:'exact'};
 }catch{onReject(6);return null;}
}

// A bounded relationship witness inside the observed Project panel. Neither
// the route nor its title alone associates a stale panel with the current P.
// At least one actual member link must repeat that P; conflicting containers,
// ambiguous/hidden panels and non-chat tabs leave all membership UNKNOWN.
// This is a DOM proposal, never an account/Workspace or C2 receipt.
export function observedProjectAssociation(document,profile,urlPolicy,root){
 try{
  if(profile.memberAssociation!=='route-linked-project-panel-v1')return null;
  const route=urlPolicy.parse(document.location.href);
  if(route.kind!=='project'||profileElement(document,profile,profile.regions.members,route)!==root||!visible(document,root))return null;
  const main=root.closest(profile.projectListBoundary),titles=main?.querySelectorAll('h1 > button');
  if(!main||main.closest(projectExcluded)||titles?.length!==1)return null;
  const title=titles[0];
  if(!visible(document,title)||title.closest(projectExcluded))return null;
  // Native Project rename button may wrap only its name in one plain SPAN.
  // Reject icons, secondary labels, hidden text and nested controls; never read
  // the complete button as a fallback for an unfamiliar title structure.
  const leaf=title.children.length===0?title:title.children.length===1&&title.firstElementChild.tagName==='SPAN'&&title.firstElementChild.children.length===0&&!title.firstElementChild.matches('[role],[tabindex],[contenteditable]')&&![...title.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())?title.firstElementChild:null;
  if(!leaf||!visible(document,leaf))return null;
  const nativeTitle=(leaf.textContent??'').trim();if(!nativeTitle||nativeTitle.length>200)return null;
  const list=root.parentElement,tabs=list?.querySelectorAll('[role="tablist"]');
  if(list?.children.length!==2||list.lastElementChild!==root||tabs?.length!==1||!visible(document,tabs[0]))return null;
  const selected=tabs[0].querySelectorAll('[role="tab"][aria-selected="true"]');
  if(selected.length!==1||!visible(document,selected[0]))return null;
  // The observed chats panel is a SECTION/OL of native conversation rows. No
  // tab label, preview, whole-row text or unrelated page content is read.
  const section=root.firstElementChild,ol=section?.firstElementChild;
  if(root.children.length!==1||section?.tagName!=='SECTION'||section.children.length!==1||ol?.tagName!=='OL'||ol.children.length>256)return null;
  let linked=null;
  for(const li of ol.children){
   if(li.tagName!=='LI')return null;
   const anchors=li.querySelectorAll(':scope > a[href]');if(anchors.length!==1)return null;
   const anchor=anchors[0],member=urlPolicy.parse(anchor.getAttribute('href'));
   if(member.kind!=='conversation'||!observedProjectListTitle(document,anchor,root))return null;
   if(member.containerHint!==null){if(member.containerHint!==route.projectId)return null;linked??=anchor;}
  }
  if(!linked)return null;
  return {projectId:route.projectId,nativeTitle,navigationURL:route.navigationURL,nodes:[main,root,title,selected[0],linked],key:JSON.stringify([route.projectId,nativeTitle,linked.getAttribute('href')])};
 }catch{return null;}
}

/** Fixed structural failure category; no page text or attribute values leave it. */
export function sidebarBoundaryFailure(document,profile){
 try{
  const nodes=[...document.querySelectorAll(profile.sidebarBoundary)];if(!nodes.length)return 'missing';if(nodes.length>8)return 'capacity';
  const allowed=nodes.filter(n=>visible(document,n)&&!n.closest(excluded));
  if(allowed.length>1)return 'ambiguous';if(allowed.length===1)return allowed[0].querySelectorAll(profile.nativeLayout.historyList).length===1?'changed':'list-not-in-boundary';
  if(nodes.length!==1)return 'no-unique-visible';const node=nodes[0];
  if(node.closest(excluded))return 'excluded-branch';if(!node.getClientRects().length)return 'no-rect';
  let depth=0;for(let p=node;p;p=p.parentElement){if(++depth>64)return 'ancestor-limit';if(p.hidden)return 'hidden-attribute';if(p.getAttribute('aria-hidden')==='true')return 'aria-hidden';const c=document.defaultView.getComputedStyle(p);if(c.display==='none')return 'display-none';if(['hidden','collapse'].includes(c.visibility))return 'visibility';if(c.opacity==='0')return 'opacity-zero';}
  return node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true})===false?'check-visibility':'unavailable';
 }catch{return 'unavailable';}
}

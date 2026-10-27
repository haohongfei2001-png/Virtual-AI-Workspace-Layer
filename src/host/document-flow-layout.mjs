/** Presentation-only document flow contract. Never supplies scope or data authority.
 * Native nodes stay in their original parent chain. Owned rules are reversible;
 * active proof measures the displayed layout, never a temporarily disabled one.
 */
const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
const positive = r => r && Object.values(r).every(Number.isFinite) && r.width > 0 && r.height > 0;
const overlaps = (a,b) => a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height;
const attrs = node => ['class','style','hidden','aria-hidden','role','tabindex','contenteditable','inert'].map(key=>node.getAttribute(key));
const plain = node => ['DIV','MAIN','SECTION'].includes(node.tagName) && !node.shadowRoot && !node.matches('[tabindex],[contenteditable],[inert],[hidden],[aria-hidden="true"],a,button,input,textarea,select');
const controls = 'a[href],button,input,textarea,select,[tabindex],[contenteditable]:not([contenteditable="false"]),[role]:not([role="none"]):not([role="presentation"])';

export function captureNativeBaseline({document:doc,inspection,isOwnedSurface=()=>false}={}) {
 try {
  if (!inspection?.ok) return null;
  const {reading,composer,header}=inspection,win=doc.defaultView;
  if (![reading,composer,header].every(n=>n?.isConnected&&n.ownerDocument===doc) || reading.contains(composer) || composer.contains(reading)) return null;
  const protectedNodes=[...new Set([composer,...inspection.protectedRegions.filter(n=>n!==header).map(n=>n.tagName==='H1'&&plain(n.parentElement)&&!n.parentElement.contains(composer)&&!n.parentElement.contains(reading)?n.parentElement:n)])];
  const leaves=[reading,...protectedNodes];
  let root=inspection.readingViewport??reading.parentElement;
  while(root && (!leaves.every(n=>root.contains(n))||!positive(rect(root))))root=root.parentElement;
  if(!root||root===doc.body||root===doc.documentElement||!plain(root))return null;
  const headerInside=root.contains(header);
  if(headerInside){if(header.contains(reading)||header.contains(composer)||reading.contains(header)||composer.contains(header))return null;protectedNodes.unshift(header);leaves.push(header);}
  const kind=protectedNodes.some(n=>n.getAttribute('role')==='tablist')?'project':inspection.homeLayoutNodes?'home':'conversation';
  const leafSet=new Set(leaves),shells=[],records=[],nativeChildren=new Map();let count=0;
  function walk(node){
   if(++count>128||!node.isConnected||node.ownerDocument!==doc)return false;
   records.push({node,parent:node.parentElement,attrs:attrs(node)});
   if(leafSet.has(node))return true;
   // Layout wrappers only. Unknown controls/text/branches cannot disappear
   // through display:contents, even if they happen to have no visible text.
   if(!plain(node)||node.hasAttribute('role')&&node.getAttribute('role')!=='main'||[...node.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return false;
   const style=win.getComputedStyle(node);
   if(style.display==='none'||style.visibility!=='visible'||style.opacity!=='1'||style.zoom!=='1'||['transform','translate','rotate','scale','filter','backdropFilter','clipPath','maskImage'].some(k=>style[k]!=='none')||['::before','::after'].some(p=>!['none','normal'].includes(win.getComputedStyle(node,p).content)))return false;
   const children=[...node.children].filter(n=>!isOwnedSurface(n));
   if(!children.length||children.some(n=>!leaves.some(leaf=>n===leaf||n.contains(leaf))))return false;
   nativeChildren.set(node,children);shells.push(node);return children.every(walk);
  }
  if(!walk(root)||!leaves.every(n=>records.some(r=>r.node===n)))return null;
  // Headers outside the flow root are never laid out by us, but remain part
  // of the native identity and occlusion proof. React may replace them alone.
  if(!headerInside)records.push({node:header,parent:header.parentElement,attrs:attrs(header)});
  const protectedRegions=[...new Set([header,...protectedNodes])];
  const nativeControls=[];
  for(const region of protectedRegions){
   for(const node of [region,...region.querySelectorAll(controls)]){
    if(nativeControls.some(x=>x.node===node))continue;
    if(nativeControls.length>=128)return null;
    const style=win.getComputedStyle(node),box=rect(node);
    if(style.display!=='none'&&style.visibility==='visible'&&positive(box))nativeControls.push({node,parent:node.parentElement});
   }
  }
  const box=rect(root),head=rect(header),form=rect(composer);
  if(!positive(box)||!positive(head)||!positive(form))return null;
  return Object.freeze({kind,root,reading,composer,header,leaves,protectedNodes,protectedRegions,shells,records,nativeChildren,nativeControls,
   headerInside,document:doc,url:doc.location.href,regionEpoch:inspection.regionEpoch,isOwnedSurface,
   composerWidth:form.width,top:Math.max(0,headerInside?box.y:head.y+head.height,box.y),rootTop:box.y,rootLeft:box.x});
 }catch{return null;}
}

export function isSameNativeRegions(plan,{allowPresentationChange=false}={}){
 try {
  if(!plan||plan.document.location.href!==plan.url)return false;
  return plan.records.every(({node,parent,attrs:before})=>node.isConnected&&node.ownerDocument===plan.document&&node.parentElement===parent&&attrs(node).every((value,i)=>allowPresentationChange&&i<2||value===before[i]))&&
   [...plan.nativeChildren].every(([node,children])=>{const actual=[...node.children].filter(n=>!plan.isOwnedSurface(n));return actual.length===children.length&&actual.every((n,i)=>n===children[i]);})&&
   plan.nativeControls.every(({node,parent})=>node.isConnected&&node.parentElement===parent);
 }catch{return false;}
}

/** Owned attributes are tokens only. Rules exist only while the empty exit
 * switch is open. Removing it/our stylesheet restores native presentation. */
export function flowLayoutRules(plan,{id,exitId,workspaceId}) {
 const active=`body:has(#${exitId}:popover-open):not(:has(dialog[open]:not([data-va-owned]),[aria-modal="true"]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])))`;
 const geometry=`:is(${active},body:has(#${exitId}:popover-open[data-va-gesture="${id}"]):has([data-va-flow-composer="${id}"]:active,[data-va-flow-composer="${id}"] :active))`;
 const select=(name)=>`${geometry} [data-va-flow-${name}="${id}"]`;
 const offset=Number(plan.headerInside),workspaceRow=(plan.kind==='project'?3:1)+offset,composerRow=workspaceRow+1;
 const rows=(plan.headerInside?'auto ':'')+(plan.kind==='project'?'auto auto minmax(96px,1fr) auto':'minmax(96px,1fr) auto');
 return `${select('root')}{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:${rows}!important;box-sizing:border-box!important;min-height:0!important;height:calc(100dvh - ${plan.rootTop}px)!important;max-height:none!important;width:100%!important;max-width:calc(100dvw - ${plan.rootLeft}px)!important;margin:0!important;padding:${Math.max(0,plan.top-plan.rootTop)}px 0 24px!important;gap:16px!important;overflow:auto!important;align-content:stretch!important;align-items:stretch!important}
${select('shell')}{display:contents!important}
${select('reading')}{grid-column:1!important;grid-row:${workspaceRow}!important;visibility:hidden!important;interactivity:inert!important;min-height:0!important;height:0!important;overflow:clip!important;margin:0!important;padding:0!important}
${select('composer')}{grid-column:1!important;grid-row:${composerRow}!important;position:relative!important;inset:auto!important;transform:none!important;align-self:end!important;justify-self:center!important;width:min(calc(100% - 48px),${plan.composerWidth}px)!important;max-width:100%!important;margin:0!important}
${select('header')}{grid-column:1!important;grid-row:1!important}
${select('title')}{grid-column:1!important;grid-row:${1+offset}!important;margin:0 24px!important}
${select('tabs')}{grid-column:1!important;grid-row:${2+offset}!important;margin:0 24px!important}
${active} #${workspaceId}{display:flex!important;visibility:visible!important;grid-column:1!important;grid-row:${workspaceRow}!important;min-width:0!important;min-height:96px!important;align-self:stretch!important}
@media(max-width:760px){${select('root')}{padding:${Math.max(0,plan.top-plan.rootTop)}px 0 16px!important;gap:12px!important}${select('composer')}{width:min(calc(100% - 18px),${plan.composerWidth}px)!important}${select('title')},${select('tabs')}{margin-inline:9px!important}}
`;
}

export function validateActiveLayout(plan,{workspace,style,styleText,exit,isOwnedSurface=plan?.isOwnedSurface}={}) {
 try {
  const doc=plan.document,win=doc.defaultView;
  if(!isSameNativeRegions(plan)||!style?.isConnected||style.textContent!==styleText||!exit?.matches(':popover-open')||!workspace?.isConnected||workspace.parentElement!==plan.root||!isOwnedSurface(workspace)||doc.querySelector('dialog[open]:not([data-va-owned]),[aria-modal="true"]:not([data-va-owned])'))return false;
  const frame=workspace.querySelector('iframe'),board=rect(workspace),form=rect(plan.composer);
  if(!frame||!positive(board)||!positive(form)||board.width<160||board.height<96||board.y<0||board.x<0||board.x+board.width>win.innerWidth+1||board.y+board.height>win.innerHeight+1||form.y+form.height>win.innerHeight+1||overlaps(board,form))return false;
  // Re-enumerate current protected controls: native tools may arrive after
  // mount. The baseline identity check above remains mandatory for old nodes.
  const current=new Set(plan.nativeControls.map(({node})=>node));
  let checked=0;
  for(const region of plan.protectedRegions)for(const node of [region,...region.querySelectorAll(controls)]){
   if(++checked>128)return false;
   const s=win.getComputedStyle(node),r=rect(node);
   if(s.display!=='none'&&s.visibility==='visible'&&positive(r))current.add(node);
  }
  for(const node of current){
   const r=rect(node),s=win.getComputedStyle(node);
   if(!positive(r)||s.visibility!=='visible'||s.display==='none'||node.hidden||node.inert||overlaps(board,r))return false;
   // Observed titlebar shells can intentionally pass pointers through. Their
   // bounds still cannot overlap the workspace; actual controls below retain
   // individual hit checks, including controls arriving after mount.
   if(node===plan.header&&s.pointerEvents==='none'&&!node.matches(controls))continue;
   if(r.x<0||r.y<0||r.x+r.width>win.innerWidth+1||r.y+r.height>win.innerHeight+1)return false;
   const hit=doc.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   if(!hit||!(node===hit||node.contains(hit)))return false;
  }
  return true;
 }catch{return false;}
}

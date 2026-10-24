// A package-selected empty layout marker is neither content nor a mask root.
// Revalidate it on every topology/geometry check; any paint, child or focus
// semantics withdraw the exception. It is never changed or removed.
export function isEmptyViewportMarker(node,viewport,document){
 try{
  if(!node||node.parentElement!==viewport||!node.isConnected||node.ownerDocument!==document||node.tagName!=='DIV'||node.childNodes.length!==0||node.shadowRoot||node.matches('[role],[tabindex],[contenteditable],a,button,input,textarea,select'))return false;
  const win=document.defaultView,s=win.getComputedStyle(node),r=node.getBoundingClientRect();
  if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<0||r.height<0)return false;
  if(s.display==='none')return true;
  if(r.width!==0&&r.height!==0)return false;
  return ['::before','::after'].every(p=>['none','normal'].includes(win.getComputedStyle(node,p).content))&&['boxShadow','filter','backdropFilter','transform','translate','rotate','scale','offsetPath','borderImageSource'].every(k=>s[k]==='none')&&['none','hidden'].includes(s.outlineStyle)&&s.zoom==='1';
 }catch{return false;}
}
// Explicit presentation variant for the observed pointer-transparent titlebar.
// This proves an empty rectangle; it never supplies account or scope evidence.
export function nativeReturnGapRect({document,header,slot,hitRoot,readingRoot=null,readingViewport=null,viewportFocus=null,viewportMarkers=null,headerLayout=null,gapPolicy=null,onReject=()=>{},isOwnedMask=()=>false,button=null,excluded=[],excludedRects=[]}){
 let stage='roots';const reject=()=>{try{onReject(stage);}catch{}return null;};
 try{
  const win=document.defaultView,rect=n=>n.getBoundingClientRect(),overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
  if(!header||!slot||!hitRoot||header===slot||!header.contains(slot)||![header,slot,hitRoot,...excluded].every(n=>n.isConnected&&n.ownerDocument===document))return reject();
  for(const root of [slot,hitRoot]){let n=root,depth=0;for(;n;n=n.parentElement){if(++depth>128)return reject();const s=win.getComputedStyle(n);if(n.hidden||n.inert||n.getAttribute('aria-hidden')==='true'||s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)===0)return reject();}}
  stage='header-gap';
  const transparentContainer=n=>{
   if(!['transparent-containers','plain-containers'].includes(headerLayout)||n.tagName!=='DIV'||n.shadowRoot||n.matches('[role],[tabindex],[contenteditable]')||[...n.childNodes].some(c=>c.nodeType===3&&c.length>0))return false;
   const s=win.getComputedStyle(n);
   return s.pointerEvents==='none'&&s.opacity==='1'&&(s.backgroundColor==='rgba(0, 0, 0, 0)'||headerLayout==='plain-containers'&&/^rgb\(\d+, \d+, \d+\)$/.test(s.backgroundColor))&&s.backgroundImage==='none'&&s.mixBlendMode==='normal'&&['borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth'].every(k=>s[k]==='0px')&&['none','hidden'].includes(s.outlineStyle)&&['transform','translate','rotate','scale','filter','backdropFilter','boxShadow','textShadow','offsetPath','clipPath','maskImage'].every(k=>s[k]==='none')&&s.zoom==='1'&&['::before','::after'].every(p=>['none','normal'].includes(win.getComputedStyle(n,p).content));
  };
  const h=rect(header),s=rect(slot),r={x:s.x+8,y:h.y+8,width:36,height:36},gapBlocks=[];
  // Some native chat headers contain a Project breadcrumb in the original
  // left gutter. Select an empty gap without moving or covering native controls.
  // The complete paint, hit-test and protected-region proof below still applies.
  if(gapPolicy!==null&&gapPolicy!=='first-empty-header-gap')return reject();
  if(gapPolicy==='first-empty-header-gap'){
   const descendants=[...header.querySelectorAll('*')];if(descendants.length>256)return reject();
   const blocks=gapBlocks;
   for(const n of descendants){
    if(n===slot||n===button||transparentContainer(n))continue;
    const b=rect(n),style=win.getComputedStyle(n);
    if(![b.x,b.y,b.width,b.height].every(Number.isFinite))return reject();
    if(style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&b.width>0&&b.height>0&&b.y<r.y+r.height&&r.y<b.y+b.height)blocks.push(b);
   }
   blocks.sort((a,b)=>a.x-b.x);
   for(const b of blocks)if(overlap(r,b))r.x=b.x+b.width+8;
  }
  if(![h.x,h.y,h.width,h.height,s.x,s.y,s.width,s.height,...Object.values(r)].every(Number.isFinite)||r.x<0||r.y<0||r.x+r.width>win.innerWidth||r.y+r.height>win.innerHeight||r.x<h.x||r.x+r.width>h.right||r.y<h.y||r.y+r.height>h.bottom||r.x<s.x||r.x+r.width>s.right||r.y<s.y||r.y+r.height>s.bottom)return reject();
  stage='button';
  if(button){const style=win.getComputedStyle(button);if(button.hidden||button.inert||button.disabled||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)!==1||style.pointerEvents==='none')return reject();const b=rect(button);if(button.parentElement!==document.body||![b.y-r.y,b.width-r.width,b.height-r.height].every(v=>Math.abs(v)<0.01))return reject();}
  stage='hit-root';
  if(hitRoot.tagName!=='DIV'||hitRoot.matches('[role],[tabindex],[contenteditable]')||[...hitRoot.childNodes].some(c=>c.nodeType===3&&c.textContent.trim()))return reject();
  // When the reading mask opens, its scroll container becomes the native hit
  // background. Keep the original noninteractive parent valid; the profile may
  // additionally admit an exact native scroll region
  // with no other content except geometrically excluded native branches.
  stage='viewport';
  if(viewportFocus!==null&&viewportFocus!=='native-scroll-region')return reject();
  if(viewportMarkers!==null&&(viewportMarkers!=='empty-div-v1'||!readingViewport))return reject();
  if(viewportFocus!==null&&!readingViewport)return reject();
  if(readingViewport){
   // An explicit native scroll region keeps its own tab stop and keyboard
   // behavior. Only the reading child is masked; never the viewport itself.
   const scrollRegion=viewportFocus==='native-scroll-region'&&readingViewport.getAttribute('role')==='region'&&readingViewport.getAttribute('tabindex')==='0'&&!readingViewport.hasAttribute('contenteditable')&&['auto','scroll'].includes(win.getComputedStyle(readingViewport).overflowY);
   if(!readingRoot||readingViewport===hitRoot||readingRoot.parentElement!==readingViewport||!readingViewport.isConnected||readingViewport.ownerDocument!==document||!hitRoot.contains(readingViewport)||readingViewport.tagName!=='DIV'||!scrollRegion&&readingViewport.matches('[role],[tabindex],[contenteditable]')||readingViewport.shadowRoot||[...readingViewport.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||readingViewport.children.length>10||[...readingViewport.children].some(n=>n!==readingRoot&&!excluded.includes(n)&&!(viewportMarkers==='empty-div-v1'&&isEmptyViewportMarker(n,readingViewport,document))))return reject();
   for(const pseudo of ['::before','::after'])if(!['none','normal'].includes(win.getComputedStyle(readingViewport,pseudo).content))return reject();
   let n=readingViewport,depth=0;for(;n;n=n.parentElement){const style=win.getComputedStyle(n);if(++depth>128||n.hidden||n.inert||n.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)return reject();}
  }
  stage='reading-root';
  if(readingRoot){
   if(readingRoot===hitRoot||!readingRoot.isConnected||readingRoot.ownerDocument!==document||!hitRoot.contains(readingRoot)||readingRoot.tagName!=='DIV'||readingRoot.matches('[role],[tabindex],[contenteditable]'))return reject();
   let ancestor=readingRoot,depth=0;
   while(ancestor){const style=win.getComputedStyle(ancestor);if(++depth>128||ancestor.hidden||ancestor.inert||ancestor.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='collapse'||style.visibility==='hidden'&&!isOwnedMask(ancestor)||Number(style.opacity)===0)return reject();ancestor=ancestor.parentElement;}
   // The reading container may be the empty background under the transparent
   // titlebar. Prove its gutter empty in BOTH presentation states; inherited
   // mask visibility never exempts descendants from the geometry check.
   // Native scroll clipping applies to normal descendants, but not to fixed
   // or externally-positioned descendants/top-layer content. Preserve the raw
   // geometry check whenever that containment cannot be proven.
   const visibleBox=(node,box)=>{
    // Clipping only shrinks a box. A box already outside the header band
    // cannot block any candidate in that band; still inspect every node and
    // every text rectangle, including fixed/absolute descendants separately.
    if(box.y>=r.y+r.height||box.y+box.height<=r.y)return box;
    if(!readingViewport||!['auto','scroll','hidden','clip'].includes(paintStyle(readingViewport).overflowY))return box;
    let n=node.nodeType===1?node:node.parentElement,depth=0;
    for(;n&&n!==readingViewport;n=n.parentElement){
     if(++depth>128||n.matches(':popover-open,dialog[open]'))return box;
     const style=paintStyle(n);
     if(style.position==='fixed'||style.position==='absolute'&&(!n.offsetParent||n.offsetParent!==readingViewport&&!readingViewport.contains(n.offsetParent)))return box;
    }
    if(n!==readingViewport)return box;
    const clip=rect(readingViewport),top=Math.max(box.y,clip.y),bottom=Math.min(box.y+box.height,clip.bottom);
    return {x:box.x,y:top,width:box.width,height:Math.max(0,bottom-top)};
   };
  stage='reading-paint';
   // Complete this proof in one JS task: never authorize a partially scanned
   // tree or carry geometry across mutations/scrolls. Bound elapsed work rather
   // than document size, so an ordinary long transcript is not itself unsafe.
   // Cache styles only for this synchronous proof, never between inspections.
   const paintStarted=win.performance.now(),styles=new WeakMap();
   const withinBudget=()=>{const elapsed=win.performance.now()-paintStarted;return Number.isFinite(elapsed)&&elapsed>=0&&elapsed<50;};
   const paintStyle=n=>{let value=styles.get(n);if(!value){value=win.getComputedStyle(n);styles.set(n,value);}return value;};
   // The same package-selected gap policy must consider reading paint as well
   // as titlebar children. Collect every intersecting box before selecting a
   // gap; no occluder is ignored and no partial scan can move the control.
   const paintBlocksGap=box=>{
    if(![box.x,box.y,box.width,box.height].every(Number.isFinite))return true;
    if(box.width<=0||box.height<=0)return false;
    if(gapPolicy==='first-empty-header-gap'){
     if(box.y<r.y+r.height&&r.y<box.y+box.height)gapBlocks.push(box);
     return false;
    }
    return overlap(r,box);
   };
   const walker=document.createTreeWalker(readingRoot,5),range=document.createRange();let node=readingRoot;
   do{
    if(!withinBudget()){stage='reading-paint-budget';return reject();}
    if(node.nodeType===1){
     if(node.shadowRoot||node.localName?.includes('-')){stage='reading-paint-opaque';return reject();}
     for(const pseudo of ['::before','::after']){
      const style=win.getComputedStyle(node,pseudo);if(['none','normal'].includes(style.content))continue;
      // Empty native decorations are safe only when their entire border box
      // is proven inside an already-excluded descendant's own padding box.
      const px=value=>/^\d+(?:\.\d+)?px$/.test(value)?Number.parseFloat(value):NaN;
      const host=paintStyle(node),left=px(style.left),top=px(style.top),width=px(style.width),height=px(style.height);
      const paddingWidth=host.boxSizing==='border-box'?px(host.width)-px(host.borderLeftWidth)-px(host.borderRightWidth):px(host.width)+px(host.paddingLeft)+px(host.paddingRight);
      const paddingHeight=host.boxSizing==='border-box'?px(host.height)-px(host.borderTopWidth)-px(host.borderBottomWidth):px(host.height)+px(host.paddingTop)+px(host.paddingBottom);
      if(node===readingRoot||style.content!=='""'||host.position==='static'||style.position!=='absolute'||style.boxSizing!=='border-box'||!['left','top','right','bottom','width','height'].every(k=>Number.isFinite(px(style[k])))||![paddingWidth,paddingHeight].every(Number.isFinite)||left+width>paddingWidth||px(style.right)+width>paddingWidth||top+height>paddingHeight||px(style.bottom)+height>paddingHeight||['marginLeft','marginTop','marginRight','marginBottom'].some(k=>px(style[k])!==0)||['transform','translate','rotate','scale','boxShadow','textShadow','filter','backdropFilter','offsetPath','borderImageSource'].some(k=>style[k]!=='none')||!['none','hidden'].includes(style.outlineStyle)||style.zoom!=='1'){stage='reading-paint-decoration';return reject();}
     }
     if(node!==readingRoot){const box=rect(node);if(paintBlocksGap(visibleBox(node,box))){stage='reading-paint-overlap';return reject();}}
    }else{
     range.selectNodeContents(node);
     for(const box of range.getClientRects()){if(!withinBudget()){stage='reading-paint-budget';return reject();}if(paintBlocksGap(visibleBox(node,box))){stage='reading-paint-overlap';return reject();}}
    }
   }while(node=walker.nextNode());
   if(gapPolicy==='first-empty-header-gap'){
    gapBlocks.sort((a,b)=>a.x-b.x);
    for(const box of gapBlocks)if(overlap(r,box))r.x=box.x+box.width+8;
    // Recheck both boundaries and an already installed button after relocation.
    if(r.x+r.width>Math.min(h.right,s.right,win.innerWidth)){stage='reading-paint-overlap';return reject();}
   }
   if(!withinBudget()){stage='reading-paint-budget';return reject();}
  }
  stage='button';
  if(button&&Math.abs(rect(button).x-r.x)>=0.01)return reject();
  stage='protected-regions';
  const visual=win.visualViewport;if(visual&&(visual.scale!==1||visual.offsetLeft!==0||visual.offsetTop!==0))return reject();
  for(const box of [...excluded.map(rect),...excludedRects])if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||overlap(r,box))return reject();
  // Only these two explicit, pointer-transparent layout wrappers may occupy
  // the gap. Native descendants, even tiny controls between hit points, win.
  stage='header-paint';
  for(const n of [header,slot]){
   const style=win.getComputedStyle(n);
   if(style.pointerEvents!=='none'||n.matches('a,button,input,textarea,select,[contenteditable],[tabindex],[role]')||[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim()))return reject();
   for(const pseudo of ['::before','::after'])if(!['none','normal','""'].includes(win.getComputedStyle(n,pseudo).content))return reject();
  }
  let node=header.firstElementChild,count=0;
  if(headerLayout!==null&&!['transparent-containers','plain-containers'].includes(headerLayout))return reject();

  while(node){
   if(++count>256)return reject();
   if(node!==slot&&node!==button){const b=rect(node),style=win.getComputedStyle(node);if(style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&b.width>0&&b.height>0&&overlap(r,b)&&!transparentContainer(node))return reject();}
   if(node.firstElementChild){node=node.firstElementChild;continue;}
   while(node!==header&&!node.nextElementSibling)node=node.parentElement;
   node=node===header?null:node.nextElementSibling;
  }
  // The approved control has 9px rounded corners. Those four outside-curve
  // pixels must still expose the proved empty native background, not another
  // control. Require actual button hits at four additional interior points;
  // do not confuse its transparent corners with a missing/occluded button.
  stage='hit-test';
  const buttonStyle=button&&win.getComputedStyle(button);
  const rounded=buttonStyle&&['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].every(k=>buttonStyle[k]==='9px')&&buttonStyle.clipPath==='none';
  const points=[[1,1,!rounded],[35,1,!rounded],[1,35,!rounded],[35,35,!rounded],[18,18,true],...(rounded?[[10,10,true],[26,10,true],[10,26,true],[26,26,true]]:[])];
  for(const [dx,dy,buttonHit]of points){
   const x=r.x+dx,y=r.y+dy;
   const hits=document.elementsFromPoint(x,y),top=hits[0];
   const background=top===button?hits.find(n=>n!==button):top;
   if(button&&buttonHit&&top!==button||background!==hitRoot&&background!==readingRoot&&background!==readingViewport)return reject();
  }
  // Match the observed header layer; never escalate above native dialogs.
  stage='header-layer';
  if(win.getComputedStyle(header).zIndex!=='30')return reject();
  return r;
 }catch{return reject();}
}

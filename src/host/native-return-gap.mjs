// Explicit presentation variant for the observed pointer-transparent titlebar.
// This proves an empty rectangle; it never supplies account or scope evidence.
export function nativeReturnGapRect({document,header,slot,hitRoot,readingRoot=null,readingViewport=null,viewportFocus=null,isOwnedMask=()=>false,button=null,excluded=[],excludedRects=[]}){
 try{
  const win=document.defaultView,rect=n=>n.getBoundingClientRect(),overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
  if(!header||!slot||!hitRoot||header===slot||!header.contains(slot)||![header,slot,hitRoot,...excluded].every(n=>n.isConnected&&n.ownerDocument===document))return null;
  for(const root of [slot,hitRoot]){let n=root,depth=0;for(;n;n=n.parentElement){if(++depth>128)return null;const s=win.getComputedStyle(n);if(n.hidden||n.inert||n.getAttribute('aria-hidden')==='true'||s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)===0)return null;}}
  const h=rect(header),s=rect(slot),r={x:s.x+8,y:h.y+8,width:36,height:36};
  if(![h.x,h.y,h.width,h.height,s.x,s.y,s.width,s.height,...Object.values(r)].every(Number.isFinite)||r.x<0||r.y<0||r.x+r.width>win.innerWidth||r.y+r.height>win.innerHeight||r.x<h.x||r.x+r.width>h.right||r.y<h.y||r.y+r.height>h.bottom||r.x<s.x||r.x+r.width>s.right||r.y<s.y||r.y+r.height>s.bottom)return null;
  if(button){const style=win.getComputedStyle(button);if(button.hidden||button.inert||button.disabled||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)!==1||style.pointerEvents==='none')return null;const b=rect(button);if(button.parentElement!==document.body||![b.x-r.x,b.y-r.y,b.width-r.width,b.height-r.height].every(v=>Math.abs(v)<0.01))return null;}
  if(hitRoot.tagName!=='DIV'||hitRoot.matches('[role],[tabindex],[contenteditable]')||[...hitRoot.childNodes].some(c=>c.nodeType===3&&c.textContent.trim()))return null;
  // When the reading mask opens, its scroll container becomes the native hit
  // background. Keep the original noninteractive parent valid; the profile may
  // additionally admit an exact native scroll region
  // with no other content except geometrically excluded native branches.
  if(viewportFocus!==null&&viewportFocus!=='native-scroll-region')return null;
  if(viewportFocus!==null&&!readingViewport)return null;
  if(readingViewport){
   // An explicit native scroll region keeps its own tab stop and keyboard
   // behavior. Only the reading child is masked; never the viewport itself.
   const scrollRegion=viewportFocus==='native-scroll-region'&&readingViewport.getAttribute('role')==='region'&&readingViewport.getAttribute('tabindex')==='0'&&!readingViewport.hasAttribute('contenteditable')&&['auto','scroll'].includes(win.getComputedStyle(readingViewport).overflowY);
   if(!readingRoot||readingViewport===hitRoot||readingRoot.parentElement!==readingViewport||!readingViewport.isConnected||readingViewport.ownerDocument!==document||!hitRoot.contains(readingViewport)||readingViewport.tagName!=='DIV'||!scrollRegion&&readingViewport.matches('[role],[tabindex],[contenteditable]')||readingViewport.shadowRoot||[...readingViewport.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||[...readingViewport.children].some(n=>n!==readingRoot&&!excluded.includes(n)))return null;
   for(const pseudo of ['::before','::after'])if(!['none','normal'].includes(win.getComputedStyle(readingViewport,pseudo).content))return null;
   let n=readingViewport,depth=0;for(;n;n=n.parentElement){const style=win.getComputedStyle(n);if(++depth>128||n.hidden||n.inert||n.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)return null;}
  }
  if(readingRoot){
   if(readingRoot===hitRoot||!readingRoot.isConnected||readingRoot.ownerDocument!==document||!hitRoot.contains(readingRoot)||readingRoot.tagName!=='DIV'||readingRoot.matches('[role],[tabindex],[contenteditable]'))return null;
   let ancestor=readingRoot,depth=0;
   while(ancestor){const style=win.getComputedStyle(ancestor);if(++depth>128||ancestor.hidden||ancestor.inert||ancestor.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='collapse'||style.visibility==='hidden'&&!isOwnedMask(ancestor)||Number(style.opacity)===0)return null;ancestor=ancestor.parentElement;}
   // The reading container may be the empty background under the transparent
   // titlebar. Prove its gutter empty in BOTH presentation states; inherited
   // mask visibility never exempts descendants from the geometry check.
   const walker=document.createTreeWalker(readingRoot,5);let node=readingRoot,nodes=0,rectangles=0;
   do{
    if(++nodes>2048)return null;
    if(node.nodeType===1){
     if(node.shadowRoot||node.localName?.includes('-'))return null;
     for(const pseudo of ['::before','::after']){
      const style=win.getComputedStyle(node,pseudo);if(['none','normal'].includes(style.content))continue;
      // Empty native decorations are safe only when their entire border box
      // is proven inside an already-excluded descendant's own padding box.
      const px=value=>/^\d+(?:\.\d+)?px$/.test(value)?Number.parseFloat(value):NaN;
      const host=win.getComputedStyle(node),left=px(style.left),top=px(style.top),width=px(style.width),height=px(style.height);
      const paddingWidth=host.boxSizing==='border-box'?px(host.width)-px(host.borderLeftWidth)-px(host.borderRightWidth):px(host.width)+px(host.paddingLeft)+px(host.paddingRight);
      const paddingHeight=host.boxSizing==='border-box'?px(host.height)-px(host.borderTopWidth)-px(host.borderBottomWidth):px(host.height)+px(host.paddingTop)+px(host.paddingBottom);
      if(node===readingRoot||style.content!=='""'||host.position==='static'||style.position!=='absolute'||style.boxSizing!=='border-box'||!['left','top','right','bottom','width','height'].every(k=>Number.isFinite(px(style[k])))||![paddingWidth,paddingHeight].every(Number.isFinite)||left+width>paddingWidth||px(style.right)+width>paddingWidth||top+height>paddingHeight||px(style.bottom)+height>paddingHeight||['marginLeft','marginTop','marginRight','marginBottom'].some(k=>px(style[k])!==0)||['transform','translate','rotate','scale','boxShadow','textShadow','filter','backdropFilter','offsetPath','borderImageSource'].some(k=>style[k]!=='none')||!['none','hidden'].includes(style.outlineStyle)||style.zoom!=='1')return null;
     }
     if(node!==readingRoot){const box=rect(node);if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width>0&&box.height>0&&overlap(r,box))return null;}
    }else{
     const range=document.createRange();range.selectNodeContents(node);
     for(const box of range.getClientRects()){if(++rectangles>2048||![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width>0&&box.height>0&&overlap(r,box))return null;}
    }
   }while(node=walker.nextNode());
  }
  const visual=win.visualViewport;if(visual&&(visual.scale!==1||visual.offsetLeft!==0||visual.offsetTop!==0))return null;
  for(const box of [...excluded.map(rect),...excludedRects])if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||overlap(r,box))return null;
  // Only these two explicit, pointer-transparent layout wrappers may occupy
  // the gap. Native descendants, even tiny controls between hit points, win.
  for(const n of [header,slot]){
   const style=win.getComputedStyle(n);
   if(style.pointerEvents!=='none'||n.matches('a,button,input,textarea,select,[contenteditable],[tabindex],[role]')||[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim()))return null;
   for(const pseudo of ['::before','::after'])if(!['none','normal','""'].includes(win.getComputedStyle(n,pseudo).content))return null;
  }
  let node=header.firstElementChild,count=0;
  while(node){
   if(++count>256)return null;
   if(node!==slot&&node!==button){const b=rect(node),style=win.getComputedStyle(node);if(style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&b.width>0&&b.height>0&&overlap(r,b))return null;}
   if(node.firstElementChild){node=node.firstElementChild;continue;}
   while(node!==header&&!node.nextElementSibling)node=node.parentElement;
   node=node===header?null:node.nextElementSibling;
  }
  for(const [x,y]of [[r.x+1,r.y+1],[r.x+35,r.y+1],[r.x+1,r.y+35],[r.x+35,r.y+35],[r.x+18,r.y+18]]){
   const hits=document.elementsFromPoint(x,y),top=hits[0];
   const background=top===button?hits.find(n=>n!==button):top;
   if(button&&top!==button||background!==hitRoot&&background!==readingRoot&&background!==readingViewport)return null;
  }
  // Match the observed header layer; never escalate above native dialogs.
  if(win.getComputedStyle(header).zIndex!=='30')return null;
  return r;
 }catch{return null;}
}

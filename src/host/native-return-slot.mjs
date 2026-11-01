// Presentation-only checks. A live slot never authenticates a document or scope.
export function nativeReturnSlotRect({document,header,slot,excluded=[],excludedRects=[]}){
 try{
  const win=document.defaultView,rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const finite=r=>Object.values(r).every(Number.isFinite)&&r.width>0&&r.height>0;
  const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
  if(!header||!slot||header===slot||!header.contains(slot)||![header,slot,...excluded].every(n=>n.isConnected&&n.ownerDocument===document))return null;
  for(let node=slot;node;node=node.parentElement){const style=win.getComputedStyle(node);if(node.hidden||node.inert||node.getAttribute?.('aria-hidden')==='true'||style.display==='none'||['hidden','collapse'].includes(style.visibility)||Number(style.opacity)===0)return null;}
  const r=rect(slot),h=rect(header),w=win.innerWidth,height=win.innerHeight;
  if(!finite(r)||!finite(h)||!Number.isFinite(w)||!Number.isFinite(height)||r.width<34||r.height<34||r.x<0||r.y<0||r.x+r.width>w||r.y+r.height>height||r.x<h.x||r.y<h.y||r.x+r.width>h.x+h.width||r.y+r.height>h.y+h.height)return null;
  const visual=win.visualViewport;if(visual&&(visual.scale!==1||visual.offsetLeft!==0||visual.offsetTop!==0))return null;
  for(const other of [...excluded.map(rect),...excludedRects])if(!finite(other)||overlap(r,other))return null;
  // Bound the header walk and reject intersecting sibling boxes, including a
  // small control that lies between the five hit-test points. Ancestors of the
  // slot provide its layout; descendants belong to the slot's occupancy check.
  let node=header.firstElementChild,count=0;
  while(node){
   if(++count>256)return null;
   if(node!==slot&&!slot.contains(node)&&!node.contains(slot)){
    const other=rect(node);if(!Object.values(other).every(Number.isFinite))return null;
    const style=win.getComputedStyle(node);
    if(style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&other.width>0&&other.height>0&&overlap(r,other))return null;
   }
   if(node.firstElementChild){node=node.firstElementChild;continue;}
   while(node!==header&&!node.nextElementSibling)node=node.parentElement;
   node=node===header?null:node.nextElementSibling;
  }
  if(typeof document.elementFromPoint!=='function')return null;
  // Hit testing rejects an otherwise empty slot covered by a native sibling or
  // portal. It is additional evidence, not a replacement for topology/geometry.
  for(const [x,y]of [[r.x+1,r.y+1],[r.x+r.width-1,r.y+1],[r.x+1,r.y+r.height-1],[r.x+r.width-1,r.y+r.height-1],[r.x+r.width/2,r.y+r.height/2]]){
   const top=document.elementFromPoint(x,y);if(top!==slot&&!slot.contains(top))return null;
  }
  return r;
 }catch{return null;}
}

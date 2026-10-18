// Explicit presentation variant for the observed pointer-transparent titlebar.
// This proves an empty rectangle; it never supplies account or scope evidence.
export function nativeReturnGapRect({document,header,slot,hitRoot,button=null,excluded=[],excludedRects=[]}){
 try{
  const win=document.defaultView,rect=n=>n.getBoundingClientRect(),overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
  if(!header||!slot||!hitRoot||header===slot||!header.contains(slot)||![header,slot,hitRoot,...excluded].every(n=>n.isConnected&&n.ownerDocument===document))return null;
  for(const root of [slot,hitRoot]){let n=root,depth=0;for(;n;n=n.parentElement){if(++depth>128)return null;const s=win.getComputedStyle(n);if(n.hidden||n.inert||n.getAttribute('aria-hidden')==='true'||s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)===0)return null;}}
  const h=rect(header),s=rect(slot),r={x:s.x+8,y:h.y+8,width:36,height:36};
  if(![h.x,h.y,h.width,h.height,s.x,s.y,s.width,s.height,...Object.values(r)].every(Number.isFinite)||r.x<0||r.y<0||r.x+r.width>win.innerWidth||r.y+r.height>win.innerHeight||r.x<h.x||r.x+r.width>h.right||r.y<h.y||r.y+r.height>h.bottom||r.x<s.x||r.x+r.width>s.right||r.y<s.y||r.y+r.height>s.bottom)return null;
  if(button){const style=win.getComputedStyle(button);if(button.hidden||button.inert||button.disabled||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)!==1||style.pointerEvents==='none')return null;const b=rect(button);if(button.parentElement!==document.body||![b.x-r.x,b.y-r.y,b.width-r.width,b.height-r.height].every(v=>Math.abs(v)<0.01))return null;}
  if(hitRoot.tagName!=='DIV'||hitRoot.matches('[role],[tabindex],[contenteditable]')||[...hitRoot.childNodes].some(c=>c.nodeType===3&&c.textContent.trim()))return null;
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
   if(button?top!==button:top!==hitRoot)return null;
   if(top===button&&hits.find(n=>n!==button)!==hitRoot)return null;
  }
  // Match the observed header layer; never escalate above native dialogs.
  if(win.getComputedStyle(header).zIndex!=='30')return null;
  return r;
 }catch{return null;}
}

import assert from 'node:assert/strict';
/** Read exact matching names in the workspace, including hidden duplicates.
 * Diagnostic only: never scroll, alter CSS, reveal a node, or change the DOM. */
export async function inspectUi10Titles(frame,title){
 return frame.locator('.workspace').getByText(title,{exact:true}).evaluateAll(nodes=>nodes.map(n=>{
  const r=n.getBoundingClientRect(),s=getComputedStyle(n),parents=[];
  for(let p=n.parentElement;p&&parents.length<5;p=p.parentElement){const b=p.getBoundingClientRect(),c=getComputedStyle(p);parents.push({tag:p.tagName,className:p.className,width:b.width,height:b.height,display:c.display,visibility:c.visibility,overflow:c.overflow});}
  const workspace=n.closest('.workspace'),w=workspace?.getBoundingClientRect();
  return {frameViewport:{width:innerWidth,height:innerHeight},workspace:w?{width:w.width,height:w.height,x:w.x,y:w.y}:null,tag:n.tagName,className:n.className,text:n.textContent,width:r.width,height:r.height,x:r.x,y:r.y,display:s.display,visibility:s.visibility,opacity:s.opacity,parents};
 }));
}
export function assertUi10TitleBox(box){
 assert(box&&Number.isFinite(box.width)&&Number.isFinite(box.height)&&box.width>0&&box.height>0,'ui10-title-no-visible-text-box');
}
export async function waitForVisibleUi10Title(frame,title,{now=()=>performance.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const deadline=now()+15000;
 // Filter before first(): DOM ordering must not pin the wait to a hidden copy.
 // Restrict to actual rendered project/conversation titles, not tooltips/menus.
 const exact=frame.locator('.workspace').getByText(title,{exact:true});
 const visible=exact.and(frame.locator('.workspace .theme-name:visible, .workspace .window-title:visible')).first();
 try{
  // A visible locator and its later layout read can straddle a renderer commit.
  // Observe the actual node and its positive box together; all retries share
  // the original deadline. Persistent zero-area or hidden text still fails.
  for(;;){
   await visible.waitFor({state:'visible',timeout:Math.max(1,deadline-now())});
   const box=await visible.evaluate(node=>{
    const r=node.getBoundingClientRect(),s=getComputedStyle(node);
    return node.isConnected&&s.display!=='none'&&s.visibility==='visible'&&r.width>0&&r.height>0?{x:r.x,y:r.y,width:r.width,height:r.height}:null;
   },undefined,{timeout:Math.max(1,deadline-now())});
   assert(now()<=deadline,'ui10-title-observation-deadline');
   if(box&&Number.isFinite(box.width)&&Number.isFinite(box.height)&&box.width>0&&box.height>0){assertUi10TitleBox(box);return {box,candidates:await inspectUi10Titles(frame,title)};}
   const remaining=deadline-now();if(remaining<=0){assertUi10TitleBox(box);}
   await pause(Math.min(50,remaining));
  }
 }catch(error){
  try{error.ui10TitleDiagnostics=await inspectUi10Titles(frame,title);}catch(diagnosticError){error.ui10TitleDiagnosticError=diagnosticError.message;}
  throw error;
 }
}

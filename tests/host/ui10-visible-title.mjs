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
export async function waitForVisibleUi10Title(frame,title){
 // Filter before first(): DOM ordering must not pin the wait to a hidden copy.
 // Restrict to actual rendered project/conversation titles, not tooltips/menus.
 const exact=frame.locator('.workspace').getByText(title,{exact:true});
 const visible=exact.and(frame.locator('.workspace .theme-name:visible, .workspace .window-title:visible')).first();
 try{
  await visible.waitFor({state:'visible',timeout:15000});
  const box=await visible.boundingBox();assertUi10TitleBox(box);
  return {box,candidates:await inspectUi10Titles(frame,title)};
 }catch(error){
  try{error.ui10TitleDiagnostics=await inspectUi10Titles(frame,title);}catch(diagnosticError){error.ui10TitleDiagnosticError=diagnosticError.message;}
  throw error;
 }
}

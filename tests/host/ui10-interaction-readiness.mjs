import assert from 'node:assert/strict';
/** Single observation deadline. Only detached/zero-area renderer commits retry;
 * positive boxes still face the original fit/font assertions immediately. */
export async function readUi10Geometry(locator,{now=()=>performance.now(),pause=ms=>new Promise(r=>setTimeout(r,ms)),budgetMs=6000}={}){
 const deadline=now()+budgetMs;let last;
 for(;;){
  try{last=await locator.evaluate(n=>{const rect=n.getBoundingClientRect(),style=getComputedStyle(n),left=rect.left+n.clientLeft,right=left+n.clientWidth;const descendants=[...n.querySelectorAll('*')].slice(0,512),overflowing=descendants.flatMap(child=>{const r=child.getBoundingClientRect(),s=getComputedStyle(child);return child.isConnected&&r.width>0&&r.height>0&&(r.right>right+1||r.left<left-1)?[{tag:child.tagName,className:typeof child.className==='string'?child.className:'',rect:r.toJSON(),display:s.display,position:s.position,overflowX:s.overflowX}]:[];}).slice(0,24);return {connected:n.isConnected,visible:style.display!=='none'&&style.visibility==='visible',rect:rect.toJSON(),viewport:{width:innerWidth,height:innerHeight},scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,offsetWidth:n.offsetWidth,clientLeft:n.clientLeft,scrollLeft:n.scrollLeft,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,scrollbarWidth:n.offsetWidth-n.clientWidth-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth),overflowX:style.overflowX,overflowY:style.overflowY,boxSizing:style.boxSizing,paddingLeft:style.paddingLeft,paddingRight:style.paddingRight,fontFamily:style.fontFamily,overflowing,descendantsSampled:descendants.length};},undefined,{timeout:Math.max(1,deadline-now())});}catch(error){if(last)error.ui10Geometry=last;throw error;}
  if(now()>deadline)throw Object.assign(Error('ui10-geometry-observation-deadline'),{ui10Geometry:last});
  if(last.connected&&last.visible&&last.rect.width>0&&last.rect.height>0){try{assert(last.rect.left>=-1&&last.rect.right<=last.viewport.width+1,'panel must fit frame');assert(last.scrollWidth<=last.clientWidth+1,'panel must not hide horizontal overflow');assert(!/Times New Roman/.test(last.fontFamily),'token font required');return last;}catch(error){error.ui10Geometry=last;throw error;}}
  const remaining=deadline-now();if(remaining<=0)throw Object.assign(Error('ui10-geometry-no-visible-positive-box'),{ui10Geometry:last});await pause(Math.min(50,remaining));
 }
}
/** Inspect only the live workspace shadow tree. No focus/value/DOM writes. */
export function inspectUi10Search(){
 const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot,input=root?.querySelector('input[aria-label="已知聊天查找输入"]'),results=root?.querySelector('.search-results');
 return {present:!!input,connected:input?.isConnected===true,value:input?.value??null,focused:root?.activeElement===input,documentHasFocus:document.hasFocus(),loading:results?.textContent.includes('正在查找已知记录…')??true,resultText:results?.textContent.slice(0,1500)??null,workspaceText:root?.querySelector('.workspace')?.textContent.slice(0,2000)??null};
}
export function ui10InitialSearchReady(s){return s.present&&s.connected&&s.value===''&&s.loading===false&&s.resultText!==null;}

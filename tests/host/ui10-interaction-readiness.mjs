import assert from 'node:assert/strict';
/** Single observation deadline. Only detached/zero-area renderer commits retry;
 * positive boxes still face the original fit/font assertions immediately. */
export async function readUi10Geometry(locator,{now=()=>performance.now(),pause=ms=>new Promise(r=>setTimeout(r,ms)),budgetMs=6000}={}){
 const deadline=now()+budgetMs;let last;
 for(;;){
  last=await locator.evaluate(n=>{const rect=n.getBoundingClientRect(),style=getComputedStyle(n);return {connected:n.isConnected,visible:style.display!=='none'&&style.visibility==='visible',rect:rect.toJSON(),viewport:{width:innerWidth,height:innerHeight},scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,fontFamily:style.fontFamily};},undefined,{timeout:Math.max(1,deadline-now())});
  if(now()>deadline)throw Object.assign(Error('ui10-geometry-observation-deadline'),{ui10Geometry:last});
  if(last.connected&&last.visible&&last.rect.width>0&&last.rect.height>0){assert(last.rect.left>=-1&&last.rect.right<=last.viewport.width+1,'panel must fit frame');assert(last.scrollWidth<=last.clientWidth+1,'panel must not hide horizontal overflow');assert(!/Times New Roman/.test(last.fontFamily),'token font required');return last;}
  const remaining=deadline-now();if(remaining<=0)throw Object.assign(Error('ui10-geometry-no-visible-positive-box'),{ui10Geometry:last});await pause(Math.min(50,remaining));
 }
}
/** Inspect only the live workspace shadow tree. No focus/value/DOM writes. */
export function inspectUi10Search(){
 const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'))?.shadowRoot,input=root?.querySelector('input[aria-label="已知聊天查找输入"]'),results=root?.querySelector('.search-results');
 return {present:!!input,connected:input?.isConnected===true,value:input?.value??null,focused:root?.activeElement===input,loading:results?.textContent.includes('正在查找已知记录…')??true,resultText:results?.textContent.slice(0,1500)??null,workspaceText:root?.querySelector('.workspace')?.textContent.slice(0,2000)??null};
}
export function ui10InitialSearchReady(s){return s.present&&s.connected&&s.value===''&&s.loading===false&&s.resultText!==null;}

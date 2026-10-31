/** Runs inside the fixture frame. Read the current viewport after render, never
 * retry the scroll gesture or use a detached element as the current viewport. */
export function readCurrentWindowScroll(){
 const roots=[document];let current=null;
 for(let i=0;i<roots.length;i++){
  for(const node of roots[i].querySelectorAll('.workspace'))if(node.isConnected){if(current)return null;current=node;}
  for(const node of roots[i].querySelectorAll('*'))if(node.shadowRoot)roots.push(node.shadowRoot);
 }
 return current?{top:current.scrollTop,height:current.clientHeight,total:current.scrollHeight,connected:current.isConnected}:null;
}
export async function observeWindowScroll(){
 const current=()=>{const roots=[document];for(let i=0;i<roots.length;i++){const found=roots[i].querySelector('.workspace');if(found?.isConnected)return found;for(const element of roots[i].querySelectorAll('*'))if(element.shadowRoot)roots.push(element.shadowRoot);}return null;};
 const node=current();if(!node)return {before:null,assigned:null,originalAfter:null,after:null};
 const sample=value=>value?{top:value.scrollTop,height:value.clientHeight,total:value.scrollHeight,connected:value.isConnected,overflow:getComputedStyle(value).overflowY}:null;
 const before=sample(node);node.scrollTop=150;const assigned=sample(node);
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 return {before,assigned,originalAfter:sample(node),after:sample(current())};
}

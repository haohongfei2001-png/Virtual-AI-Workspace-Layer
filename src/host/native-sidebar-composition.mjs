import {nativeHistoryListRect,historyRectangleClear} from './native-history-list.mjs';

// A flow member keeps its full content viewport while native scrolling clips
// it. The 240px minimum for replacing a native list is not applicable here:
// no native subtree is masked and no clipped fragment becomes a new viewport.
const visibleSlot=rect=>rect&&Number.isFinite(rect.width)&&Number.isFinite(rect.height)&&rect.width>=180&&rect.height>0;

// Layout membership, not a Project/member/control recognizer. Native children
// remain where the host put them; only our own empty slot joins their flow.
export function nativeSidebarComposition({document,source,history,isOwnedSurface=()=>false}){
 try{
  if(source?.tagName!=='NAV'||!history?.isConnected||!source.contains(history))return null;
  const win=document.defaultView,section=history.closest('[data-app-action-sidebar-section]');
  if(!section)return null;
  const sectionIn=node=>{for(let i=0;node&&i<4;i++){
   if(node.matches('[data-app-action-sidebar-section]'))return node;
   if(node.children.length!==1)return null;node=node.firstElementChild;
  }return null;};
  let parent,before,project,recent,slot;
  for(let node=section,i=0;node&&node!==source&&i<8;i++,node=node.parentElement){
   const candidate=node.parentElement;if(!candidate||!source.contains(candidate))break;
   const children=[...candidate.children];if(children.length>3)continue;
   const owned=children.filter(n=>isOwnedSurface(n)&&n.hasAttribute('data-va-sidebar-slot'));
   const native=children.filter(n=>!owned.includes(n));
   if(owned.length>1||native.length!==2)continue;
   const sections=native.map(sectionIn);
   if(sections[1]!==section||!sections[0]||sections[0]===section)continue;
   if(owned.length&&children.indexOf(owned[0])!==0)return null;
   [project,recent]=native;before=project;parent=candidate;slot=owned[0]??null;break;
  }
  if(!parent)return null;
  const currentScrollPort=()=>{let scrollPort=null;
  // Flow is required: grid/row-flex/positioned siblings cannot be displaced
  // safely by an inserted block. Require a real native vertical scrollport so
  // displaced Project/history controls remain reachable without new handlers.
  for(let n=parent,depth=0;n&&depth<32&&source.contains(n);n=n.parentElement,depth++){
   const s=win.getComputedStyle(n);
   if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0||s.writingMode!=='horizontal-tb')return null;
   if(s.display!=='contents'&&!['block','flow-root','flex'].includes(s.display))return null;
   if(s.display==='flex'&&(s.flexDirection!=='column'||s.flexWrap!=='nowrap'))return null;
   if(['auto','scroll'].includes(s.overflowY)){scrollPort=n;break;}
  }
  return scrollPort;};
  const scrollPort=currentScrollPort();if(!scrollPort)return null;
  for(const n of [project,recent]){
   const s=win.getComputedStyle(n);if(!['static','relative'].includes(s.position)||s.float!=='none'||s.order!=='0')return null;
  }
  const available=nativeHistoryListRect({document,source,root:scrollPort});
  if(!available&&!slot)return null;
  const start=(slot??before).getBoundingClientRect();
  // Keep structural admission separate from viewport admission. A temporarily
  // clipped slot must not be removed and clamp the native scroll position.
  const height=slot?parseFloat(slot.style.getPropertyValue('--va-slot-height')):Math.max(240,Math.min(560,available.height-160));
  if(!Number.isFinite(height)||height<=0)return null;
  const top=available?Math.max(available.y,start.top):0;
  const proposed=available?{x:available.x,y:top,width:available.width,height:Math.max(0,Math.min(start.top+height,available.y+available.height)-top)}:null;
  const sameAnchor=()=>parent.isConnected&&before.parentElement===parent&&recent.parentElement===parent&&source.contains(parent)&&sectionIn(recent)===section;
  return {parent,before,project,recent,scrollPort,slot,rect:visibleSlot(proposed)?proposed:null,height,minHeight:128,maxHeight:Math.max(240,Math.min(560,scrollPort.clientHeight-160)),
   measure(owned){
    if(currentScrollPort()!==scrollPort||!sameAnchor()||parent.children.length!==3||!owned?.isConnected||owned.parentElement!==parent||owned.nextElementSibling!==before||owned.previousElementSibling!==null||before.nextElementSibling!==recent||!isOwnedSurface(owned))return null;
    for(let n=owned,depth=0;n;n=n.parentElement){if(++depth>128||n.hidden||n.inert||n.getAttribute('aria-hidden')==='true'&&n!==owned)return null;const s=win.getComputedStyle(n);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)return null;}
    const rect=nativeHistoryListRect({document,source,root:owned});
    if(!visibleSlot(rect)||!historyRectangleClear(source,[owned],rect,null))return null;
    // The clipped window is not a new layout viewport. Keep the complete owned
    // slot coordinates so native scrolling moves our content by the same amount
    // as its neighbors, instead of resizing/restarting the iframe at the clip.
    const full=owned.getBoundingClientRect();
    const scrollRect=nativeHistoryListRect({document,source,root:scrollPort});if(!scrollRect)return null;
    return {...rect,scrollRect,contentRect:{x:full.x,y:full.y,width:full.width,height:full.height}};
   }};
 }catch{return null;}
}

export const historyFailureReasons=Object.freeze(['source','hidden','ancestor-limit','visibility','geometry','sibling-limit','sibling-text','sibling-overlap','node-limit','tag','editable','row-structure','role','namespace','link','button','tabindex','outside-text','row-count','exception','source-replaced','list-count','row-limit','row-replaced','row-order','offscreen','row-gap']);
const rejected=(report,reason)=>{try{report?.(reason);}catch{}return false;};
// The list can extend below its native scrollport. Only its visible rectangle
// may be replaced; the scroll container and neighboring native controls stay.
export function nativeHistoryListRect({document,source,root,includeClipped=false}){
 try{
  if(!source?.contains(root)||!root?.isConnected||root.ownerDocument!==document)return null;
  const win=document.defaultView,b=root.getBoundingClientRect(),s=source.getBoundingClientRect();
  let left=Math.max(0,b.left),top=Math.max(0,b.top),right=Math.min(win.innerWidth,b.right),bottom=Math.min(win.innerHeight,b.bottom),depth=0;
  for(let n=root.parentElement;n;n=n.parentElement){
   if(++depth>128)return null;
   const css=win.getComputedStyle(n);
   if(!['none','matrix(1, 0, 0, 1, 0, 0)'].includes(css.transform)||['translate','rotate','scale'].some(k=>css[k]!=='none')||css.zoom!=='1')return null;
   if(css.display==='contents')continue;
   const clipX=['auto','scroll','hidden','clip'].includes(css.overflowX),clipY=['auto','scroll','hidden','clip'].includes(css.overflowY);
   if(!clipX&&!clipY)continue;
   const r=n.getBoundingClientRect();
   // Client dimensions cannot describe a scaled or rotated scrollport.
   if(Math.abs(r.width-n.offsetWidth)>1||Math.abs(r.height-n.offsetHeight)>1)return null;
   if(clipX){left=Math.max(left,r.left+n.clientLeft);right=Math.min(right,r.left+n.clientLeft+n.clientWidth);}
   if(clipY){top=Math.max(top,r.top+n.clientTop);bottom=Math.min(bottom,r.top+n.clientTop+n.clientHeight);}
  }
  if(![left,top,right,bottom].every(Number.isFinite))return null;
  const positiveX=right>left,positiveY=bottom>top;
  if(!includeClipped&&(!positiveX||!positiveY)||positiveX&&(left<s.left||right>s.right)||positiveY&&(top<s.top||bottom>s.bottom))return null;
  return {x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
 }catch{return null;}
}
// This recognizer proves a presentation subtree only. Links still enter the
// ordinary native discovery path; neither row markers nor labels prove membership.
export function nativeHistoryListOK({document,source,root,urlPolicy,isOwnedMask=()=>false,allowClipped=false,onFailure=null}){
 try{
  if(!source||!root||![source,root].every(n=>n.isConnected&&n.ownerDocument===document)||!source.contains(root)||root.hidden||root.inert||root.getAttribute('aria-hidden')==='true')return rejected(onFailure,'source');
  let ancestor=root,depth=0;
  while(ancestor){
   if(++depth>128)return rejected(onFailure,'ancestor-limit');if(ancestor.hidden||ancestor.inert||ancestor.getAttribute('aria-hidden')==='true')return rejected(onFailure,'hidden');
   const style=document.defaultView.getComputedStyle(ancestor);
   if(style.display==='none'||style.visibility==='collapse'||style.visibility==='hidden'&&!isOwnedMask(ancestor)||Number(style.opacity)===0)return rejected(onFailure,'visibility');
   ancestor=ancestor.parentElement;
  }
  // The overlay rectangle must not cover native siblings outside the pure list.
  const visible=nativeHistoryListRect({document,source,root,includeClipped:allowClipped});if(!visible)return rejected(onFailure,'geometry');
  const box={left:visible.x,top:visible.y,right:visible.x+visible.width,bottom:visible.y+visible.height};
  let sibling=source,visited=0;
  while(sibling){
   if(++visited>2048)return rejected(onFailure,'sibling-limit');
   if(sibling!==root&&sibling.contains(root)&&[...sibling.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return rejected(onFailure,'sibling-text');
   if(sibling!==root&&!sibling.contains(root)){
    const rect=sibling.getBoundingClientRect();
    if(visible.width>0&&visible.height>0&&rect.width>0&&rect.height>0&&rect.left<box.right&&rect.right>box.left&&rect.top<box.bottom&&rect.bottom>box.top)return rejected(onFailure,'sibling-overlap');
   }
   if(sibling!==root&&sibling.firstElementChild){sibling=sibling.firstElementChild;continue;}
   while(sibling!==source&&!sibling.nextElementSibling)sibling=sibling.parentElement;
   sibling=sibling===source?null:sibling.nextElementSibling;
  }
  const rows=new Map(),ids=new Set();let node=root,count=0;
  // A finite mounted list, not an unbounded account-history traversal.
  while(node){
   if(++count>2048)return rejected(onFailure,'node-limit');
   const row=node.closest('[data-sidebar-chatgpt-conversation-key]');
   const inRow=row&&root.contains(row);
   if(node.nodeType===1){
    const tag=node.tagName.toUpperCase();
    if(!inRow&&tag!=='DIV'||inRow&&!['DIV','SPAN','A','BUTTON','SVG','PATH','USE','G','TITLE'].includes(tag))return rejected(onFailure,'tag');
    if(node.hasAttribute('contenteditable')&&node.getAttribute('contenteditable')!=='false'||['INPUT','TEXTAREA','SELECT','IFRAME','OBJECT','EMBED'].includes(node.tagName))return rejected(onFailure,'editable');
    if(node.hasAttribute('data-sidebar-chatgpt-conversation-key')){
     if(node.getAttribute('role')!=='listitem'||node.parentElement?.closest('[data-sidebar-chatgpt-conversation-key]'))return rejected(onFailure,'row-structure');
     rows.set(node,{links:0,menu:0,pin:0});
    }
    const role=node.getAttribute('role');
    if(role!==null&&!['list','listitem','group','img','presentation','none'].includes(role))return rejected(onFailure,'role');
    if(['A','BUTTON'].includes(tag)&&node.namespaceURI!=='http://www.w3.org/1999/xhtml')return rejected(onFailure,'namespace');
    if(tag==='A'){
     if(!inRow||!rows.has(row))return rejected(onFailure,'row-structure');
     const target=urlPolicy.parse(node.getAttribute('href'));
     if(target.kind!=='conversation'||!target.conversationId||ids.has(target.conversationId))return rejected(onFailure,'link');
     ids.add(target.conversationId);rows.get(row).links++;
    }else if(tag==='BUTTON'){
     if(!inRow||!rows.has(row))return rejected(onFailure,'row-structure');
     // Exact labels from the observed Chinese host variant, not fuzzy action inference.
     const label=node.getAttribute('aria-label'),popup=node.getAttribute('aria-haspopup'),entry=rows.get(row);
     if(label==='聊天操作'&&popup==='menu')entry.menu++;
     else if(['置顶聊天','取消置顶聊天'].includes(label)&&popup===null)entry.pin++;
     else return rejected(onFailure,'button');
    }else if(node.hasAttribute('tabindex')&&node.getAttribute('tabindex')!=='-1')return rejected(onFailure,'tabindex');
    if(!inRow&&[...node.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return rejected(onFailure,'outside-text');
   }
   if(node.firstElementChild){node=node.firstElementChild;continue;}
   while(node!==root&&!node.nextElementSibling)node=node.parentElement;
   node=node===root?null:node.nextElementSibling;
  }
  return rows.size>0&&[...rows.values()].every(r=>r.links===1&&r.menu<=1&&r.pin<=1)||rejected(onFailure,'row-count');
 }catch{return rejected(onFailure,'exception');}
}

// Native lists may interleave several unmarked rows with stable rows. The
// presentation owns one consecutive run, not the entire discovery source. Keep
// all other rows native; neither their markers nor this choice imply membership.
export function nativeHistoryPresentation(options){
 const {document,source,root,preferredMaskRoots=null}=options;
 const fail=reason=>{rejected(options.onFailure,reason);return null;};
 try{
  if(!root||!source?.contains(root))return fail('source');
  const lists=root.matches('[role="list"]')?[root]:[...root.querySelectorAll('[role="list"]')];
  // Once the native list exposes explicit rows, keep row masks even after
  // loading/local rows disappear. Switching to the containing root would
  // invalidate an otherwise unchanged mount. Legacy pure roots stay supported.
  if(!lists.length||preferredMaskRoots?.length===1&&preferredMaskRoots[0]===root)return nativeHistoryListOK(options)?{rect:nativeHistoryListRect(options),maskRoots:[root],complete:true}:null;
  if(lists.length!==1)return fail('list-count');
  const children=[...lists[0].children];if(children.length>256)return fail('row-limit');
  let stable=preferredMaskRoots;
  if(stable===null){
   // Deterministic initial selection. Do not bridge gaps or expand the rectangle
   // over unknown native controls. A mounted selection is never silently moved.
   stable=[];let run=[];
   for(const child of children){
    if(child.hasAttribute('data-sidebar-chatgpt-conversation-key')){run.push(child);if(run.length>stable.length)stable=[...run];}
    else run=[];
   }
  }
  if(!stable.every(n=>children.includes(n)&&n.hasAttribute('data-sidebar-chatgpt-conversation-key')))return fail('row-replaced');
  if(!stable.length||!stable.every((node,index)=>children.indexOf(node)===children.indexOf(stable[0])+index))return fail('row-order');
  const visible=stable.map(node=>({node,rect:nativeHistoryListRect({document,source,root:node})})).filter(x=>x.rect);
  // Mask identity follows the proved native row run, not the viewport.
  // Scrolling only changes its clipped rectangle. Offscreen validation is
  // presentation purity only; discovery still applies its visible-only gate.
  if(!visible.length)return fail('offscreen');if(stable.some(node=>!nativeHistoryListOK({...options,root:node,allowClipped:true})))return null;
  const first=visible[0].rect,last=visible.at(-1).rect;
  for(let i=1;i<visible.length;i++){
   const a=visible[i-1].rect,b=visible[i].rect;
   if(Math.abs(a.x-b.x)>0.5||Math.abs(a.width-b.width)>0.5||Math.abs(a.y+a.height-b.y)>0.5)return fail('row-gap');
  }
  return {rect:{x:first.x,y:first.y,width:first.width,height:last.y+last.height-first.y},maskRoots:stable,complete:stable.length===children.length};
 }catch{return fail('exception');}
}

// This recognizer proves a presentation subtree only. Links still enter the
// ordinary native discovery path; neither row markers nor labels prove membership.
export function nativeHistoryListOK({document,source,root,urlPolicy,isOwnedMask=()=>false}){
 try{
  if(!source||!root||![source,root].every(n=>n.isConnected&&n.ownerDocument===document)||!source.contains(root)||root.hidden||root.inert||root.getAttribute('aria-hidden')==='true')return false;
  let ancestor=root,depth=0;
  while(ancestor){
   if(++depth>128||ancestor.hidden||ancestor.inert||ancestor.getAttribute('aria-hidden')==='true')return false;
   const style=document.defaultView.getComputedStyle(ancestor);
   if(style.display==='none'||style.visibility==='collapse'||style.visibility==='hidden'&&!isOwnedMask(ancestor)||Number(style.opacity)===0)return false;
   ancestor=ancestor.parentElement;
  }
  // The overlay rectangle must not cover native siblings outside the pure list.
  const box=root.getBoundingClientRect();
  if(![box.left,box.top,box.right,box.bottom].every(Number.isFinite)||box.width<=0||box.height<=0)return false;
  const sourceBox=source.getBoundingClientRect(),view=document.defaultView;
  if(box.left<Math.max(0,sourceBox.left)||box.top<Math.max(0,sourceBox.top)||box.right>Math.min(view.innerWidth,sourceBox.right)||box.bottom>Math.min(view.innerHeight,sourceBox.bottom))return false;
  let sibling=source,visited=0;
  while(sibling){
   if(++visited>2048)return false;
   if(sibling!==root&&sibling.contains(root)&&[...sibling.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return false;
   if(sibling!==root&&!sibling.contains(root)){
    const rect=sibling.getBoundingClientRect();
    if(rect.width>0&&rect.height>0&&rect.left<box.right&&rect.right>box.left&&rect.top<box.bottom&&rect.bottom>box.top)return false;
   }
   if(sibling!==root&&sibling.firstElementChild){sibling=sibling.firstElementChild;continue;}
   while(sibling!==source&&!sibling.nextElementSibling)sibling=sibling.parentElement;
   sibling=sibling===source?null:sibling.nextElementSibling;
  }
  const rows=new Map(),ids=new Set();let node=root,count=0;
  // A finite mounted list, not an unbounded account-history traversal.
  while(node){
   if(++count>2048)return false;
   const row=node.closest('[data-sidebar-chatgpt-conversation-key]');
   const inRow=row&&root.contains(row);
   if(node.nodeType===1){
    const tag=node.tagName.toUpperCase();
    if(!inRow&&tag!=='DIV'||inRow&&!['DIV','SPAN','A','BUTTON','SVG','PATH','USE','G','TITLE'].includes(tag))return false;
    if(node.hasAttribute('contenteditable')&&node.getAttribute('contenteditable')!=='false'||['INPUT','TEXTAREA','SELECT','IFRAME','OBJECT','EMBED'].includes(node.tagName))return false;
    if(node.hasAttribute('data-sidebar-chatgpt-conversation-key')){
     if(node.getAttribute('role')!=='listitem'||node.parentElement?.closest('[data-sidebar-chatgpt-conversation-key]'))return false;
     rows.set(node,{links:0,menu:0,pin:0});
    }
    const role=node.getAttribute('role');
    if(role!==null&&!['list','listitem','group','img','presentation','none'].includes(role))return false;
    if(['A','BUTTON'].includes(tag)&&node.namespaceURI!=='http://www.w3.org/1999/xhtml')return false;
    if(tag==='A'){
     if(!inRow||!rows.has(row))return false;
     const target=urlPolicy.parse(node.getAttribute('href'));
     if(target.kind!=='conversation'||!target.conversationId||ids.has(target.conversationId))return false;
     ids.add(target.conversationId);rows.get(row).links++;
    }else if(tag==='BUTTON'){
     if(!inRow||!rows.has(row))return false;
     // Exact labels from the observed Chinese host variant, not fuzzy action inference.
     const label=node.getAttribute('aria-label'),popup=node.getAttribute('aria-haspopup'),entry=rows.get(row);
     if(label==='聊天操作'&&popup==='menu')entry.menu++;
     else if(['置顶聊天','取消置顶聊天'].includes(label)&&popup===null)entry.pin++;
     else return false;
    }else if(node.hasAttribute('tabindex')&&node.getAttribute('tabindex')!=='-1')return false;
    if(!inRow&&[...node.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return false;
   }
   if(node.firstElementChild){node=node.firstElementChild;continue;}
   while(node!==root&&!node.nextElementSibling)node=node.parentElement;
   node=node===root?null:node.nextElementSibling;
  }
  return rows.size>0&&[...rows.values()].every(r=>r.links===1&&r.menu<=1&&r.pin<=1);
 }catch{return false;}
}

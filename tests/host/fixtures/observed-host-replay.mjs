import baseline from './observed-host-baseline.json' with {type:'json'};
import {observedDesktopHTML} from './observed-desktop.mjs';
// Versioned, sanitized reconstruction of observed boundaries. NOT a captured
// ChatGPT DOM, event recording, source permission, identity or acceptance claim.
export const HOST_BASELINE_VERSION=baseline.version;
export const visibilityWakeAttributes=Object.freeze(baseline.replays.visibilityWakeAttributes);
export const progressiveOrders=Object.freeze(baseline.replays.progressiveOrders);
export const homeMain='<div data-app-shell-main-content-layout><div role="main"><div class="home-composer-anchor" style="position:absolute;top:52px;width:780px;height:250px"><h1>Welcome</h1></div><form data-chatgpt-composer data-composer-placement="home" style="position:absolute;top:302px;width:780px;height:70px"><textarea>fixture draft</textarea><button type="button">Native tools</button></form></div></div>';
export const observedHomeHTML=id=>observedDesktopHTML(id).replace(/<main>[\s\S]*<\/main>/,'<main>'+homeMain+'</main>');
// Reconstruct the reported zero-height retained branch in the existing home
// fixture. Only the path/rectangles came from the real receipt; these styles
// and the empty descendants are test inputs, not a captured native subtree.
// Negative cases fill it with overflowing content in the existing runner.
export function materializeFlatHomeBranch(){
 const outer=document.querySelector('[data-app-shell-main-content-layout]'),root=outer.querySelector('[role=main]'),reading=root.querySelector('.home-composer-anchor'),composer=root.querySelector('form');
 // Preserve the fixture's separate titlebar hit background; the reported
 // flow root starts below it. Moving that background to y=52 would invent a
 // native return-gap failure unrelated to this retained-member report.
 outer.style.cssText='position:fixed;left:241px;top:0;width:calc(100vw - 240px);height:100vh;box-sizing:border-box;padding-top:52px';
 root.style.cssText='position:relative;width:100%;height:calc(100% - 16px)';
 const header=document.querySelector('header[data-app-shell-titlebar]');header.style.cssText='left:241px;width:calc(100vw - 241px)';header.firstElementChild.style.width='100%';
 const shell=document.createElement('div'),band=document.createElement('div'),branch=document.createElement('div');
 shell.style.display='contents';band.style.cssText='display:grid;grid-template-columns:1fr;grid-template-rows:1fr;align-items:start;height:504px';
 reading.style.cssText='position:relative;display:flow-root;width:100%;height:325px';
 composer.style.cssText='position:relative;grid-area:1/1;justify-self:center;width:min(768px,calc(100% - 48px));height:52px;margin:0';
 branch.id='fixture-flat-native-member';branch.style.cssText='grid-area:1/1;justify-self:center;width:min(808px,100%);height:0';
 const leaf=document.createElement('div');leaf.id='fixture-flat-native-leaf';leaf.style.cssText='width:10px;height:0';branch.append(leaf);
 band.append(composer,branch);shell.append(reading,band);root.append(shell);
}
export const longDesktopHTML=id=>observedDesktopHTML(id).replace('Fixture text','Fixture text'+'<span>x</span>'.repeat(3000));
// Browser-side operations are fixture-only functions, passed to existing
// Playwright runners. Assertions and grant/owner actions remain in the runners.
export function retainHiddenTitlebar(){
 const cached=document.createElement('div');cached.id='cached-native-titlebar';cached.hidden=true;
 cached.append(document.querySelector('[data-app-shell-titlebar]:has([data-app-shell-main-titlebar])').cloneNode(true));document.body.append(cached);
}
export function prepareHistoryRun(){
 const list=document.querySelector('#list'),first=list.firstElementChild,second=first.cloneNode(true);
 list.setAttribute('role','list');second.dataset.sidebarChatgptConversationKey='second';
 second.querySelector('a').href='/c/55555555-5555-4555-8555-555555555555';second.querySelector('[data-thread-title]').textContent='Native reordered';list.append(second);
}
export function reorderHistory(){const list=document.querySelector('#list');list.prepend(list.lastElementChild);}
export function addPendingChat(){
 const row=document.createElement('div');row.id='fixture-pending-chat';row.textContent='Pending chat';
 document.querySelector('#list').prepend(row);
}
export function promotePendingChat({id}){
 const list=document.querySelector('#list'),pending=document.querySelector('#fixture-pending-chat'),row=list.querySelector('[data-sidebar-chatgpt-conversation-key]').cloneNode(true);
 row.dataset.sidebarChatgptConversationKey='new-stable';row.querySelector('a').href='/c/'+id;row.querySelector('[data-thread-title]').textContent='Native newly stable';
 pending.replaceWith(row);
 // Previously pinned rows change order independently of the new stable row.
 list.append(list.children[1]);
}
export function enterStableChat({html,id}){
 const native=new DOMParser().parseFromString(html,'text/html');
 document.querySelector('main').replaceWith(native.querySelector('main'));
 history.pushState({},'','/c/'+id);
}
export function setNativeModal(open){
 if(open){for(const node of [document.querySelector('main'),document.querySelector('nav')]){if(!node)throw Error('missing-modal-background');node.setAttribute('aria-hidden','true');node.inert=true;}
 const dialog=document.createElement('dialog');dialog.id='fixture-native-modal';dialog.setAttribute('aria-modal','true');dialog.textContent='Native search fixture';document.body.append(dialog);dialog.showModal();
 }else{document.querySelector('#fixture-native-modal').remove();for(const node of [document.querySelector('main'),document.querySelector('nav')]){node.removeAttribute('aria-hidden');node.inert=false;}}
}

// Independent safety counterexample: an unknown row overlaps a stable run.
// This reconstructed geometry is not part of the real anonymous r94 capture.
export function insertHistoryGap(){
 const list=document.querySelector('#list'),row=document.createElement('div');
 row.id='fixture-history-gap';row.textContent='Native pending row';
 const b=list.firstElementChild.getBoundingClientRect();row.style.cssText='position:fixed;left:'+b.x+'px;top:'+(b.y+1)+'px;width:'+b.width+'px;height:20px';list.firstElementChild.after(row);
}
export function clearHistoryGap(){document.querySelector('#fixture-history-gap').remove();}

// Actual direct-row marker order from the one-time r94 anonymous observation.
// Contents/geometry are synthetic; unmarked rows have no assumed native meaning.
export function materializeHistoryStructure(markers){
 const list=document.querySelector('#list'),template=list.querySelector('[data-sidebar-chatgpt-conversation-key]').cloneNode(true);
 list.setAttribute('role','list');list.style.height='auto';list.replaceChildren();
 markers.forEach((stable,index)=>{
  let row;
  if(stable){row=template.cloneNode(true);row.dataset.sidebarChatgptConversationKey='fixture-'+index;
   row.querySelector('a').href='/c/'+String(index+1).padStart(8,'0')+'-1111-4111-8111-111111111111';
   row.querySelector('[data-thread-title]').textContent=index===0?'Known latest fixture':'Known fixture '+index;
  }else{row=document.createElement('div');row.setAttribute('role','listitem');const control=document.createElement('button');control.textContent='Unknown native control '+index;row.append(control);}
  row.style.height='30px';list.append(row);
 });
}

// Replays the received 95-row tree without filling any omitted descendants.
// Native Project rectangles are translated as a group; the history fixture and
// scrollport are explicit offline layout inputs, not inferred website behavior.
export function materializePartitionedSidebar(rows){
 const nav=document.querySelector('nav'),history=nav.firstElementChild,nodes=[];
 nav.style.cssText='width:240px;height:calc(100vh - 52px);overflow:auto';
 document.querySelector('[data-slate-sidebar-content]').style.width='240px';
 const attrs=['data-sidebar-chatgpt-conversation-key','data-app-action-sidebar-section','href','aria-expanded','aria-controls','tabindex'];
 for(let index=0;index<rows.length;index++){
  const [parent,,tag,role,flags,,rect]=rows[index],n=document.createElement(tag==='OTHER'?'div':tag.toLowerCase());
  if(role!=='absent')n.setAttribute('role',role);
  attrs.forEach((attr,bit)=>{if(flags&(1<<bit))n.setAttribute(attr,attr==='href'?'#fixture':attr==='tabindex'?'0':'fixture');});
  n.dataset.fixtureStructureRow=String(index);nodes.push(n);if(parent>=0)nodes[parent].append(n);
  if(index>1&&index<92){const p=rows[parent][6];n.style.cssText=`position:absolute;box-sizing:border-box;margin:0;padding:0;border:0;left:${rect[0]-p[0]}px;top:${rect[1]-p[1]}px;width:${rect[2]}px;height:${rect[3]}px`;}
 }
 nodes[1].style.cssText='position:relative;height:151px;width:240px';
 nodes[94].replaceWith(history);history.querySelector('#heading').style.height='40px';
 const prefix=document.createElement('div');prefix.style.height='80px';prefix.textContent='Native brand / controls';
 nav.replaceChildren(prefix,nodes[0]);
 if(!document.querySelector('main[data-app-shell-main-surface]'))for(const n of document.querySelectorAll('header,[data-app-shell-main-content-layout],[data-app-action-timeline-scroll]'))n.style.left='260px';
 window.partitionedFixture={root:nodes[0],project:nodes[1],recent:nodes[92],control:nodes[7],scroll:nav};
}

import baseline from './observed-host-baseline.json' with {type:'json'};
import {observedDesktopHTML} from './observed-desktop.mjs';
// Versioned, sanitized reconstruction of observed boundaries. NOT a captured
// ChatGPT DOM, event recording, source permission, identity or acceptance claim.
export const HOST_BASELINE_VERSION=baseline.version;
export const visibilityWakeAttributes=Object.freeze(baseline.replays.visibilityWakeAttributes);
export const progressiveOrders=Object.freeze(baseline.replays.progressiveOrders);
export const homeMain='<div data-app-shell-main-content-layout><div role="main"><div class="home-composer-anchor" style="position:absolute;top:52px;width:780px;height:250px"><h1>Welcome</h1></div><form data-chatgpt-composer data-composer-placement="home" style="position:absolute;top:302px;width:780px;height:70px"><textarea>fixture draft</textarea><button type="button">Native tools</button></form></div></div>';
export const observedHomeHTML=id=>observedDesktopHTML(id).replace(/<main>[\s\S]*<\/main>/,'<main>'+homeMain+'</main>');
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

// A local counterexample for the recorded r93 startup failure category. Exact
// real row order is unknown: these timings test the preparation contract only.
export function insertHistoryGap(){
 const list=document.querySelector('#list'),row=document.createElement('div');
 row.id='fixture-history-gap';row.textContent='Native pending row';
 list.firstElementChild.after(row);
}
export function clearHistoryGap(){document.querySelector('#fixture-history-gap').remove();}

import { digest } from '../src/data/hash.mjs';
import { env } from './environment.mjs';
import { syntheticURL } from './data.mjs';
/** Semantic/geometry mapping for the SYNTHETIC host only. No production ChatGPT selectors. */
export function createAdapter(doc=document) {
  let hrefContext='',here=null;const hrefCache=new Map();
  const one=selector=>{const nodes=doc.querySelectorAll(selector);return nodes.length===1?nodes[0]:null;};
  return {
    inspect(){
      if(!syntheticURL(env.location.href))return {ok:false,reason:'not-synthetic-origin'};
      const history=one('aside[aria-label="Sidebar"] nav[aria-label="Chat history"]'),header=one('main header[aria-label="Chat actions"]'),reading=one('main section[aria-label="Conversation"]');
      if(!history||!header||!reading)return {ok:false,reason:'missing-or-ambiguous-native-boundary'};
      // Growing native content has priority over an extra control. Do not shrink it
      // to create an apparently free slot around an already mounted return button.
      if([...header.children].some(n=>!n.hasAttribute('data-vaiwl-owned')&&
        getComputedStyle(n).display!=='none'&&parseFloat(getComputedStyle(n).flexGrow)>0&&n.textContent.trim()))
        return {ok:false,reason:'native-content-occupies-header'};
      const box=header.getBoundingClientRect();
      const occupied=[...header.children].filter(n=>!n.hasAttribute('data-vaiwl-owned')&&!n.classList.contains('header-space')).reduce((n,e)=>n+e.getBoundingClientRect().width,0);
      const style=getComputedStyle(header),count=[...header.children].filter(n=>!n.hasAttribute('data-vaiwl-owned')&&!n.classList.contains('header-space')).length;
      const free=box.width-occupied-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-(parseFloat(style.columnGap)||0)*count;
      if(free<34)return {ok:false,reason:'no-safe-single-return-space'};
      const navigationSlot=doc.querySelector('aside[aria-label="Sidebar"] .nav-scroll > h3.nav-caption');
      return {ok:true,history,header,reading,navigationSlot};
    },
    hasNativeLayer(){return !!doc.querySelector('dialog[open], [popover]:popover-open');},
    isCurrent(raw){const a=new URL(raw),b=new URL(env.location.href);return a.origin===b.origin&&a.pathname===b.pathname&&(!a.pathname.endsWith('/new')||a.searchParams.get('project')===b.searchParams.get('project'));},
    projectCreateHref(project){const links=[...doc.querySelectorAll('a[data-native-project-new][href]')].filter(a=>a.dataset.nativeProjectNew===project.id);return links.length===1&&syntheticURL(links[0].href)&&new URL(links[0].href).origin===env.location.origin?this.nativeHref(links[0].href):null;},
    currentURL:()=>env.location.href,
    // Keep synthetic harness activation/scale on ordinary and modifier-click
    // fallback links. Never change persisted references or a production URL.
    nativeHref(raw){
      const context=env.location.href+'|'+doc.documentElement.dataset.hfSize;if(context!==hrefContext){hrefContext=context;here=new URL(env.location.href);hrefCache.clear();}if(hrefCache.has(raw))return hrefCache.get(raw);
      const u=new URL(raw);if(!syntheticURL(raw)||u.origin!==here.origin)return raw;
      const mode=here.searchParams.get('mode');
      if(['page','mv3'].includes(mode)&&!u.searchParams.has('mode'))u.searchParams.set('mode',mode);
      if(doc.documentElement.dataset.hfSize==='120'&&!u.searchParams.has('size'))u.searchParams.set('size','120');
      const count=Number(here.searchParams.get('f1Refs'));
      if(Number.isSafeInteger(count)&&count>=604&&count<=100000&&!u.searchParams.has('f1Refs'))u.searchParams.set('f1Refs',String(count));
      if(hrefCache.size>=2048)hrefCache.delete(hrefCache.keys().next().value);hrefCache.set(raw,u.href);return u.href;
    },
    openNative(raw,event){
      if(!syntheticURL(raw)||new URL(raw).origin!==env.location.origin)return event.preventDefault();
      if(this.isCurrent(raw)){event.preventDefault();return;}
      const link=[...doc.querySelectorAll('aside a[href]')].find(a=>new URL(a.href).pathname===new URL(raw).pathname&&(!new URL(raw).pathname.endsWith('/new')||new URL(a.href).searchParams.get('project')===new URL(raw).searchParams.get('project')));
      if(link){event.preventDefault();link.click();} // Real host link/handler; otherwise retain ordinary anchor navigation.
    },
    selectedSnippet(ref){
      if(!syntheticURL(env.location.href)||!ref||!this.isCurrent(ref.nativeUrl))return null;
      const selection=doc.getSelection();if(!selection||selection.rangeCount!==1||selection.isCollapsed)return null;
      const range=selection.getRangeAt(0),element=n=>n.nodeType===1?n:n.parentElement,start=element(range.startContainer)?.closest('.message-body'),end=element(range.endContainer)?.closest('.message-body');
      if(!start||start!==end)return null;const message=start.closest('[data-message-id][data-branch-id]'),text=selection.toString(),body=start.textContent;
      if(!message||!text.trim()||text.length>2000||body.indexOf(text)<0||body.indexOf(text)!==body.lastIndexOf(text))return null;
      const messages=[...doc.querySelectorAll('main section[aria-label="Conversation"] [data-message-id][data-branch-id]')].filter(n=>n.dataset.messageId===message.dataset.messageId&&n.dataset.branchId===message.dataset.branchId);
      if(messages.length!==1)return null;
      return {refId:ref.id,messageId:message.dataset.messageId,branchId:message.dataset.branchId,text,bodyHash:digest(body)};
    },
    restoreSnippet(ref,anchor){
      if(!syntheticURL(env.location.href)||!this.isCurrent(ref.nativeUrl)||anchor.refId!==ref.id)return {ok:false,reason:'wrong-native-target'};
      const messages=[...doc.querySelectorAll('main section[aria-label="Conversation"] [data-message-id][data-branch-id]')].filter(n=>n.dataset.messageId===anchor.messageId&&n.dataset.branchId===anchor.branchId);
      const body=messages.length===1?messages[0].querySelector('.message-body'):null;
      if(!body||digest(body.textContent)!==anchor.bodyHash||body.textContent.indexOf(anchor.text)<0||body.textContent.indexOf(anchor.text)!==body.textContent.lastIndexOf(anchor.text))return {ok:false,reason:'non-unique-or-changed-anchor'};
      messages[0].scrollIntoView({block:'center',behavior:'auto'});return {ok:true};
    },
    status(value){doc.documentElement.dataset.vaiwlHfState=value.state;doc.documentElement.dataset.vaiwlHfReason=value.reason??'';doc.documentElement.dataset.vaiwlHfScope=value.scope??'';}
  };
}

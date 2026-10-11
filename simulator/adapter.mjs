import { env } from './environment.mjs';
import { syntheticURL } from './data.mjs';
/** Semantic/geometry mapping for the SYNTHETIC host only. No production ChatGPT selectors. */
export function createAdapter(doc=document) {
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
    isCurrent(raw){const a=new URL(raw),b=new URL(env.location.href);return a.origin===b.origin&&a.pathname===b.pathname;},
    currentURL:()=>env.location.href,
    // Keep synthetic harness activation/scale on ordinary and modifier-click
    // fallback links. Never change persisted references or a production URL.
    nativeHref(raw){
      const u=new URL(raw),here=new URL(env.location.href);
      if(!syntheticURL(raw)||u.origin!==here.origin)return raw;
      const mode=here.searchParams.get('mode');
      if(['page','mv3'].includes(mode)&&!u.searchParams.has('mode'))u.searchParams.set('mode',mode);
      if(doc.documentElement.dataset.hfSize==='120'&&!u.searchParams.has('size'))u.searchParams.set('size','120');
      return u.href;
    },
    openNative(raw,event){
      if(!syntheticURL(raw)||new URL(raw).origin!==env.location.origin)return event.preventDefault();
      if(this.isCurrent(raw)){event.preventDefault();return;}
      const link=[...doc.querySelectorAll('aside a[href]')].find(a=>new URL(a.href).pathname===new URL(raw).pathname);
      if(link){event.preventDefault();link.click();} // Real host link/handler; otherwise retain ordinary anchor navigation.
    },
    status(value){doc.documentElement.dataset.vaiwlHfState=value.state;doc.documentElement.dataset.vaiwlHfReason=value.reason??'';doc.documentElement.dataset.vaiwlHfScope=value.scope??'';}
  };
}

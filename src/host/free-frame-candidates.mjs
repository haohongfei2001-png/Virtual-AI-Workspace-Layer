import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
const css=`:host{display:block;font:calc(14px * var(--vaiwl-font-scale,1))/1.5 var(--vaiwl-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif);color:var(--ink,#202123)}section{padding:12px;background:var(--surface,#fff)}h2{font-size:calc(14px * var(--vaiwl-font-scale,1));font-weight:550;margin:0 0 8px}ul{list-style:none;margin:0;padding:0;max-height:30vh;overflow:auto}li{padding:8px 0;border-top:1px solid var(--line,#e5e5e5);overflow-wrap:anywhere}button{font:inherit;color:inherit;border:1px solid var(--line,#e5e5e5);background:var(--bubble,#f4f4f4);border-radius:8px;padding:6px 10px;max-width:100%;overflow-wrap:anywhere;text-align:left;cursor:pointer}button:focus-visible{outline:2px solid var(--focus,#3877ba);outline-offset:2px}button:disabled,button[aria-disabled="true"]{opacity:.5;cursor:default}p{font-size:calc(12px * var(--vaiwl-font-scale,1));color:var(--muted,#646464);margin:5px 0 0}`;
function validated(items){if(!Array.isArray(items)||items.length>32)throw Error('invalid-frame-candidates');const keys=new Set();return items.map(item=>{if(!exactHostRecord(item,['renderKey','nativeTitle','titleState','available','reason'])||typeof item.renderKey!=='string'||!item.renderKey.startsWith('candidate:')||!tokenOK(item.renderKey.slice(10))||keys.has(item.renderKey)||!['exact','unavailable','over-limit'].includes(item.titleState)||(item.titleState==='exact'?(typeof item.nativeTitle!=='string'||!item.nativeTitle.trim()||item.nativeTitle.length>200):item.nativeTitle!==null)||typeof item.available!=='boolean'||!(item.reason===null||typeof item.reason==='string'&&/^[a-z0-9-]{1,80}$/.test(item.reason)))throw Error('invalid-frame-candidates');keys.add(item.renderKey);return Object.freeze({...item});});}
function validatedPage(page,count){if(!exactHostRecord(page,['offset','total','nextOffset'])||!Number.isSafeInteger(page.offset)||page.offset<0||page.offset%32!==0||!Number.isSafeInteger(page.total)||page.total<0||page.offset>(page.total? page.total-1:0)||count!==Math.min(32,page.total-page.offset)||page.nextOffset!==(page.offset+count<page.total?page.offset+count:null))throw Error('invalid-frame-candidate-page');return {...page};}
/** Temporary native controls, never canonical projects or persistent IDs. */
export function createFreeFrameCandidates({document:doc,container,role='workspace',onActivate,onPageRequest=()=>{},onLayoutChange=()=>{}}={}){
 if(!doc?.createElement||!container?.append||typeof onActivate!=='function'||typeof onPageRequest!=='function'||typeof onLayoutChange!=='function'||!['workspace','sidebar'].includes(role))throw Error('invalid-frame-candidate-ui');let host=null,mounted=null,emptyPage=null,stopped=false,generation=0,sizeObserver=null;
 const styles=css+(role==='sidebar'?'ul{max-height:none;overflow:visible}':'');
 // The sidebar is a natural-height flow member; only native NAV scrolls.
 // Async action feedback and font/width changes also alter its intrinsic size.
 function watchSize(section){
  const Observer=doc.defaultView?.ResizeObserver;if(role!=='sidebar'||typeof Observer!=='function')return;
  const run=generation;sizeObserver=new Observer(()=>{if(!stopped&&generation===run)onLayoutChange();});sizeObserver.observe(section);
 }
 const scrollValue=value=>Number.isFinite(value)?Math.max(0,Math.min(1e7,value)):0;
 const hasLayout=list=>list?.getClientRects?.().length!==0;
 // Hidden owned panels report zero scroll even though the user's position is
 // still meaningful. Keep only this mounted page's last laid-out measurement.
 function trackPosition(entry){
  const apply=()=>{if(mounted!==entry||stopped||!hasLayout(entry.list))return;entry.list.scrollTop=entry.savedScroll;entry.savedScroll=scrollValue(entry.list.scrollTop);entry.layoutObserver?.disconnect();entry.layoutObserver=null;};
  entry.list.addEventListener('scroll',()=>{if(mounted===entry&&!stopped&&hasLayout(entry.list)&&!entry.layoutObserver)entry.savedScroll=scrollValue(entry.list.scrollTop);},{passive:true});
  const interrupt=event=>{if(event.isTrusted===true&&mounted===entry&&entry.layoutObserver&&hasLayout(entry.list)){entry.layoutObserver.disconnect();entry.layoutObserver=null;entry.savedScroll=scrollValue(entry.list.scrollTop);}};
  for(const type of ['pointerdown','wheel','keydown'])entry.list.addEventListener(type,interrupt,{passive:true});
  if(hasLayout(entry.list)){apply();return;}
  const Observer=doc.defaultView?.ResizeObserver;
  if(typeof Observer==='function'){const observer=new Observer(()=>{if(entry.layoutObserver===observer)apply();});entry.layoutObserver=observer;observer.observe(entry.list);}
 }
 const node=(tag,text='')=>{const n=doc.createElement(tag);n.textContent=text;return n;};
 function clear(){generation++;sizeObserver?.disconnect();sizeObserver=null;mounted?.layoutObserver?.disconnect();host?.remove();host=null;mounted=null;emptyPage=null;}
 // Only transfer focus still owned by this document and this exact panel.
 // Pending paging uses aria-disabled so the browser retains the focused node;
 // the existing singleflight guards prevent repeat activation.
 function focusedControl(){
  if(!mounted||doc.hasFocus?.()===false||doc.activeElement!==host)return null;
  const active=mounted.shadow.activeElement;
  for(const [key,button]of mounted.controls)if(button===active)return key;
  return null;
 }
 function restoreControl(key,heading){
  if(!key)return;
  const preferred=mounted.controls.get(key);
  const target=preferred&&!preferred.disabled?preferred:[...mounted.buttons.values()].find(button=>!button.disabled)??heading;
  target?.focus?.({preventScroll:true});
 }
 function showError(offset){
  if(stopped)return;
  if(!Number.isSafeInteger(offset)||offset<0||offset%32!==0)throw Error('invalid-candidate-offset');
  const focus=focusedControl();clear();const run=generation;let pending=false;
  host=node('div');host.setAttribute('data-vaiwl-candidates','');
  const shadow=host.attachShadow({mode:'open'}),section=node('section'),heading=node('h2','待识别的项目'),status=node('p','加载未完成，请重试。'),retry=node('button','重试');
  section.setAttribute('aria-label','待识别的项目');status.setAttribute('role','status');status.setAttribute('aria-live','polite');retry.type='button';retry.disabled=false;
  retry.addEventListener('click',async event=>{
   if(event.isTrusted!==true||stopped||generation!==run||pending)return;
   pending=true;retry.setAttribute('aria-disabled','true');status.textContent='正在加载…';
   try{await onPageRequest(offset);}catch{}finally{
    if(!stopped&&generation===run){pending=false;retry.setAttribute('aria-disabled','false');status.textContent='加载未完成，请重试。';}
   }
  });
  section.append(heading,status,retry);shadow.append(node('style',styles),section);container.append(host);
  mounted={offset,shadow,buttons:new Map(),controls:new Map([['retry',retry]])};watchSize(section);if(focus)retry.focus?.({preventScroll:true});
 }
 function update(input,page={offset:0,total:input?.length,nextOffset:null}){if(stopped)return;const items=validated(input),paging=validatedPage(page,items.length);const samePage=mounted?.offset===paging.offset,priorScroll=samePage?scrollValue(!mounted.layoutObserver&&hasLayout(mounted.list)?mounted.list?.scrollTop:mounted.savedScroll):0,priorFocus=samePage&&doc.hasFocus?.()!==false&&doc.activeElement===host?[...mounted.buttons].find(([,button])=>mounted.shadow.activeElement===button)?.[0]:null,priorControl=focusedControl();clear();if(!items.length){emptyPage=paging;return;}const run=generation;let pagePending=false,activationPending=0;host=node('div');host.setAttribute('data-vaiwl-candidates','');const shadow=host.attachShadow({mode:'open'}),section=node('section'),heading=node('h2','待识别的项目'),list=node('ul');section.setAttribute('aria-label','待识别的项目');section.append(heading,list);shadow.append(node('style',styles),section);container.append(host);mounted={offset:paging.offset,list,shadow,savedScroll:priorScroll,layoutObserver:null,buttons:new Map(),controls:new Map()};watchSize(section);heading.tabIndex=-1;
  for(const item of items){const row=node('li'),button=node('button',item.nativeTitle??'项目名称暂不可用'),status=node('p',item.available?'进入原生项目后确认项目身份。':'暂时无法打开；请先处理未发送内容，或使用原生入口继续。');button.type='button';button.disabled=!item.available;button.setAttribute('data-candidate-key',item.renderKey);status.setAttribute('role','status');status.setAttribute('aria-live','polite');let pending=false,used=false;
   button.addEventListener('click',async event=>{if(event.isTrusted!==true||stopped||generation!==run||!item.available||pending||used||pagePending)return;const presentation=Object.freeze({offset:paging.offset,scrollTop:scrollValue(list.scrollTop),focused:doc.hasFocus?.()!==false&&shadow.activeElement===button});pending=true;activationPending++;used=true;button.disabled=true;status.textContent='正在打开原生项目…';try{const result=await onActivate(item.renderKey,presentation);if(stopped||generation!==run)return;status.textContent=['dispatched','already-current'].includes(result?.state)?'已请求打开原生项目，请在原生页面继续。':'打开结果未确认，请使用原生入口继续。';}catch{if(!stopped&&generation===run)status.textContent='打开结果未确认，请使用原生入口继续。';}finally{pending=false;activationPending--;}});row.append(button,status);list.append(row);mounted.buttons.set(item.renderKey,button);
  }
  const focusTarget=priorFocus?mounted.buttons.get(priorFocus):null;if(focusTarget&&!focusTarget.disabled)focusTarget.focus?.({preventScroll:true});trackPosition(mounted);
  const range=node('p',`已观察的待识别项目 ${paging.offset+1}–${paging.offset+items.length} / ${paging.total}`),controls=node('div'),pageStatus=node('p');pageStatus.setAttribute('role','status');section.append(range);if(paging.total<=32){restoreControl(priorControl,heading);return;}section.append(controls,pageStatus);const buttons=[];
  for(const [label,offset] of [['上一页',paging.offset>0?paging.offset-32:null],['下一页',paging.nextOffset]]){const button=node('button',label);button.type='button';button.disabled=offset===null;controls.append(button);buttons.push([button,offset]);mounted.controls.set(label,button);button.addEventListener('click',async event=>{if(event.isTrusted!==true||stopped||generation!==run||offset===null||pagePending||activationPending)return;pagePending=true;for(const [b]of buttons)b.setAttribute('aria-disabled','true');pageStatus.textContent='正在加载…';try{const result=await onPageRequest(offset);if(stopped||generation!==run)return;pageStatus.textContent=result?.ok===false?'加载未完成，请重试。':'';}catch{if(!stopped&&generation===run)pageStatus.textContent='加载未完成，请重试。';}finally{if(!stopped&&generation===run){pagePending=false;for(const [b,o]of buttons)b.setAttribute('aria-disabled',String(o===null));}}});}
  restoreControl(priorControl,heading);
 }
 return Object.freeze({restorePosition({offset,scrollTop}={}){if(stopped||!Number.isFinite(scrollTop)||scrollTop<0||scrollTop>1e7)return false;if(emptyPage?.offset===offset)return true;if(!mounted?.list||mounted.offset!==offset)return false;if(mounted.list.getClientRects?.().length===0)return false;mounted.list.scrollTop=scrollTop;mounted.savedScroll=scrollValue(mounted.list.scrollTop);mounted.layoutObserver?.disconnect();mounted.layoutObserver=null;return true;},update,showError,clear,stop(){if(stopped)return;stopped=true;clear();}});
}

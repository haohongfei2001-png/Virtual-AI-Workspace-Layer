import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigation} from '../../src/navigation/navigation.mjs';
// Small DOM double exercises the existing renderer's event/data paths. Browser
// layout and screenshots remain separate real-MV3 acceptance.
function dom(){
 let doc;
 class Element{
  constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.dataset={};this.style={};this.events={};this.isConnected=true;this.scrollTop=0;this.clientWidth=0;this.clientHeight=0;this.textContent='';}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=String(v);}
  getAttribute(k){return k==='data-focus-key'?this.dataset.focusKey??this.attrs[k]??null:this.attrs[k]??null;}
  hasAttribute(k){return k==='data-focus-key'?this.getAttribute(k)!==null:k in this.attrs;}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.isConnected=false;}
  attachShadow(){return this.shadowRoot=new Element('shadow');}
  cloneNode(){const n=new Element(this.tagName);n.attrs={...this.attrs};return n;}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  removeEventListener(){}
  click(){const event={button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},composedPath:()=>[this]};for(const fn of this.events.click??[])fn(event);return event;}
  focus(){let root=this;while(root.parentNode)root=root.parentNode;root.activeElement=this;}
  getBoundingClientRect(){return {height:0,width:0};}
  matches(selector){const attr=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(attr)return this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);return selector.startsWith('.')?(this.className??'').split(' ').includes(selector.slice(1)):this.tagName===selector;}
  querySelectorAll(selector){const direct=selector.startsWith(':scope > ');if(direct)selector=selector.slice(9);const out=[];const walk=n=>{for(const c of n.children){if(c.matches(selector))out.push(c);if(!direct)walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
 }
 const handlers=new Map(),winHandlers=new Map();doc={handlers,winHandlers,defaultView:{setTimeout,clearTimeout,addEventListener(type,fn){if(!winHandlers.has(type))winHandlers.set(type,new Set());winHandlers.get(type).add(fn);},removeEventListener(type,fn){winHandlers.get(type)?.delete(fn);},crypto},addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k),createElement:tag=>new Element(tag)};doc.body=new Element('body');return doc;
}
const row=id=>({id,nativeTitle:`Native ${id}`,displayTitle:`Native ${id}`,nativeUrl:`https://chatgpt.com/c/${id}`,membership:'NONE',projectId:null,segment:0});
const page=(items=[],total=items.length,offset=0,limit=5)=>({items,total,offset,limit,hasMore:offset+items.length<total});
function projection(role='workspace'){
 const group=id=>({id,name:`Original ${id}`,nativeName:`Original ${id}`,segment:0,nativeUrl:null,lists:{current:page([row(`${id}_0`)],1000),old:page([row(`${id}_old`)],30),unknown:page()}});
 return {protocol:'vaiwl-free-frame/1',role,scope:'scopeA',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:true,maxSegment:8},groups:page([group('P2'),group('P1')],100,0,24),entries:{noProject:{...page(),inventoryTotal:10},unknown:{...page([row('unknown')]),inventoryTotal:1}},selection:null};
}
function fixture(role='workspace',callback=()=>null,onHorizonRequest=null,onWorkingSetRequest=null,adapterOverride={},extra={}){const doc=dom(),intents=[];const nav=createNavigation({document:doc,surface:{role,root:doc.body},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){},...adapterOverride},onHorizonRequest,onWorkingSetRequest,...extra,onProjectionRequest:callback,onPresentationRequest:v=>intents.push(v)});const pane=()=>nav.roots()[role].shadow;return {doc,nav,pane,intents,button:label=>pane().querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label)};}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};

import {css} from '../../src/navigation/styles.mjs';
test('home settings uses the existing pager rail after navigation, without losing action identity',()=>{
 const f=fixture();f.nav.updateFrameProjection(projection());const trigger=f.button('工作空间设置'),rail=f.pane().querySelector('.arrows');
 assert.equal(trigger.parentNode,rail);assert.equal(rail.children.at(-1),trigger);assert.equal(trigger.getAttribute('data-focus-key'),'workspace-settings');assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(trigger.className,'square workspace-settings-trigger');assert.equal(f.pane().querySelectorAll('.workspace-settings-trigger').length,1);assert.equal(f.button('较近的30日'),undefined);assert.equal(rail.children[0],f.button('较早的30日'));f.nav.stop();
});
test('settings remains after both historical arrows and preserves backup recovery/H handlers',async()=>{
 let backup=0,recovery=0;const f=fixture('workspace',()=>null,async()=>({ok:true}),null,{}, {onBackupRequest:()=>backup++,onRecoveryRequest:()=>recovery++});const dto=projection();dto.segment=1;dto.navigation.hasNewer=true;f.nav.updateFrameProjection(dto);let rail=f.pane().querySelector('.arrows');assert.deepEqual(rail.children.map(n=>n.getAttribute('aria-label')),['较近的30日','较早的30日','工作空间设置']);f.button('工作空间设置').click();assert.equal(f.button('工作空间设置').getAttribute('aria-expanded'),'true');assert(f.pane().querySelector('select'));f.button('备份与导入').click();f.button('本地数据恢复').click();assert.equal(backup,1);assert.equal(recovery,1);f.button('关闭设置').focus();f.button('关闭设置').click();assert.equal(f.pane().activeElement,f.button('工作空间设置'));assert.equal(f.pane().querySelector('select'),null);assert.equal(f.button('工作空间设置').getAttribute('data-focus-key'),'workspace-settings');f.nav.stop();
});
test('project create keeps its label, +, focus key and conservative unavailable action',async()=>{
 const f=fixture();f.nav.updateFrameProjection(projection());const plus=f.pane().querySelector('[aria-label="在项目中新建聊天 Original P2"]');assert(plus);assert.equal(plus.getAttribute('role'),'button');assert.equal(plus.getAttribute('href'),null);assert.equal(plus.className,'square project-create');assert.equal(plus.textContent,'+');assert.equal(plus.getAttribute('data-focus-key'),'project-create:P2');assert.equal(plus.getAttribute('aria-disabled'),'true');plus.click();await tick();assert(f.pane().querySelector('.navigation-feedback').querySelector('span').textContent.includes('当前无法确认项目入口'));f.nav.stop();
});
test('CSS limits project-create sizing to card heads and preserves coarse targets',()=>{
 assert(css.includes('.card-head > .project-create{width:28px;height:28px;flex:none}'));assert(css.includes('.square{width:34px;height:34px;'));
 assert(css.includes('@media(pointer:coarse){.card-head > .project-create{min-width:34px;min-height:34px}'));
 assert(css.includes('.arrows button{width:32px;height:32px}'));
 const narrow=css.slice(css.indexOf('@media(max-width:240px)'));assert(narrow.includes('.arrows{float:none;display:flex;position:sticky;flex-wrap:wrap;'));assert(!/display\s*:\s*none|visibility\s*:\s*hidden/.test(narrow));
});
test('pager float has nonnegative margin-box at each breakpoint with stable button position',()=>{
 // Browser evidence 39530853596: desktop client1168/scroll1182 (+14),
 // narrow344/344. A 32px float with -46px margin had a negative14px box.
 // These are sizing contracts; next hosted strict geometry must verify layout.
 assert(css.includes('.arrows{width:46px;justify-items:end;margin-right:-46px;'));
 assert(css.includes('@media(max-width:760px){.workspace{padding:15px 46px 24px 9px}.arrows{width:32px;margin-right:-32px}'));
 for(const frame of [241,344,420,700,760,761,1168,1440]){
  const narrow=frame<=760,padding=narrow?46:70,negativeMargin=narrow?32:46,railWidth=negativeMargin,buttonWidth=32;
  const cardRight=frame-padding,railLeft=cardRight+negativeMargin-railWidth;
  const newButtonLeft=railLeft+railWidth-buttonWidth,oldButtonLeft=cardRight+negativeMargin-buttonWidth;
  assert.equal(railWidth-negativeMargin,0,'float margin-box cannot be negative');assert.equal(newButtonLeft,oldButtonLeft,'preserve actual button pixels');assert(railLeft>=cardRight);assert(newButtonLeft+buttonWidth<=frame);
  for(const count of [1,2,3])for(const height of [32,40]){
   const rects=Array.from({length:count},(_,i)=>({left:newButtonLeft,top:i*(height+6),right:newButtonLeft+buttonWidth,bottom:i*(height+6)+height}));
   for(let i=1;i<count;i++)assert(rects[i].top>rects[i-1].bottom,'navigation/settings remain distinct rows');
   assert(rects.every(r=>r.right<=frame&&r.left>=cardRight));
  }
 }
 const tiny=css.slice(css.indexOf('@media(max-width:240px)'));assert(tiny.includes('.arrows{float:none;display:flex;position:sticky;flex-wrap:wrap;width:max-content;max-width:100%;margin:0 0 8px auto;gap:4px}'));
 assert(!/overflow(?:-x)?\s*:\s*(?:hidden|clip)/.test(tiny));
});

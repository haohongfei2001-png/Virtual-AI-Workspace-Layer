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
// L: real navigation event handling with the renderer DOM double above.
// The response is deferred by an owned pointer, then superseded by a new click.
test('superseded response cannot apply or install a page cap after interaction defer',async t=>{
 const pending=[],calls=[];
 const f=fixture('workspace',query=>{calls.push(query);return new Promise(resolve=>pending.push(resolve));});
 t.after(()=>f.nav.stop());f.nav.updateFrameProjection(projection());
 const owner=f.nav.roots().workspace.n,more=f.button('显示更多近期窗口');
 f.doc.handlers.get('pointerdown')({pointerId:71,composedPath:()=>[more,owner]});more.click();
 assert.equal(calls[0].rowLimit,17);
 const stale=projection();stale.groups.items[0].name='STALE RESPONSE';
 stale.selection={groupId:'P2',list:'current',...page([row('stale_only')],1000,0,5)};
 pending[0](stale);await tick();
 assert.equal(f.pane().querySelector('[data-ref-id="stale_only"]'),null,'response waits for pointer release');
 f.button('显示更多项目').click();assert.equal(calls.length,2);
 f.doc.handlers.get('pointerup')({pointerId:71});await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(f.pane().querySelector('[data-ref-id="stale_only"]'),null,'old delayed response cannot render while new request is pending');
 assert(!f.pane().querySelectorAll('.theme-name').some(node=>node.textContent==='STALE RESPONSE'));
 const fresh=projection();fresh.groups.items[0].name='Fresh current response';pending[1](fresh);await tick();
 assert(f.pane().querySelectorAll('.theme-name').some(node=>node.textContent==='Fresh current response'));
 f.button('显示更多近期窗口').click();assert.equal(calls.length,3);
 assert.equal(calls[2].rowOffset,0,'discarded narrow response must not install a pagination cap');assert.equal(calls[2].rowLimit,17);
 pending[2](null);await tick();
});

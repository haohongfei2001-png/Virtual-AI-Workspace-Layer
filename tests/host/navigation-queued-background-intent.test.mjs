import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigation} from '../../src/navigation/navigation.mjs';
// Small DOM double exercises the existing renderer's event/data paths. Browser
// layout and screenshots remain separate real-MV3 acceptance.
function dom(){
 let doc;
 class Element{
  constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.dataset={};this.style={};this.events={};this.isConnected=true;this.scrollTop=0;this.clientWidth=0;this.clientHeight=200;this.textContent='';}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=String(v);}
  getAttribute(k){return k==='data-focus-key'?this.dataset.focusKey??this.attrs[k]??null:this.attrs[k]??null;}
  hasAttribute(k){return k==='data-focus-key'?this.getAttribute(k)!==null:k in this.attrs;}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
  prepend(...nodes){for(const n of nodes)n.parentNode=this;this.children.unshift(...nodes);}
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

// Reuse the renderer DOM harness above, with a deterministic interaction timer.
function setup(){
 const pending=[],queries=[],f=fixture('workspace',q=>{queries.push(q);return new Promise(resolve=>pending.push(resolve));});
 const timers=new Map();let next=0;
 f.doc.defaultView.setTimeout=fn=>{timers.set(++next,fn);return next;};
 f.doc.defaultView.clearTimeout=id=>timers.delete(id);
 const base=()=>{const dto=projection();dto.groups.items=dto.groups.items.slice(0,1);dto.groups.total=1;dto.groups.hasMore=false;dto.groups.items[0].lists.current=page();dto.groups.items[0].lists.unknown=page(Array.from({length:5},(_,i)=>row(`base_${i}`)),100);return dto;};
 const reply=(label='expanded')=>({...base(),selection:{groupId:'P2',list:'unknown',...page(Array.from({length:17},(_,i)=>row(`${label}_${i}`)),100,0,17)}});
 const ids=()=>f.pane().querySelector('[data-theme-id="P2"]').querySelectorAll('[data-ref-id]').map(n=>n.getAttribute('data-ref-id'));
 const queue=(dto=base())=>{const button=f.button('显示更多已知聊天'),owner=f.nav.roots().workspace.n;f.doc.handlers.get('pointerdown')({pointerId:7,composedPath:()=>[button,owner]});f.nav.updateFrameProjection(dto);f.doc.handlers.get('pointerup')({pointerId:7});assert.equal(timers.size,1);return button;};
 const flush=()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}};
 f.nav.updateFrameProjection(base());return {...f,pending,queries,base,reply,ids,queue,flush};
}
test('queued older background cannot cancel Show More intent issued before its paint',async()=>{
 const f=setup();try{const button=f.queue();button.click();assert.equal(f.queries[0].rowLimit,17);f.flush();assert.equal(f.ids().length,5);f.pending[0](f.reply());await tick();assert.equal(f.ids().length,17);assert(f.ids().every(id=>id.startsWith('expanded_')));}finally{f.nav.stop();}
});
test('queued background does not revive the earlier of two reverse-completing user requests',async()=>{
 const f=setup();try{const button=f.queue();button.click();button.click();f.flush();f.pending[1](f.reply('latest'));await tick();assert.equal(f.ids().length,17);assert(f.ids().every(id=>id.startsWith('latest_')));f.pending[0](f.reply('obsolete'));await tick();assert(f.ids().every(id=>id.startsWith('latest_')));}finally{f.nav.stop();}
});
for(const boundary of ['scope','session'])test(`queued ${boundary} replacement still fences old-page replies`,async()=>{
 const f=setup();try{const changed=f.base();if(boundary==='scope')changed.scope='scopeB';else changed.viewSession={...changed.viewSession,H:14};changed.groups.items[0].name='Replacement';if(boundary==='scope'){f.button('显示更多已知聊天').click();f.nav.updateFrameProjection(changed);}else{const button=f.queue(changed);button.click();f.flush();}f.pending[0](f.reply('obsolete'));await tick();assert.equal(f.pane().querySelector('.theme-name').textContent,'Replacement');assert.equal(f.ids().length,5);assert(!f.ids().some(id=>id.startsWith('obsolete_')));if(boundary==='scope')assert.equal(f.nav.status().scope,'scopeB');}finally{f.nav.stop();}
});
test('immediate newer background after a request continues to fence that reply',async()=>{
 const f=setup();try{f.button('显示更多已知聊天').click();const changed=f.base();changed.groups.items[0].name='Fresh';f.nav.updateFrameProjection(changed);f.pending[0](f.reply('obsolete'));await tick();assert.equal(f.pane().querySelector('.theme-name').textContent,'Fresh');assert.equal(f.ids().length,5);}finally{f.nav.stop();}
});
for(const key of ['Enter',' '])test(`keyboard ${JSON.stringify(key)} expansion survives an earlier queued background`,async()=>{
 const f=setup();try{const button=f.button('显示更多已知聊天'),owner=f.nav.roots().workspace.n;f.doc.handlers.get('keydown')({key,composedPath:()=>[button,owner]});f.nav.updateFrameProjection(f.base());button.click();f.doc.handlers.get('keyup')({key});f.flush();f.pending[0](f.reply('keyboard'));await tick();assert.equal(f.ids().length,17);assert(f.ids().every(id=>id.startsWith('keyboard_')));}finally{f.nav.stop();}
});
test('new user response arriving before queued paint replaces it and is rendered once flushed',async()=>{
 const f=setup();try{f.queue().click();f.pending[0](f.reply('early'));await tick();assert.equal(f.ids().length,5);f.flush();assert.equal(f.ids().length,17);assert(f.ids().every(id=>id.startsWith('early_')));}finally{f.nav.stop();}
});
test('discarding old queued page still performs an independently pending settings render',async()=>{
 const f=setup();try{const button=f.queue();f.button('工作空间设置').click();assert.equal(f.button('关闭设置'),undefined);button.click();f.flush();assert(f.button('关闭设置'));assert.equal(f.ids().length,5);f.pending[0](f.reply());await tick();assert.equal(f.ids().length,17);assert(f.button('关闭设置'));}finally{f.nav.stop();}
});
test('queued segment replacement remains a boundary against pending earlier-page expansion',async()=>{
 const f=setup();try{const changed=f.base();changed.segment=1;changed.navigation.hasNewer=true;changed.groups.items[0].name='Earlier segment';f.queue(changed).click();f.flush();f.pending[0](f.reply('obsolete'));await tick();assert.equal(f.nav.view().segment,1);assert.equal(f.pane().querySelector('.theme-name').textContent,'Earlier segment');assert.equal(f.ids().length,5);}finally{f.nav.stop();}
});

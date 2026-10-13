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
  click(){for(const fn of this.events.click??[])fn({button:0,preventDefault(){},composedPath:()=>[this]});}
  focus(){let root=this;while(root.parentNode)root=root.parentNode;root.activeElement=this;}
  getBoundingClientRect(){return {height:0,width:0};}
  matches(selector){const attr=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(attr)return this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);return selector.startsWith('.')?(this.className??'').split(' ').includes(selector.slice(1)):this.tagName===selector;}
  querySelectorAll(selector){const direct=selector.startsWith(':scope > ');if(direct)selector=selector.slice(9);const out=[];const walk=n=>{for(const c of n.children){if(c.matches(selector))out.push(c);if(!direct)walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
 }
 const handlers=new Map();doc={handlers,defaultView:{setTimeout,clearTimeout,addEventListener(){},removeEventListener(){},crypto},addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k),createElement:tag=>new Element(tag)};doc.body=new Element('body');return doc;
}
const row=id=>({id,nativeTitle:`Native ${id}`,displayTitle:`Native ${id}`,nativeUrl:`https://chatgpt.com/c/${id}`,membership:'NONE',projectId:null,segment:0});
const page=(items=[],total=items.length,offset=0,limit=5)=>({items,total,offset,limit,hasMore:offset+items.length<total});
function projection(role='workspace'){
 const group=id=>({id,name:`Original ${id}`,nativeName:`Original ${id}`,segment:0,nativeUrl:null,lists:{current:page([row(`${id}_0`)],1000),old:page([row(`${id}_old`)],30),unknown:page()}});
 return {protocol:'vaiwl-free-frame/1',role,scope:'scopeA',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:true,maxSegment:8},groups:page([group('P2'),group('P1')],100,0,24),entries:{noProject:{...page(),inventoryTotal:10},unknown:{...page([row('unknown')]),inventoryTotal:1}},selection:null};
}
function fixture(role='workspace',callback=()=>null,onHorizonRequest=null,onWorkingSetRequest=null,adapterOverride={},extra={}){const doc=dom(),intents=[];const nav=createNavigation({document:doc,surface:{role,root:doc.body},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){},...adapterOverride},onHorizonRequest,onWorkingSetRequest,...extra,onProjectionRequest:callback,onPresentationRequest:v=>intents.push(v)});const pane=()=>nav.roots()[role].shadow;return {doc,nav,pane,intents,button:label=>pane().querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label)};}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};

const expires=()=>new Date(Date.now()+14000).toISOString();
function setup(callback=async()=>({ok:true}),role='workspace'){const f=fixture(role,()=>null,null,null,{}, {onUndoTimePolicyRequest:callback});f.nav.updateFrameProjection(projection(role));f.nav.showWorkspace();return f;}
test('workspace notice uses existing renderer and repeated delivery/update cannot renew or enable busy undo',async()=>{
 let resolve;const calls=[],f=setup(arg=>{calls.push(arg);return new Promise(r=>resolve=r);});try{
 const value={id:'decision',expiresAt:expires()};assert.equal(f.nav.showTimePolicyNotice(value),true);assert(f.pane().querySelector('[role="status"]'));const undo=f.button('撤销自动时间范围调整');undo.click();undo.click();assert.deepEqual(calls,[{id:'decision'}]);assert.equal(f.button('撤销自动时间范围调整').disabled,true);
 f.nav.updateFrameProjection(projection());assert.equal(f.nav.showTimePolicyNotice({...value,expiresAt:expires()}),true);assert.equal(f.button('撤销自动时间范围调整').disabled,true);resolve({ok:true});await tick();assert.equal(f.button('撤销自动时间范围调整'),undefined);assert.equal(f.nav.showTimePolicyNotice(value),false);
 }finally{f.nav.stop();}
});
test('invalid IDs deadlines and nonworkspace surfaces do not show notice',()=>{const f=setup(),side=setup(undefined,'sidebar');try{for(const value of [{id:'',expiresAt:expires()},{id:'x'.repeat(129),expiresAt:expires()},{id:'x',expiresAt:'tomorrow'},{id:'x',expiresAt:new Date(Date.now()-1).toISOString()},{id:'x',expiresAt:new Date(Date.now()+16000).toISOString()},{id:'x',expiresAt:expires(),scope:'other'}])assert.equal(f.nav.showTimePolicyNotice(value),false);assert.equal(side.nav.showTimePolicyNotice({id:'x',expiresAt:expires()}),false);f.nav.enterReading();assert.equal(f.nav.showTimePolicyNotice({id:'x',expiresAt:expires()}),false);}finally{f.nav.stop();side.nav.stop();}});
test('notice failure is generic and never replays an ambiguous undo',async()=>{const f=setup(async()=>{throw Error('PRIVATE failure');});try{f.nav.showTimePolicyNotice({id:'x',expiresAt:expires()});f.button('撤销自动时间范围调整').click();await tick();const status=f.pane().querySelector('[aria-label="自动时间范围调整"]');assert.equal(status.children[0].textContent,'撤销结果未确认，可在设置中手动选择范围。');assert.equal(f.button('撤销自动时间范围调整'),undefined);}finally{f.nav.stop();}});
test('deadline clears notice and stale saved button cannot issue undo',async()=>{let count=0;const f=setup(async()=>{count++;return {ok:true};});try{f.nav.showTimePolicyNotice({id:'short',expiresAt:new Date(Date.now()+15).toISOString()});const old=f.button('撤销自动时间范围调整');await new Promise(r=>setTimeout(r,25));assert.equal(f.button('撤销自动时间范围调整'),undefined);old.click();assert.equal(count,0);}finally{f.nav.stop();}});
for(const action of ['clear','reading','invalidate','scope','stop'])test('late undo cannot revive a notice after '+action,async()=>{let resolve;const f=setup(()=>new Promise(r=>resolve=r));f.nav.showTimePolicyNotice({id:'x',expiresAt:expires()});f.button('撤销自动时间范围调整').click();if(action==='clear')f.nav.clearTimePolicyNotice();if(action==='reading')f.nav.enterReading();if(action==='invalidate')f.nav.invalidate();if(action==='scope')f.nav.updateFrameProjection({...projection(),scope:'B'});if(action==='stop')f.nav.stop();resolve({ok:false});await tick();if(f.nav.roots()?.workspace)assert.equal(f.pane().querySelector('[aria-label="自动时间范围调整"]'),null);f.nav.stop();});
test('notice rendering and expiry preserve an owned pointer target until release',async()=>{const f=setup();try{const trigger=f.button('工作空间设置'),owner=f.nav.roots().workspace.n;f.doc.handlers.get('pointerdown')({pointerId:4,composedPath:()=>[trigger,owner]});f.nav.showTimePolicyNotice({id:'held',expiresAt:expires()});assert.equal(f.button('工作空间设置'),trigger);assert.equal(f.button('撤销自动时间范围调整'),undefined);f.doc.handlers.get('pointerup')({pointerId:4});await new Promise(r=>setTimeout(r,5));assert(f.button('撤销自动时间范围调整'));}finally{f.nav.stop();}});

test('authorized page update retains undo focus without resetting notice state',()=>{const f=setup();try{f.nav.showTimePolicyNotice({id:'focus',expiresAt:expires()});f.button('撤销自动时间范围调整').focus();f.nav.updateFrameProjection(projection());assert.equal(f.pane().activeElement,f.button('撤销自动时间范围调整'));}finally{f.nav.stop();}});

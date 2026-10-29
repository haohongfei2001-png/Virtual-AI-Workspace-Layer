import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigation} from '../../src/navigation/navigation.mjs';
// Small DOM double exercises the existing renderer's event/data paths. Browser
// layout and screenshots remain separate real-MV3 acceptance.
function dom(){
 let doc;
 class Element{
  constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.dataset={};this.style={};this.events={};this.isConnected=true;this.scrollTop=0;this.clientWidth=0;this.clientHeight=0;this.textContent='';}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='class'){this.className=String(v);if(this.className.split(' ').includes('workspace')){this.clientWidth=1000;this.clientHeight=200;}}}
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

const layout=()=>({segment:3,oldOpen:['home:P2','side:P2'],sidebarOpen:['P2'],capacities:[['home:P2',17]],scroll:173,sidebarScroll:89,sidebarVisible:true});
function dto(role='workspace',scope='scopeA',segment=3){const d=projection(role);d.scope=scope;d.segment=segment;d.navigation.hasNewer=segment>0;for(const g of d.groups.items)g.segment=segment;return d;}
test('first history DTO restores expanded old rows and workspace scroll, later DTO preserves them',()=>{
 const f=fixture();assert.equal(f.nav.restoreFrameView(layout()),true);f.nav.updateFrameProjection(dto());f.nav.showWorkspace();assert.equal(f.nav.view().segment,3);assert.equal(f.nav.roots().workspace.scroller.scrollTop,173);assert.equal(f.button('展开旧聊天 Original P2').getAttribute('aria-expanded'),'true');assert(f.pane().querySelector('[data-ref-id="P2_old"]'));assert.equal(f.nav.view().capacities.get('home:P2'),17);
 f.nav.roots().workspace.scroller.scrollTop=211;f.nav.updateFrameProjection(dto());assert.equal(f.nav.roots().workspace.scroller.scrollTop,211);assert.equal(f.button('展开旧聊天 Original P2').getAttribute('aria-expanded'),'true');f.nav.stop();
});
test('sidebar restores actual expansion and sidebar scroll across subsequent projection',()=>{
 const f=fixture('sidebar');f.nav.restoreFrameView(layout());f.nav.updateFrameProjection(dto('sidebar'));assert.equal(f.button('侧栏项目 Original P2').getAttribute('aria-expanded'),'true');assert.equal(f.button('展开旧聊天 Original P2').getAttribute('aria-expanded'),'true');assert.equal(f.pane().querySelector('.themes').scrollTop,89);
 f.pane().querySelector('.themes').clientHeight=200;f.pane().querySelector('.themes').scrollHeight=600;f.pane().querySelector('.themes').scrollTop=101;f.nav.updateFrameProjection(dto('sidebar'));assert.equal(f.pane().querySelector('.themes').scrollTop,101);f.nav.stop();
});
test('pending restore is consumed once and does not apply to a later different scope',()=>{
 const f=fixture();f.nav.restoreFrameView(layout());f.nav.updateFrameProjection(dto());f.nav.showWorkspace();f.nav.updateFrameProjection(dto('workspace','scopeB'));assert.equal(f.nav.view().oldOpen.size,0);assert.equal(f.nav.view().sidebarOpen.size,0);assert.equal(f.nav.view().capacities.size,0);assert.equal(f.nav.roots().workspace.scroller.scrollTop,0);f.nav.stop();
});
test('segment mismatch consumes pending layout instead of applying it to a later matching page',()=>{
 const f=fixture();f.nav.restoreFrameView(layout());f.nav.updateFrameProjection(dto('workspace','scopeA',0));assert.equal(f.nav.view().oldOpen.size,0);f.nav.updateFrameProjection(dto());assert.equal(f.nav.view().oldOpen.size,0);assert.equal(f.nav.view().scroll,0);f.nav.stop();
});
test('invalid resume layouts reject before affecting renderer and copied input is isolated',()=>{
 const f=fixture();for(const bad of [{...layout(),scope:'forged'},{...layout(),scroll:-1},{...layout(),sidebarScroll:Infinity},{...layout(),oldOpen:['x','x']},{...layout(),capacities:[['x',0]]},{...layout(),segment:1000001}])assert.throws(()=>f.nav.restoreFrameView(bad),/invalid-frame-resume-state/);
 const original=layout();f.nav.restoreFrameView(original);original.oldOpen.length=0;original.capacities[0][1]=99;f.nav.updateFrameProjection(dto());assert(f.nav.view().oldOpen.has('home:P2'));assert.equal(f.nav.view().capacities.get('home:P2'),17);f.nav.stop();assert.equal(f.nav.restoreFrameView(layout()),false);
});

for(const role of ['workspace','sidebar'])test('native candidate panel shares formal '+role+' flow without replacing its component',()=>{
 const f=fixture(role);f.nav.updateFrameProjection(dto(role));
 const details=f.doc.createElement('details');details.setAttribute('data-vaiwl-candidate-root','');details.open=true;
 assert.equal(f.nav.attachNativeCandidates(details),true);
 const pane=f.nav.roots()[role];assert.equal(details.parentNode,pane.n);assert.equal(details.getAttribute('slot'),'native-candidates');
 assert(f.pane().querySelector('slot'));
 f.nav.updateFrameProjection(dto(role));assert.equal(details.parentNode,pane.n);assert.equal(details.open,true);
 const append=pane.n.append;pane.n.append=()=>{throw Error('same-parent-move');};assert.equal(f.nav.attachNativeCandidates(details),true);pane.n.append=append;
 f.nav.invalidate('asset-panel');f.nav.updateFrameProjection(dto(role));
 assert.notEqual(f.nav.roots()[role].n,pane.n);assert.equal(f.nav.attachNativeCandidates(details),true);
 assert.equal(details.parentNode,f.nav.roots()[role].n);assert.equal(details.open,true);
 assert.equal(f.nav.attachNativeCandidates(f.doc.createElement('div')),false);
 f.nav.stop();assert.equal(f.nav.attachNativeCandidates(details),false);
});

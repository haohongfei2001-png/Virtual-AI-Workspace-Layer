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

function setupCurrent(){
 let resolve;const commands=[];
 const issued={targetKey:'current_plan',uiGrantId:'grant',mountId:'mount',plan:{mode:'same-target',planRevision:1,bodyProofId:'proof',target:{kind:'resolved',entity:'conversation',nativeId:'P2_0',navigationURL:'https://chatgpt.com/c/P2_0',liveHandle:null}}};
 const f=fixture('workspace',()=>null,null,null,{nativeHref:value=>value,navigationPlan:ref=>ref.id==='P2_0'?issued:{...issued,plan:{mode:'href',planRevision:2,disposition:'new-tab-preserve-current',target:{kind:'resolved',entity:'conversation',nativeId:ref.id,navigationURL:ref.nativeUrl,liveHandle:null}}}},{onDispatch:command=>{commands.push(command);return new Promise(r=>resolve=r);}});
 f.nav.updateFrameProjection(projection());f.nav.showWorkspace();
 const link=f.pane().querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P2_0');assert(link,'actual renderer link exists');
 return {...f,link,commands,reply:value=>resolve(value)};
}
test('same-target enters reading only after acknowledged result, with one dispatch and no presentation replay',async()=>{
 const f=setupCurrent();try{const before=f.intents.length;f.link.click();assert.equal(f.commands.length,1);assert.equal(f.nav.view().mode,'workspace');f.reply({state:'already-current'});await tick();assert.equal(f.nav.view().mode,'reading');assert.equal(f.intents.length,before,'local ACK update never resends presentation');}finally{f.nav.stop();}
});
for(const action of ['workspace','roundtrip','presentation','workspace-entered','settings','stop'])test('late same-target ACK preserves newer intent: '+action,async()=>{
 const f=setupCurrent();try{f.link.click();assert.equal(f.commands.length,1);
 if(action==='workspace')f.nav.showWorkspace();if(action==='roundtrip'){f.nav.enterReading();f.nav.showWorkspace();}if(action==='presentation')f.nav.present({kind:'show-workspace'});if(action==='workspace-entered')f.nav.workspaceEntered();if(action==='settings')f.button('工作空间设置').click();if(action==='stop')f.nav.stop();
 const mode=f.nav.view()?.mode;f.reply({state:'already-current'});await tick();assert.equal(f.nav.view()?.mode,mode);assert.equal(f.commands.length,1);
 }finally{f.nav.stop();}
});
for(const state of ['blocked','unconfirmed','dispatched'])test('non-current result '+state+' never enters reading or retries',async()=>{
 const f=setupCurrent();try{f.link.click();f.reply({state});await tick();assert.equal(f.nav.view().mode,'workspace');assert.equal(f.commands.length,1);}finally{f.nav.stop();}
});

test('later different href navigation cancels pending same-target presentation without issuing another RPC',async()=>{
 const f=setupCurrent();try{f.link.click();const next=f.pane().querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P1_0');assert(next);next.click();f.reply({state:'already-current'});await tick();assert.equal(f.nav.view().mode,'workspace');assert.equal(f.commands.length,1);}finally{f.nav.stop();}
});

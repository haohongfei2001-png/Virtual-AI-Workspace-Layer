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
  removeAttribute(k){delete this.attrs[k];}
  hasAttribute(k){return k==='data-focus-key'?this.getAttribute(k)!==null:k in this.attrs;}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.isConnected=false;}
  attachShadow(){return this.shadowRoot=new Element('shadow');}
  cloneNode(){const n=new Element(this.tagName);n.attrs={...this.attrs};return n;}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  removeEventListener(){}
  click(patch={}){const event={button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},composedPath:()=>[this],...patch};for(const fn of this.events.click??[])fn(event);return event;}
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

function setupCurrent({mode='same-target',failure=null,safe=true,onHorizonRequest=null}={}){
 let resolve,reject,currentURL='https://chatgpt.com/';const commands=[];
 const issued={targetKey:'current_plan',uiGrantId:'grant',mountId:'mount',plan:{mode:'same-target',planRevision:1,bodyProofId:'proof',target:{kind:'resolved',entity:'conversation',nativeId:'P2_0',navigationURL:'https://chatgpt.com/c/P2_0',liveHandle:null}}};
 if(mode==='native-control'){delete issued.plan.bodyProofId;issued.plan.mode=mode;issued.plan.control={id:'handle',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'conversation'};issued.plan.target.liveHandle=issued.plan.control;}
 if(!safe){issued.plan.mode='native-control';issued.plan.target={kind:'live-control',control:{id:'handle',documentToken:'doc',routeEpoch:1,regionEpoch:1,controlKind:'conversation'},navigationURL:null};}
 const f=fixture('workspace',()=>null,onHorizonRequest,null,{currentURL:()=>currentURL,nativeHref:value=>safe?value:null,navigationPlan:ref=>ref.id==='P2_0'?issued:{...issued,plan:{mode:'href',planRevision:2,disposition:'new-tab-preserve-current',target:{kind:'resolved',entity:'conversation',nativeId:ref.id,navigationURL:ref.nativeUrl,liveHandle:null}}}},{onDispatch:command=>{commands.push(command);if(failure==='throw')throw Error('private failure text');return new Promise((r,j)=>{resolve=r;reject=j;});}});
 f.nav.updateFrameProjection(projection());f.nav.showWorkspace();
 const link=f.pane().querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P2_0');assert(link,'actual renderer link exists');
 return {...f,link,commands,reply:value=>resolve(value),reject:error=>reject(error),setURL:value=>currentURL=value};
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

const feedback=f=>f.nav.roots()?.workspace?.shadow?.querySelector('.navigation-feedback')??null;
const textTree=n=>n?String(n.textContent??'')+(n.children??[]).map(textTree).join(''):'';
const attr=(n,key)=>n.getAttribute(key)??n[key];
const blockedText='暂时无法打开，请使用原生入口继续。';
const unknownText='打开结果未确认，请先查看原生页面。';
for(const mode of ['same-target','native-control'])for(const state of ['blocked','unconfirmed','unknown',null])test(`${mode} ${state} result has accessible feedback and no automatic fallback`,async()=>{
 const f=setupCurrent({mode});try{const before=f.intents.length,event=f.link.click();assert.equal(event.defaultPrevented,true);assert.equal(f.commands.length,1);f.reply(state===null?null:{state});await tick();const status=feedback(f);assert(status);assert.equal(attr(status,'role'),'status');assert.equal(attr(status,'aria-live'),'polite');assert(textTree(status).includes(state==='blocked'?blockedText:unknownText));assert.equal(f.nav.view().mode,'workspace');assert.equal(f.intents.length,before);assert.equal(f.commands.length,1);
 const fallback=status.querySelector('a');assert(fallback);assert.equal(textTree(fallback),'保留当前内容，在新标签打开');assert.equal(attr(fallback,'href'),'https://chatgpt.com/c/P2_0');assert.equal(attr(fallback,'target'),'_blank');assert.deepEqual(attr(fallback,'rel').split(' ').sort(),['noopener','noreferrer']);assert.equal(fallback.click().defaultPrevented,false);await tick();assert.equal(f.commands.length,1);
 }finally{f.nav.stop();}
});
for(const failure of ['throw','reject'])test(`navigation ${failure} shows bounded unknown feedback without private exception`,async()=>{
 const f=setupCurrent({failure});try{f.link.click();if(failure==='reject')f.reject(Error('private failure text'));await tick();assert(textTree(feedback(f)).includes(unknownText));assert(!textTree(feedback(f)).includes('private failure text'));assert.equal(f.nav.view().mode,'workspace');assert.equal(f.commands.length,1);}finally{f.nav.stop();}
});
for(const action of ['workspace','settings','href','projection','scope','invalidate','stop'])for(const result of ['blocked','unconfirmed'])test(`late ${result} cannot restore navigation feedback after ${action}`,async()=>{
 const f=setupCurrent();try{f.link.click();if(action==='workspace')f.nav.showWorkspace();if(action==='settings')f.button('工作空间设置').click();if(action==='href')f.pane().querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P1_0').click();if(action==='projection')f.nav.updateFrameProjection(projection());if(action==='scope')f.nav.updateFrameProjection({...projection(),scope:'scopeB'});if(action==='invalidate')f.nav.invalidate();if(action==='stop')f.nav.stop();const mode=f.nav.view()?.mode;f.reply({state:result});await tick();assert.equal(feedback(f),null);assert.equal(f.nav.view()?.mode,mode);assert.equal(f.commands.length,1);}finally{f.nav.stop();}
});
test('explicit href and modified native link use browser default with zero RPC',async()=>{
 const f=setupCurrent();try{const link=f.pane().querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P1_0');assert.equal(attr(link,'target'),'_blank');assert.equal(link.click().defaultPrevented,false);for(const patch of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}])assert.equal(f.link.click(patch).defaultPrevented,false);await tick();assert.equal(f.commands.length,0);assert.equal(feedback(f),null);}finally{f.nav.stop();}
});
test('feedback without verified href has no fallback anchor',async()=>{
 const f=setupCurrent({safe:false});try{f.link.click();assert.equal(f.commands.length,1);f.reply({state:'unconfirmed'});await tick();const status=feedback(f);assert(textTree(status).includes(unknownText));assert.equal(status.querySelector('a'),null);}finally{f.nav.stop();}
});
for(const action of ['settings','href','invalidate','stop'])test(`new ${action} action clears already visible feedback`,async()=>{
 const f=setupCurrent();try{f.link.click();f.reply({state:'blocked'});await tick();assert(feedback(f));if(action==='workspace')f.nav.showWorkspace();if(action==='settings')f.button('工作空间设置').click();if(action==='href')f.pane().querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P1_0').click();if(action==='invalidate')f.nav.invalidate();if(action==='stop')f.nav.stop();await tick();assert.equal(feedback(f),null);assert.equal(f.commands.length,1);}finally{f.nav.stop();}
});

for(const action of ['workspace','presentation','workspace-entered','projection'])for(const state of ['blocked','unconfirmed'])test(`settled ${state} survives same-scope same-route ${action}`,async()=>{
 const f=setupCurrent();try{f.link.click();f.reply({state});await tick();assert(feedback(f));const expected=textTree(feedback(f));if(action==='workspace')f.nav.showWorkspace();if(action==='presentation')f.nav.present({kind:'show-workspace'});if(action==='workspace-entered')assert.equal(f.nav.workspaceEntered(),true);if(action==='projection')f.nav.updateFrameProjection(projection());await tick();assert.equal(textTree(feedback(f)),expected);assert.equal(f.commands.length,1);assert.equal(f.nav.view().mode,'workspace');}finally{f.nav.stop();}
});
for(const action of ['workspace','presentation','workspace-entered','projection'])test(`settled feedback cannot survive changed native route on ${action}`,async()=>{
 const f=setupCurrent();try{f.link.click();f.reply({state:'unconfirmed'});await tick();assert(feedback(f));f.setURL('https://chatgpt.com/c/different');if(action==='workspace')f.nav.showWorkspace();if(action==='presentation')f.nav.present({kind:'show-workspace'});if(action==='workspace-entered')f.nav.workspaceEntered();if(action==='projection')f.nav.updateFrameProjection(projection());await tick();assert.equal(feedback(f),null);assert.equal(f.commands.length,1);}finally{f.nav.stop();}
});
test('settled feedback is cleared on account scope replacement',async()=>{
 const f=setupCurrent();try{f.link.click();f.reply({state:'blocked'});await tick();assert(feedback(f));f.nav.updateFrameProjection({...projection(),scope:'scopeB'});f.nav.workspaceEntered();await tick();assert.equal(feedback(f),null);assert.equal(f.commands.length,1);}finally{f.nav.stop();}
});
for(const action of ['presentation','workspace-entered'])for(const state of ['blocked','unconfirmed'])test(`return via ${action} cancels pending ${state} even though settled feedback can be preserved`,async()=>{
 const f=setupCurrent();try{f.link.click();if(action==='presentation')f.nav.present({kind:'show-workspace'});else f.nav.workspaceEntered();f.reply({state});await tick();assert.equal(feedback(f),null);assert.equal(f.commands.length,1);assert.equal(f.nav.view().mode,'workspace');}finally{f.nav.stop();}
});
test('new dispatch clears settled feedback before its acknowledgement and replaces it only once settled',async()=>{
 const f=setupCurrent();try{f.link.click();f.reply({state:'blocked'});await tick();assert(textTree(feedback(f)).includes(blockedText));const link=f.pane().querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P2_0');link.click();assert.equal(feedback(f),null);assert.equal(f.commands.length,2);f.reply({state:'unconfirmed'});await tick();assert(textTree(feedback(f)).includes(unknownText));assert(!textTree(feedback(f)).includes(blockedText));assert.equal(f.commands.length,2);}finally{f.nav.stop();}
});

for(const phase of ['pending','settled'])test(`actual search oninput cancels ${phase} navigation feedback after search is already open`,async()=>{
 const f=setupCurrent();try{f.nav.present({kind:'search-known'});f.nav.updateFrameProjection({...projection(),search:{query:'',projectId:null,...page([row('P2_0')],1,0,24)}});await tick();
 const search=f.pane().querySelector('.search'),link=search.querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P2_0');assert(link);link.click();assert.equal(f.commands.length,1);if(phase==='settled'){f.reply({state:'unconfirmed'});await tick();assert(feedback(f));}
 const input=f.pane().querySelector('input');assert.equal(typeof input.oninput,'function');input.value='new query';input.oninput();assert.equal(feedback(f),null);if(phase==='pending')f.reply({state:'blocked'});await tick();assert.equal(feedback(f),null);assert.equal(f.commands.length,1);assert.equal(f.nav.view().mode,'workspace');
 }finally{f.nav.stop();}
});
for(const phase of ['pending','settled'])test(`actual time-range onchange cancels ${phase} navigation feedback after settings is already open`,async()=>{
 const horizons=[],f=setupCurrent({onHorizonRequest:request=>{horizons.push(request);return new Promise(()=>{});}});try{f.button('工作空间设置').click();await tick();assert(f.pane().querySelector('select'));
 const link=f.pane().querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P2_0');link.click();assert.equal(f.commands.length,1);if(phase==='settled'){f.reply({state:'blocked'});await tick();assert(feedback(f));}
 const select=f.pane().querySelector('select');assert.equal(typeof select.onchange,'function');select.value='14';select.onchange();assert.equal(feedback(f),null);if(phase==='pending')f.reply({state:'unconfirmed'});await tick();assert.equal(feedback(f),null);assert.equal(f.commands.length,1);assert.equal(horizons.length,1);assert.equal(f.nav.view().mode,'workspace');
 }finally{f.nav.stop();}
});

for(const mode of ['same-target','native-control'])test('pending VIEW disables old delegated link and newly rendered link: '+mode,async()=>{const f=setupCurrent({mode});try{f.nav.setNativeNavigationPending(true);assert.equal(f.link.getAttribute('aria-disabled'),'true');assert.equal(f.link.click().defaultPrevented,true);assert.equal(f.commands.length,0);f.nav.updateFrameProjection(projection());const link=f.pane().querySelectorAll('a').find(n=>n.getAttribute('data-ref-id')==='P2_0');assert.equal(link.getAttribute('aria-disabled'),'true');link.click();assert.equal(f.commands.length,0);f.nav.setNativeNavigationPending(false);assert.equal(link.getAttribute('aria-disabled'),null);link.click();assert.equal(f.commands.length,1);f.reply({state:'unconfirmed'});await tick();}finally{f.nav.stop();}});

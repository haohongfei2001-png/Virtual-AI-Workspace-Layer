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
  focus(options){this.focusOptions=options;let root=this;while(root.parentNode)root=root.parentNode;root.activeElement=this;}
  getBoundingClientRect(){return {top:0,bottom:50,height:50,width:300};}
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

function geometry(f,id='P1'){const viewport=f.nav.roots().workspace?.scroller??f.pane().querySelector('.themes'),target=f.pane().querySelector(`[data-theme-id="${id}"]`)??f.pane().querySelectorAll('[data-focus-key]').find(n=>n.dataset.focusKey==='theme:'+id);viewport.getBoundingClientRect=()=>({top:100,bottom:300,height:200});target.getBoundingClientRect=()=>({top:350,bottom:400,height:50});return {viewport,target};}
test('exact Project card scroll/focus preserves history, query bounds and frozen session',()=>{
 const requests=[],f=fixture('workspace',q=>requests.push(q)),d=projection();d.segment=3;d.navigation.hasNewer=true;f.nav.updateFrameProjection(d);f.nav.showWorkspace();const before=structuredClone(d.viewSession),{viewport,target}=geometry(f);viewport.scrollTop=20;
 assert.equal(target.getAttribute('tabindex'),'-1');assert.equal(target.getAttribute('data-focus-key'),'project:P1');assert.equal(f.nav.revealNativeProject({projectId:'P1',focus:true}),true);assert.equal(viewport.scrollTop,120);assert.deepEqual(target.focusOptions,{preventScroll:true});assert.equal(f.nav.view().segment,3);assert.deepEqual(d.viewSession,before);assert.deepEqual(requests,[]);assert.equal(f.nav.view().sidebarOpen.size,0);f.nav.stop();
});
test('same-name missing ID never matches and no pending target revives on later DTO',()=>{
 const f=fixture(),d=projection();for(const g of d.groups.items)g.name='Same';f.nav.updateFrameProjection(d);assert.equal(f.nav.revealNativeProject({projectId:'missing',focus:true}),false);const next=structuredClone(d);next.groups.items[0].id='missing';f.nav.updateFrameProjection(next);assert.equal(f.nav.view().sidebarOpen.size,0);assert.equal(f.pane().activeElement,undefined);f.nav.stop();assert.equal(f.nav.revealNativeProject({projectId:'missing'}),false);
});
test('sidebar expands only exact group and retains unrelated expansion with preview requiring no request',()=>{
 const requests=[],f=fixture('sidebar',q=>requests.push(q));f.nav.updateFrameProjection(projection('sidebar'));f.button('侧栏主题 Original P2').click();requests.length=0;assert.equal(f.nav.revealNativeProject({projectId:'P1'}),true);assert.deepEqual([...f.nav.view().sidebarOpen],['P2','P1']);assert.equal(f.button('侧栏主题 Original P1').getAttribute('aria-expanded'),'true');assert.deepEqual(requests,[]);f.nav.stop();
});
test('missing sidebar preview requests only current member page with existing segment and group page',()=>{
 const requests=[],f=fixture('sidebar',q=>requests.push(q)),d=projection('sidebar');d.groups.items[1].lists.current=page([],4);f.nav.updateFrameProjection(d);assert.equal(f.nav.revealNativeProject({projectId:'P1'}),true);assert.deepEqual(requests,[{role:'sidebar',segment:0,offset:0,limit:24,groupId:'P1',list:'current',rowOffset:0,rowLimit:5}]);f.nav.stop();
});
test('reading, hidden and implicit focus never steal focus',()=>{
 for(const mode of ['reading','hidden','implicit']){const f=fixture();f.nav.updateFrameProjection(projection());f.nav.showWorkspace();if(mode==='reading')f.nav.enterReading();if(mode==='hidden')f.doc.visibilityState='hidden';const {target}=geometry(f);assert.equal(f.nav.revealNativeProject({projectId:'P1',focus:mode!=='implicit'}),mode==='implicit');assert.equal(target.focusOptions,undefined);f.nav.stop();}
});
test('search, workset and invalidated projection reject without changing presentation',()=>{
 for(const mode of ['search-known','show-working-set']){const f=fixture();f.nav.updateFrameProjection(projection());f.nav.present({kind:mode});assert.equal(f.nav.revealNativeProject({projectId:'P1',focus:true}),false);f.nav.stop();}
 const f=fixture();f.nav.updateFrameProjection(projection());f.nav.invalidate();assert.equal(f.nav.revealNativeProject({projectId:'P1'}),false);f.nav.stop();
});

// A browser can retain shadowRoot.activeElement after focus moved to the host.
test('background frame render does not restore a stale shadow focus over native host focus',()=>{
 const f=fixture();f.nav.updateFrameProjection(projection());const old=f.button('工作空间设置');old.focus();assert.equal(f.pane().activeElement,old);f.doc.hasFocus=()=>false;
 f.nav.updateFrameProjection(projection());const replacement=f.button('工作空间设置');assert.notEqual(replacement,old);assert.equal(replacement.focusOptions,undefined);f.nav.stop();
});

test('foreground frame render preserves owned keyboard focus when document stays focused',()=>{
 const f=fixture();f.nav.updateFrameProjection(projection());f.doc.hasFocus=()=>true;const old=f.button('工作空间设置');old.focus();f.nav.updateFrameProjection(projection());const replacement=f.button('工作空间设置');assert.notEqual(replacement,old);assert.deepEqual(replacement.focusOptions,{preventScroll:true});assert.equal(f.pane().activeElement,replacement);f.nav.stop();
});
test('frame losing focus between capture and restore never focuses replacement',()=>{
 const f=fixture();f.nav.updateFrameProjection(projection());const old=f.button('工作空间设置');old.focus();let checks=0;f.doc.hasFocus=()=>++checks===1;f.nav.updateFrameProjection(projection());const replacement=f.button('工作空间设置');assert.ok(checks>=2,'capture and restore each independently check focus');assert.notEqual(replacement,old);assert.equal(replacement.focusOptions,undefined);f.nav.stop();
});

test('workspaceEntered exits special search through existing workspace presentation while retaining history',()=>{const requests=[],f=fixture('workspace',q=>{requests.push(q);return null;});assert.equal(f.nav.workspaceEntered(),false);const d=projection();d.segment=3;d.navigation.hasNewer=true;f.nav.updateFrameProjection(d);f.nav.present({kind:'search-known',query:'needle'});const before={segment:f.nav.view().segment,intents:f.intents.length};assert.equal(f.nav.workspaceEntered(),true);assert.equal(f.nav.view().mode,'workspace');assert.equal(f.nav.view().segment,before.segment);assert.deepEqual(f.intents.slice(before.intents),[{kind:'show-workspace'}]);assert.equal(requests.at(-1).segment,3);assert.equal(requests.at(-1).search,undefined);assert.equal(f.pane().querySelectorAll('input').length,0);f.nav.stop();assert.equal(f.nav.workspaceEntered(),false);});
test('reading focus request remains pending until explicit workspace entry and successful focus',()=>{const f=fixture();f.nav.updateFrameProjection(projection());const {viewport,target}=geometry(f);assert.equal(f.nav.view().mode,'reading');assert.equal(f.nav.revealNativeProject({projectId:'P1',focus:true}),false);assert.equal(viewport.scrollTop,0);f.nav.workspaceEntered();assert.equal(f.nav.revealNativeProject({projectId:'P1',focus:true}),true);assert.equal(f.pane().activeElement,target);f.nav.stop();});
test('hidden or zero-height sidebar cannot consume reveal or change expansion',()=>{for(const mode of ['hidden','zero']){const f=fixture('sidebar');f.nav.updateFrameProjection(projection('sidebar'));if(mode==='hidden')f.doc.visibilityState='hidden';else f.pane().querySelector('.themes').getBoundingClientRect=()=>({height:0});assert.equal(f.nav.revealNativeProject({projectId:'P1'}),false);assert.equal(f.nav.view().sidebarOpen.has('P1'),false);f.nav.stop();}});
test('background or unsuccessful focus is not a successful reveal',()=>{for(const mode of ['background','noop']){const f=fixture();f.nav.updateFrameProjection(projection());f.nav.workspaceEntered();const {target}=geometry(f);if(mode==='background')f.doc.hasFocus=()=>false;else target.focus=()=>{};assert.equal(f.nav.revealNativeProject({projectId:'P1',focus:true}),false);assert.equal(f.pane().activeElement,undefined);f.nav.stop();}});

test('needsNativeProject only reports exact missing ID in visible workspace and changes nothing',()=>{const f=fixture();assert.equal(f.nav.needsNativeProject('absent'),false);f.nav.updateFrameProjection(projection());assert.equal(f.nav.needsNativeProject('absent'),false);f.nav.workspaceEntered();const before={segment:f.nav.view().segment,scroll:f.nav.view().scroll,intents:f.intents.length,open:[...f.nav.view().sidebarOpen]};assert.equal(f.nav.needsNativeProject('P1'),false);assert.equal(f.nav.needsNativeProject('absent'),true);for(const id of ['',null,'wrong/id','constructor','x'.repeat(129)])assert.equal(f.nav.needsNativeProject(id),false);assert.deepEqual({segment:f.nav.view().segment,scroll:f.nav.view().scroll,intents:f.intents.length,open:[...f.nav.view().sidebarOpen]},before);assert.equal(f.pane().activeElement,undefined);f.nav.stop();assert.equal(f.nav.needsNativeProject('absent'),false);});
test('needsNativeProject rejects hidden reading search workset and held interaction states',()=>{for(const mode of ['hidden','zero','reading','search-known','show-working-set','pointer']){const f=fixture();f.nav.updateFrameProjection(projection());f.nav.workspaceEntered();if(mode==='hidden')f.doc.visibilityState='hidden';else if(mode==='zero')f.nav.roots().workspace.scroller.getBoundingClientRect=()=>({height:0});else if(mode==='reading')f.nav.enterReading();else if(mode==='pointer')f.doc.handlers.get('pointerdown')?.({target:f.doc.body,isTrusted:true,pointerId:1,composedPath:()=>[f.nav.roots().workspace.n]});else f.nav.present({kind:mode});assert.equal(f.nav.needsNativeProject('absent'),false,mode);f.nav.stop();}});

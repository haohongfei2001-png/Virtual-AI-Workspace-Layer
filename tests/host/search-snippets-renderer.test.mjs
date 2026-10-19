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
function searchDto(matches=[{id:'s1',preview:'First preview'},{id:'s2',preview:'Second preview'}],current='C'){const dto=projection();dto.current={refId:current,nativeUrl:`https://chatgpt.com/c/${current}`,projectId:null};dto.search={query:'selected',projectId:null,offset:0,limit:24,items:[{...row('C'),snippetMatches:matches}],total:1,hasMore:false};return dto;}
function setup(callback){const f=fixture('workspace',()=>null,null,null,{nativeHref:u=>u,navigationPlan:r=>({plan:{mode:'href',disposition:'new-tab-preserve-current',target:{kind:'resolved',entity:'conversation',nativeId:r.id,navigationURL:r.nativeUrl}}})},{onSnippetLocateRequest:callback});return {...f,locates:()=>f.pane().querySelectorAll('button').filter(n=>n.getAttribute('aria-label')==='定位片段'),text:()=>{const root=f.nav.roots()?.workspace;if(!root)return '';const walk=n=>[n.textContent,...n.children.flatMap(walk)];return walk(root.shadow).join(' ');}};}
test('each matching snippet has a separate preview and current-conversation locate action',async()=>{const calls=[],f=setup(async m=>{calls.push(m);return {ok:true};});f.nav.updateFrameProjection(searchDto());assert(f.text().includes('First preview'));assert(f.text().includes('Second preview'));assert.equal(f.locates().length,2);f.locates()[1].click();await tick();assert.deepEqual(calls,[{id:'s2'}]);f.nav.stop();});
test('locate is bounded single-flight and reports failure without losing native row',async()=>{const calls=[];let resolve;const f=setup(m=>{calls.push(m);return new Promise(r=>resolve=r);});f.nav.updateFrameProjection(searchDto());const buttons=f.locates();buttons[0].click();buttons[0].click();buttons[1].click();assert.equal(calls.length,1);resolve({ok:false,reason:'PRIVATE'});await tick();assert(f.text().includes('原生搜索'));assert(!f.text().includes('PRIVATE'));assert(f.pane().querySelector('[data-ref-id="C"]'));f.nav.stop();});
test('other conversation remains a normal native link and never gets locate actions',()=>{const f=setup(()=>{throw Error('unexpected');});f.nav.updateFrameProjection(searchDto(undefined,'D'));assert.equal(f.locates().length,0);const row=f.pane().querySelector('[data-ref-id="C"]');assert.equal(row.href,'https://chatgpt.com/c/C');assert.equal(row.target,'_blank');assert(f.text().includes('原聊天'));assert(f.text().includes('已保存片段'));f.nav.stop();});
for(const change of ['query','route','scope','stop'])test('late locate result cannot overwrite changed '+change,async()=>{let resolve;const f=setup(()=>new Promise(r=>resolve=r));f.nav.updateFrameProjection(searchDto());f.locates()[0].click();if(change==='stop')f.nav.stop();else{const dto=searchDto();if(change==='query'){const input=f.pane().querySelector('input');input.value='new query';input.oninput();dto.search.query='new query';}if(change==='route')dto.current={refId:'D',nativeUrl:'https://chatgpt.com/c/D',projectId:null};if(change==='scope')dto.scope='scopeB';f.nav.updateFrameProjection(dto);}const before=f.text();resolve({ok:false});await tick();assert.equal(f.text(),before);if(change==='stop'){assert.equal(f.nav.roots(),null);assert.equal(f.doc.body.children.length,0);}f.nav.stop();});
for(const change of [r=>({...r,anchor:{}}),r=>({...r,messageId:'m'}),r=>({...r,bodyHash:'a'.repeat(64)}),r=>({...r,preview:'x'.repeat(161)}),r=>({...r,id:''})])test('snippet DTO rejects extra authority fields and invalid bounds '+String(change),()=>{const f=setup(()=>{});assert.throws(()=>f.nav.updateFrameProjection(searchDto([change({id:'s',preview:'x'})])),/invalid-frame/);f.nav.stop();});
test('one hundred snippets of 160 characters fit, one hundred and one rejects',()=>{const f=setup(()=>{}),items=Array.from({length:100},(_,i)=>({id:'s'+i,preview:'x'.repeat(160)}));f.nav.updateFrameProjection(searchDto(items));assert.equal(f.locates().length,100);assert.throws(()=>f.nav.updateFrameProjection(searchDto([...items,{id:'extra',preview:'x'}])),/invalid-frame/);f.nav.stop();});

test('search project has native project link, distinct identity and no conversation commands',()=>{
 const p={kind:'project',id:'C',nativeName:'Known project',nativeUrl:'https://chatgpt.com/g/C/project',available:true,freshness:'unknown'};
 const f=fixture('workspace',()=>null,null,()=>{throw Error('project cannot enter working set');},{nativeHref:u=>u,projectNavigationPlan:r=>({plan:{mode:'href',disposition:'new-tab-preserve-current',target:{kind:'resolved',entity:'project',nativeId:r.id,navigationURL:r.nativeUrl}}})});
 const dto=searchDto();dto.search.items=[p,row('C')];dto.search.total=2;f.nav.updateFrameProjection(dto);const link=f.pane().querySelector('[data-project-id="C"]');assert(link);assert.equal(link.href,p.nativeUrl);assert.equal(link.target,'_blank');assert(f.pane().querySelector('[data-ref-id="C"]'));assert.equal(link.dataset.focusKey,'project:search:C');f.nav.stop();
});
for(const invalid of ['snippet','duplicate','unknown-kind'])test('renderer rejects unsafe search project '+invalid,()=>{const f=setup(()=>{}),p={kind:'project',id:'P',nativeName:null,nativeUrl:null,available:true,freshness:'unknown'},dto=searchDto();if(invalid==='snippet')p.snippetMatches=[{id:'s',preview:'x'}];if(invalid==='unknown-kind')p.kind='workspace';dto.search.items=invalid==='duplicate'?[p,{...p}]:[p];dto.search.total=dto.search.items.length;assert.throws(()=>f.nav.updateFrameProjection(dto),/invalid-frame-search/);f.nav.stop();});

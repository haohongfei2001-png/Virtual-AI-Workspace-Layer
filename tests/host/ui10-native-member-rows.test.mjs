import {UI10_CURRENT_MEMBER_ROWS,assertUi10CurrentMemberIds} from './ui10-native-member-rows.mjs';
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
  getAttribute(k){return this.attrs[k]??null;}
  hasAttribute(k){return k in this.attrs;}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.isConnected=false;}
  attachShadow(){return this.shadowRoot=new Element('shadow');}
  cloneNode(){const n=new Element(this.tagName);n.attrs={...this.attrs};return n;}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  removeEventListener(){}
  click(){for(const fn of this.events.click??[])fn({button:0,preventDefault(){},composedPath:()=>[this]});}
  focus(){}
  getBoundingClientRect(){return {height:0,width:0};}
  matches(selector){const attr=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(attr)return this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);return selector.startsWith('.')?(this.className??'').split(' ').includes(selector.slice(1)):this.tagName===selector;}
  querySelectorAll(selector){const direct=selector.startsWith(':scope > ');if(direct)selector=selector.slice(9);const out=[];const walk=n=>{for(const c of n.children){if(c.matches(selector))out.push(c);if(!direct)walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
 }
 const documentEvents=new Map();
 doc={emit(type,event){for(const fn of documentEvents.get(type)??[])fn(event);},defaultView:{setTimeout,clearTimeout,addEventListener(){},removeEventListener(){},crypto},addEventListener(type,fn){const handlers=documentEvents.get(type)??[];handlers.push(fn);documentEvents.set(type,handlers);},removeEventListener(){},createElement:tag=>new Element(tag)};doc.body=new Element('body');return doc;
}
const row=id=>({id,nativeTitle:`Native ${id}`,displayTitle:`Native ${id}`,nativeUrl:`https://chatgpt.com/c/${id}`,membership:'NONE',projectId:null,segment:0});
const page=(items=[],total=items.length,offset=0,limit=5)=>({items,total,offset,limit,hasMore:offset+items.length<total});
function projection(role='workspace'){
 const group=id=>({id,name:`Original ${id}`,nativeName:`Original ${id}`,segment:0,nativeUrl:null,lists:{current:page([row(`${id}_0`)],1000),old:page([row(`${id}_old`)],30),unknown:page()}});
 return {protocol:'vaiwl-free-frame/1',role,scope:'scopeA',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:true,maxSegment:8},groups:page([group('P2'),group('P1')],100,0,24),entries:{noProject:{...page(),inventoryTotal:10},unknown:{...page([row('unknown')]),inventoryTotal:1}},selection:null};
}
function fixture(role='workspace',callback=()=>null,onHorizonRequest=null,onWorkingSetRequest=null){const doc=dom(),intents=[];const nav=createNavigation({document:doc,surface:{role,root:doc.body},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onHorizonRequest,onWorkingSetRequest,onProjectionRequest:callback,onPresentationRequest:v=>intents.push(v)});const pane=()=>nav.roots()[role].shadow;return {doc,nav,pane,intents,button:label=>pane().querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label)};}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};

function currentNodes(members){return members.children.flatMap(n=>n.matches('.row')?[n]:n.matches('.working-set-row')?n.children.filter(c=>c.matches('.row')):[]);}
for(const wrapped of [false,true])test(`real renderer ${wrapped?'MV3-workset-wrapped':'bare'} current rows retain exact five and exclude expanded old rows`,()=>{
 const f=fixture('workspace',()=>null,null,wrapped?async()=>({ok:true}):null),dto=projection();dto.groups.items=dto.groups.items.slice(0,1);const group=dto.groups.items[0],allowed=Array.from({length:17},(_,i)=>'current_'+i);group.lists.current=page(allowed.slice(0,5).map(row),17);group.lists.old=page(Array.from({length:5},(_,i)=>row('old_'+i)),17);group.lists.unknown=page();
 try{f.nav.updateFrameProjection(dto);const members=()=>f.pane().querySelector('.members');assert.equal(members().children.filter(n=>n.matches('.row')).length,wrapped?0:5,'reproduce old direct-child oracle failure');assertUi10CurrentMemberIds(currentNodes(members()).map(n=>n.getAttribute('data-ref-id')),5,allowed);
 f.button('展开旧窗口 '+group.name).click();assert.equal(f.pane().querySelector('.old-list').querySelectorAll('.row').length,5);assert.equal(members().querySelectorAll('.row').length,10,'broad descendant selector would mix old/current');assertUi10CurrentMemberIds(currentNodes(members()).map(n=>n.getAttribute('data-ref-id')),5,allowed);assert.throws(()=>assertUi10CurrentMemberIds(members().querySelectorAll('.row').map(n=>n.getAttribute('data-ref-id')),5,allowed));
 group.lists.current=page(allowed.map(row),17,0,17);f.nav.updateFrameProjection(dto);assertUi10CurrentMemberIds(currentNodes(members()).map(n=>n.getAttribute('data-ref-id')),17,allowed);
 }finally{f.nav.stop();}
});
test('current selector permits exactly bare/direct-wrapper paths and forbids descendant broadening',()=>{assert.equal(UI10_CURRENT_MEMBER_ROWS,'.card .members > .row, .card .members > .working-set-row > .row');});
test('row count, uniqueness and current ID membership remain mandatory',()=>{const allowed=Array.from({length:17},(_,i)=>'current_'+i);assert(assertUi10CurrentMemberIds(allowed,17,allowed));for(const ids of [allowed.slice(1),[...allowed,'extra'],[...allowed.slice(0,16),allowed[0]],[...allowed.slice(0,16),'old_0']])assert.throws(()=>assertUi10CurrentMemberIds(ids,17,allowed));});

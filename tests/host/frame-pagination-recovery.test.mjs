import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';
import {freeNavigationSnapshot} from '../../src/navigation/free-view.mjs';
import {projectFreeFrame} from '../../src/runtime/free-frame-projection.mjs';
// L: production navigation, client and projection; DOM/runtime authority doubles.
// No browser layout, authenticated worker or IndexedDB claim.
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

const drain=async()=>{for(let i=0;i<200;i++)await Promise.resolve();};
for(const longTitles of [true,false])test('L real more-button events traverse 603 '+(longTitles?'long-title rows after byte-budget shrinking':'short-title rows with normal expansion'),async t=>{
 const refs=Array.from({length:603},(_,i)=>({id:'conversation_'+i,scope:'scope',nativeTitle:'原'.repeat(longTitles?1000:1)+i,nativeUrl:'https://chatgpt.com/c/conversation_'+i,membership:'UNKNOWN',projectId:null,activityDecision:{segment:null}}));
 const snapshot=freeNavigationSnapshot({scope:'scope',viewMode:'free',revision:1,workspaceRevision:0,evidenceRevision:'0:0',viewRevision:0,viewSession:{H:30,T:20740,Z:'UTC',policyRevision:0},projects:[],refs,inventoryComplete:false});
 const document=dom(),privateRoot=document.createElement('section');document.body.append(privateRoot);
 document.defaultView.parent={postMessage(){}};
 const calls=[],rejections=[],states=[],timers=new Map();let next=0;
 const grant={id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'workspace',expiresAt:new Date(21000).toISOString()};
 const runtime={connect:()=>({onMessage:{addListener(){},removeListener(){}},onDisconnect:{addListener(){},removeListener(){}},disconnect(){}}),sendMessage:async message=>{
  if(message.type!=='HOST_UI_VIEW')return {ok:true,grant};
  calls.push({...message.query});
  try{return {ok:true,state:'ready',page:projectFreeFrame({snapshot},{...message.query,role:'workspace'}),navigation:[]};}
  catch(error){assert.equal(error.message,'free-frame-page-too-large');rejections.push({...message.query});return {ok:false,reason:error.message};}
 }};
 const client=createFreeFrameClient({document,privateRoot,runtime,role:'workspace',parentOrigin:'https://chatgpt.com',now:()=>1000,elapsedNow:()=>1000,makeNonce:()=> 'nonce',onState:value=>states.push(value),schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},cancel:id=>timers.delete(id)});
 t.after(()=>client.stop());await client.start();await drain();
 function all(root,selector){return [...root.querySelectorAll(selector),...root.children.flatMap(child=>child.shadowRoot?all(child.shadowRoot,selector):all(child,selector))];}
 const visible=()=>new Set(all(privateRoot,'[data-ref-id]').map(node=>node.getAttribute('data-ref-id')));
 const seen=visible();assert.equal(seen.size,5);let stalled=0;const actualPages=new Map([[0,visible()]]);
 for(let click=0;click<200&&seen.size<603;click++){
  const button=all(privateRoot,'button').find(node=>node.getAttribute('aria-label')==='显示更多归属待核对');
  assert(button,'remaining rows must have an actual more button');
  const before=seen.size;button.click();await drain();for(const id of visible())seen.add(id);
  stalled=seen.size>before?0:stalled+1;assert(stalled<=1,'at most one click may negotiate a smaller page; queries='+JSON.stringify(calls.slice(-12)));
  actualPages.set(calls.at(-1).rowOffset??0,visible());
  if(!longTitles&&click===0){assert.equal(visible().size,17);assert.equal(calls.at(-1).rowOffset,0);assert.equal(calls.at(-1).rowLimit,17);}
 }
 assert.equal(rejections.length>0,longTitles,'only long titles exercise actual 64 KiB projection rejection');
 assert(calls.some(query=>query.rowOffset>0),'navigation must advance actual row offset');
 assert.deepEqual([...seen].sort(),refs.map(ref=>ref.id).sort());
 const finalOffset=calls.at(-1).rowOffset,previousButton=all(privateRoot,'button').find(node=>node.getAttribute('aria-label')==='返回前页归属待核对');
 assert(previousButton);previousButton.click();await drain();const previousOffset=calls.at(-1).rowOffset;
 assert(previousOffset<finalOffset,'actual previous button must move backwards');assert(actualPages.has(previousOffset),'previous page was actually rendered earlier');assert.deepEqual(visible(),actualPages.get(previousOffset));
 assert(!states.some(state=>state.state==='failed'));
});

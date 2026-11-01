import test from 'node:test';
import assert from 'node:assert/strict';
import {installTreeWalkerDouble} from './tree-walker-double.mjs';
import {createChatGPTAdapter} from '../../src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
const C='33333333-3333-4333-8333-333333333333';
// Production adapter/discovery; explicit local DOM doubles, not browser evidence.
function fixture(){
 let masked=false,observer;const selectors=new Map(),listeners=new Map(),packets=[],passes=[];
 const document={location:{href:'https://chatgpt.com/c/'+C},documentElement:{dataset:{}},querySelectorAll:s=>selectors.get(s)??[],querySelector:()=>null,addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t)};
 function node(tag='DIV',parent=null,attrs={},text=''){
  const n={tagName:tag,parentNode:parent,parentElement:parent,ownerDocument:document,isConnected:true,hidden:false,attrs,textContent:text,children:[],style:{display:'block',visibility:'visible'},getAttribute:k=>attrs[k]??null,hasAttribute:k=>Object.hasOwn(attrs,k),getClientRects:()=>[{}],getBoundingClientRect:()=>({x:220,y:70,width:700,height:400}),contains(other){for(let p=other;p;p=p.parentElement)if(p===n)return true;return false;},querySelectorAll:()=>n.children};parent?.children.push(n);return n;
 }
 const main=node('MAIN'),header=node('HEADER',main),heading=node('H1',header,{},'Current title'),reading=node('SECTION',main,{'data-conversation-id':C}),composer=node('FORM',main),slot=node('DIV',header),history=node('NAV');
 history.getBoundingClientRect=()=>({x:0,y:70,width:200,height:400});header.getBoundingClientRect=()=>({x:220,y:0,width:700,height:60});composer.getBoundingClientRect=()=>({x:220,y:480,width:700,height:90});slot.getBoundingClientRect=()=>({x:220,y:0,width:40,height:40});
 for(let i=0;i<300;i++){const id='11111111-1111-4111-8111-'+i.toString(16).padStart(12,'0');node('A',history,{href:'https://chatgpt.com/c/'+id},'Native '+i+' '+ 'x'.repeat(180));}
 for(const [s,n]of [[LEGACY_SURFACE_PROFILE.regions.history,history],['main > header',header],['main > section[aria-label="Conversation"]',reading],['main > form#composer',composer],['main > header > .navigation-slot',slot],[LEGACY_SURFACE_PROFILE.currentConversationReading,reading],[LEGACY_SURFACE_PROFILE.currentConversationHeader,heading]])selectors.set(s,[n]);
 document.defaultView={crypto,getComputedStyle:n=>({...n.style,visibility:masked&&n===reading?'hidden':n.style.visibility}),MutationObserver:class{constructor(cb){observer=this;this.cb=cb;}observe(){}disconnect(){}},addEventListener(){},removeEventListener(){}};installTreeWalkerDouble(document);
 const profile={...LEGACY_SURFACE_PROFILE,currentBody:undefined},binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(100000).toISOString()},isOwnedMask=n=>masked&&n===reading;
 const adapter=createChatGPTAdapter({document,profile,isOwnedMask,now:()=>0});
 return {document,history,binding,adapter,packets,passes,requestScan:()=>listeners.get('toggle')?.({type:'toggle'}),start:emit=>adapter.start({binding,ingestionPass:async m=>{passes.push(m);return {ok:true};},emit})};
}
const settle=async()=>{for(let i=0;i<100;i++)await new Promise(resolve=>setImmediate(resolve));};
// L only: production adapter, discovery and wire splitter with a local DOM/ACK double.
// No native action dispatch, worker owner, persistence, or browser certification.
for(const failure of ['unknown','retry-budget'])for(const recovery of ['renewal','explicit-rescan'])test(`${failure} mid-page failure permits a later independent ${recovery} to recover unchanged refs`,async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());
 const accepted=new Set(),failed=new Set();let calls=0,inject=true;
 await f.start(async p=>{
  f.packets.push(p);assert.equal(p.kind,'surface-delta','recovery must not manufacture native send');
  const ids=p.payload.candidates.map(c=>c.target.nativeId);
  if(inject&&++calls===2){for(const id of ids)failed.add(id);return failure==='unknown'?{state:'unknown',localSeq:p.localSeq}:{state:'retry-after',localSeq:p.localSeq,delayMs:6500};}
  for(const id of ids)accepted.add(id);
  return {state:'accepted',localSeq:p.localSeq,receiptId:'fixture'};
 });
 await settle();
 assert(failed.size>0,'fixture must fail an actual nonempty split packet');
 assert(f.packets[0].payload.candidates.length<256,'the first discovery page must split into wire packets');
 assert(f.packets[0].payload.candidates.some(c=>accepted.has(c.target.nativeId)),'earlier split packet ACK survives');
 assert([...failed].some(id=>!accepted.has(id)),'failure must leave genuinely missing refs');
 const sent=new Set(f.packets.flatMap(p=>p.payload.candidates.map(c=>c.target.nativeId)));
 assert(f.history.children.some(n=>!sent.has(n.attrs.href.split('/').at(-1))),'later fragments must have been dropped before any emission');
 const before=f.packets.length;await settle();assert.equal(f.packets.length,before,'no automatic retry loop after exhausted attempt');
 inject=false;
 if(recovery==='renewal')assert.equal(f.adapter.updateBinding({...f.binding,expiresAt:new Date(20000).toISOString()}),true);
 else f.requestScan();
 await settle();
 const expected=new Set([C,...f.history.children.map(n=>n.attrs.href.split('/').at(-1))]);
 assert.deepEqual([...accepted].sort(),[...expected].sort(),'independent read must recover failed and never-sent fragments of unchanged page');
 const complete=f.packets.length;await settle();assert.equal(f.packets.length,complete,'successful recovery also reaches quiescence');
});

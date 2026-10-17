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
 for(let i=0;i<800;i++){const id='11111111-1111-4111-8111-'+i.toString(16).padStart(12,'0');node('A',history,{href:'https://chatgpt.com/c/'+id},'Native '+i);}
 for(const [s,n]of [[LEGACY_SURFACE_PROFILE.regions.history,history],['main > header',header],['main > section[aria-label="Conversation"]',reading],['main > form#composer',composer],['main > header > .navigation-slot',slot],[LEGACY_SURFACE_PROFILE.currentConversationReading,reading],[LEGACY_SURFACE_PROFILE.currentConversationHeader,heading]])selectors.set(s,[n]);
 document.defaultView={crypto,getComputedStyle:n=>({...n.style,visibility:masked&&n===reading?'hidden':n.style.visibility}),MutationObserver:class{constructor(cb){observer=this;this.cb=cb;}observe(){}disconnect(){}},addEventListener(){},removeEventListener(){}};installTreeWalkerDouble(document);
 const profile={...LEGACY_SURFACE_PROFILE,currentBody:undefined},binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(100000).toISOString()},isOwnedMask=n=>masked&&n===reading;
 const adapter=createChatGPTAdapter({document,profile,isOwnedMask,now:()=>0});
 return {document,reading,profile,binding,isOwnedMask,adapter,packets,passes,mask:()=>masked=true,loseCurrent:()=>delete reading.attrs['data-conversation-id'],requestScan:()=>listeners.get('toggle')?.({type:'toggle'}),restoreCurrent:()=>reading.attrs['data-conversation-id']=C,start:(change,{eachPacket=false,onPass=()=>{}}={})=>adapter.start({binding,ingestionPass:async m=>{passes.push(m);onPass(m);return {ok:true};},emit:async p=>{packets.push(p);if(eachPacket||packets.length===1)change();return {state:'accepted',localSeq:p.localSeq,receiptId:'fixture'};}})};
}
const settle=async()=>{for(let i=0;i<300;i++)await new Promise(resolve=>setImmediate(resolve));};
const ids=f=>new Set(f.packets.flatMap(p=>p.payload.candidates).map(c=>c.target.nativeId));
test('owned mask on the exact current reading root alone preserves the finite directory cursor',async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());await f.start(f.mask);await settle();assert.equal(ids(f).size,801);assert.deepEqual(f.passes.map(m=>m.phase),['start','end']);
});
test('current identity lost between finite pages atomically replaces stale pass and restarts all loaded refs',async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());await f.start(()=>{f.mask();f.loseCurrent();});await settle();
 assert.equal(ids(f).size,801,'already accepted current plus every loaded history ref remain reachable');
 assert.deepEqual(f.passes.map(m=>m.phase),['start','start','end'],'fresh start replaces stale pass without a cancel scheduling gap');
 assert(f.passes[1].passSeq>f.passes[0].passSeq);assert.equal(f.passes[1].passSeq,f.passes[2].passSeq);
});

for(const renewal of [false,true])test('unstable identity exhausts one restart'+(renewal?' even across pure binding renewal':''),async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());let passSeq=0,changedPass=0,unstable=true;
 await f.start(()=>{
  if(!unstable||changedPass===passSeq)return;changedPass=passSeq;
  if(f.reading.attrs['data-conversation-id'])f.loseCurrent();else f.restoreCurrent();
  if(renewal)assert.equal(f.adapter.updateBinding({...f.binding,expiresAt:new Date(20000).toISOString()}),true);
 },{eachPacket:true,onPass:m=>{if(m.phase==='start')passSeq=m.passSeq;}});
 await settle();assert.deepEqual(f.passes.map(m=>m.phase),['start','start','cancel'],'one stale restart, then terminal cancellation without false end');
 assert.equal(f.passes[1].passSeq,f.passes[2].passSeq);const count=f.packets.length;await settle();assert.equal(f.packets.length,count,'exhaustion cannot spin or replay automatically');
 unstable=false;f.requestScan();await settle();assert.equal(ids(f).size,801);assert.deepEqual(f.passes.map(m=>m.phase),['start','start','cancel','start','end'],'real later scan may recover with fresh bounded attempt');
});
for(const mode of ['stop','route'])test(mode+' during first page cannot restart or publish an old tail',async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());await f.start(()=>{f.loseCurrent();if(mode==='stop')f.adapter.stop();else f.document.location.href='https://chatgpt.com/';});
 await settle();assert.equal(f.packets.length,1);assert.deepEqual(f.passes.map(m=>m.phase),['start','cancel']);const count=f.packets.length;f.requestScan();await settle();assert.equal(f.packets.length,count);
});

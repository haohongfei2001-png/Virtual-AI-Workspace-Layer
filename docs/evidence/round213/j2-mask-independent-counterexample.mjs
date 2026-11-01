import {installTreeWalkerDouble} from '/tmp/vaiwl-j2-mask/tests/host/tree-walker-double.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTAdapter} from '/tmp/vaiwl-j2-mask/src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE} from '/tmp/vaiwl-j2-mask/src/host/surface-discovery.mjs';
import {createURLPolicy} from '/tmp/vaiwl-j2-mask/src/host/url-policy.mjs';
const C='33333333-3333-4333-8333-333333333333';
// Minimal visible directory DOM for discovery; these remain offline doubles.
function visibleDirectoryNode(document,parentElement=null){return {ownerDocument:document,parentElement,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:()=>null};}
function fixture(options={}){
 let observer,clock=0;const listeners=new Map(),emitted=[],rebind=[];
 const node=(x,y,width,height)=>({textContent:'',children:[],contains:()=>false,querySelectorAll:()=>[],getBoundingClientRect:()=>({x,y,width,height}),isConnected:true});
 const history=node(0,50,200,500),reading=node(220,70,700,400),header=node(220,0,700,60),composer=node(220,480,700,90),slot=node(220,0,40,40);
 const selectors=new Map([['aside nav[aria-label="Chat history"]',[history]],['main > header',[header]],['main > section[aria-label="Conversation"]',[reading]],['main > form#composer',[composer]],['main > header > .navigation-slot',[slot]]]);
 const documentListeners=new Map();
 const document={addEventListener:(t,f)=>documentListeners.set(t,f),removeEventListener:t=>documentListeners.delete(t),location:{href:`https://chatgpt.com/c/${C}`},documentElement:{dataset:{}},querySelectorAll:s=>selectors.get(s)??[],querySelector:()=>null,defaultView:{getComputedStyle:n=>n.style??{display:'block',visibility:'visible'},crypto,MutationObserver:class{constructor(cb){observer=this;this.cb=cb;}observe(){}disconnect(){this.closed=true;}},addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t)}};
 installTreeWalkerDouble(document);
 const binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'browser-doc',routeEpoch:4,origin:'https://chatgpt.com',expiresAt:new Date(100000).toISOString()};
 const adapter=createChatGPTAdapter({document,profile:{...LEGACY_SURFACE_PROFILE,currentBody:undefined},now:()=>clock,onRebindNeeded:v=>rebind.push(v),...options});
 return {adapter,document,documentListeners,binding,emitted,rebind,selectors,reading,composer,slot,setTime:v=>clock=v,trigger:()=>observer.cb([]),observer:()=>observer,start:emit=>adapter.start({binding,emit:emit??(async p=>{emitted.push(p);return {state:'accepted',localSeq:p.localSeq,receiptId:'r'};})})};
}
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

const settle=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
function bodyFixture(options={}){const f=fixture({profile:LEGACY_SURFACE_PROFILE,...options}),root=f.reading;root.ownerDocument=f.document;root.parentElement=null;root.attrs={'data-conversation-id':C};root.style={display:'block',visibility:'visible'};root.getAttribute=k=>root.attrs[k]??null;root.getClientRects=()=>[{}];f.document.defaultView.getComputedStyle=n=>n.style;const makeMessage=id=>({ownerDocument:f.document,isConnected:true,parentElement:root,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:key=>key==='data-message-id'?id:null,get textContent(){throw Error('message-body-read');},get value(){throw Error('draft-read');}});root.children=[makeMessage('M1')];root.querySelectorAll=selector=>selector==='[data-message-id]'?root.children:[];root.contains=n=>root.children.includes(n);f.selectors.set('main > #reading',[root]);return {...f,makeMessage};}

import {setup,sender} from '/tmp/j2-owner-helper.mjs';
test('audit masked message replacement revokes worker proof before a later ACK read',async()=>{
 const h=await setup();let masked=false;const f=bodyFixture({isOwnedMask:n=>masked&&n===f.reading});

 // Owner profile map retains original key; normalize transport profile only.
 let proof;await f.adapter.start({binding:h.binding,emit:async p=>{f.emitted.push(p);const input=structuredClone(p);input.profileId='legacy';input.profileVersion=1;if(input.kind==='current-object'){input.payload.evidence.profileId='legacy';input.payload.evidence.profileVersion=1;}const ack=await h.service.handle(input,sender);if(ack.bodyProofId)proof=ack.bodyProofId;return ack;}});await settle();
 assert.ok(proof);assert.deepEqual(await h.service.observations.withCurrent(proof,c=>c.messageIds),['M1']);
 masked=true;f.reading.style.visibility='hidden';f.reading.children=[f.makeMessage('M2')];f.reading.children[0].style.visibility='hidden';f.trigger();await settle();
 let entered=false;try{await h.service.observations.withCurrent(proof,c=>{entered=c.guard()===true;return c.messageIds;});}catch{}
 h.service.stop();h.base.close();f.adapter.stop();assert.equal(entered,false,'worker old-M1 proof must not authorize reads after masked body changed to M2');
});

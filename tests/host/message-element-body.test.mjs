import {createContextAssociationBridge} from '../../src/host/context-association.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurrentBodyDiscovery} from '../../src/host/current-body-discovery.mjs';
import {validateCurrentBodyProposal} from '../../src/host/current-body-claim.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';

const C='11111111-1111-4111-8111-111111111111',D='22222222-2222-4222-8222-222222222222';
const url='https://chatgpt.com/c/'+C;
function fixture(){
 let roots=[];
 const document={location:{href:url},defaultView:{getComputedStyle:n=>n.style},querySelectorAll:selector=>{assert.equal(selector,'#reading');return roots;}};
 class Node{
  constructor(messageId,conversationId=C){this.ownerDocument=document;this.isConnected=true;this.parentElement=null;this.children=[];this.style={display:'block',visibility:'visible'};this.attrs={'data-c':conversationId,'data-m':messageId};}
  getAttribute(k){return this.attrs[k]??null;}
  getClientRects(){return [{}];}
  contains(n){return this.children.includes(n);}
  querySelectorAll(s){assert.equal(s,'[data-m]');return this.children;}
  get textContent(){assert.fail('message text must not be read');}
  get value(){assert.fail('draft value must not be read');}
 }
 const root=new Node(null,null);roots=[root];
 const add=(id,c=C)=>{const n=new Node(id,c);n.parentElement=root;root.children.push(n);return n;};
 add('m1');add('m2');
 const profile={id:'message_elements',revision:1,urlPolicy:createURLPolicy(),currentBody:{rootSelector:'#reading',conversationIdAttribute:'data-c',messageSelector:'[data-m]',messageIdAttribute:'data-m',conversationIdSource:'message-elements'}};
 const discovery=createCurrentBodyDiscovery({document,profile,urlPolicy:profile.urlPolicy});
 return {document,profile,root,Node,add,discovery,setRoots:v=>roots=v};
}
function proposal(f,payload=f.discovery.scan()){
 return {protocol:'vaiwl-host-observation/1',documentToken:'document',producerToken:'producer',localSeq:1,routeEpoch:1,profileId:f.profile.id,profileVersion:1,bodyProofId:null,kind:'current-object',payload};
}
function explicitPayload(){return {conversationId:C,messageIds:['m1','m2'],association:'explicit-body-id',regionEpoch:1,evidence:{profileId:'message_elements',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['current-body-message-conversation-ids','current-body-message-ids'],receiptId:null}};}
const validate=(f,p,profile=f.profile)=>validateCurrentBodyProposal(p,{profile,actualURL:url});

test('message attributes establish only a metadata candidate without a root conversation ID',()=>{
 const f=fixture(),a=f.discovery.scan();assert.equal(a.association,'explicit-body-id');assert.equal(a.conversationId,C);assert.deepEqual(a.messageIds,['m1','m2']);assert.deepEqual(a.evidence.fieldPaths,['current-body-message-conversation-ids','current-body-message-ids']);assert.equal(a.evidence.receiptId,null);assert.equal(a.evidence.sourceKind,'native-dom');assert.equal(a.scopeKey,undefined);assert.equal(a.actorVerified,undefined);assert.deepEqual(validate(f,proposal(f,a)),a);
});
for(const [name,change] of Object.entries({
 'wrong conversation':f=>f.root.children[1].attrs['data-c']=D,
 'missing conversation':f=>delete f.root.children[1].attrs['data-c'],
 'invalid message':f=>f.root.children[1].attrs['data-m']='bad id',
 'missing message':f=>delete f.root.children[1].attrs['data-m'],
 'duplicate message':f=>f.root.children[1].attrs['data-m']='m1',
 'empty messages':f=>f.root.children=[],
 'all messages hidden':f=>f.root.children.forEach(n=>n.hidden=true),
 'hidden root':f=>f.root.hidden=true,
 'ambiguous roots':f=>f.setRoots([f.root,new f.Node(null,null)]),
 'non-conversation route':f=>f.document.location.href='https://chatgpt.com/'
}))test('message mode fails closed for '+name,()=>{const f=fixture();change(f);const a=f.discovery.scan();assert.equal(a.association,'unproven');assert.equal(a.conversationId,null);assert.deepEqual(a.messageIds,[]);});
test('hidden unrelated message never supplies identity or visible message IDs',()=>{const f=fixture();f.add('hidden',D).hidden=true;assert.deepEqual(f.discovery.scan().messageIds,['m1','m2']);});
test('256 selected nodes allowed, 257 rejected without inspecting the extra node',()=>{const f=fixture();f.root.children=[];for(let i=0;i<256;i++)f.add('m'+i);assert.equal(f.discovery.scan().messageIds.length,256);const extra=f.add('extra');extra.getAttribute=()=>assert.fail('over-budget attribute read');const a=f.discovery.scan();assert.equal(a.association,'unproven');assert.deepEqual(a.messageIds,[]);});
test('node replacement and removal advance epoch while pure append preserves it',()=>{const f=fixture(),first=f.discovery.scan();assert.equal(first.association,'explicit-body-id');f.add('m3');assert.equal(f.discovery.scan().regionEpoch,first.regionEpoch);const old=f.root.children[0],replacement=new f.Node('m1');replacement.parentElement=f.root;f.root.children[0]=replacement;const second=f.discovery.scan();assert(second.regionEpoch>first.regionEpoch);f.root.children.shift();const removed=f.discovery.scan();assert(removed.regionEpoch>second.regionEpoch);f.root.children.unshift(old);assert.notEqual(f.discovery.scan().regionEpoch,first.regionEpoch);});
test('new field path requires explicit profile mode and at least one message',()=>{const f=fixture(),p=proposal(f,explicitPayload());assert.equal(validate(f,p).association,'explicit-body-id');const legacy={...f.profile,currentBody:{...f.profile.currentBody}};delete legacy.currentBody.conversationIdSource;assert.throws(()=>validate(f,p,legacy),/invalid-current-body-proposal/);p.payload.messageIds=[];assert.throws(()=>validate(f,p),/invalid-current-body-proposal/);});
test('message profile rejects legacy evidence path, invented modes and incomplete config',()=>{const f=fixture(),p=proposal(f,explicitPayload());p.payload.evidence.fieldPaths[0]='current-body-explicit-id';assert.throws(()=>validate(f,p),/invalid-current-body-proposal/);p.payload.evidence.fieldPaths[0]='current-body-message-conversation-ids';for(const config of [{...f.profile.currentBody,conversationIdSource:'auto'},{...f.profile.currentBody,messageIdAttribute:''},{...f.profile.currentBody,extra:true}])assert.throws(()=>validate(f,p,{...f.profile,currentBody:config}),/invalid-current-body-proposal/);});
test('legacy default cannot silently infer conversation from message elements',()=>{const f=fixture(),profile={...f.profile,currentBody:{...f.profile.currentBody}};delete profile.currentBody.conversationIdSource;const discovery=createCurrentBodyDiscovery({document:f.document,profile,urlPolicy:profile.urlPolicy});assert.equal(discovery.scan().association,'unproven');});

test('pre-bind challenge uses explicit message IDs and rechecks current DOM on each challenge',()=>{
 const f=fixture(),listeners=new Set(),runtime={id:'ext',onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
 const bridge=createContextAssociationBridge({document:f.document,runtime,origin:'https://chatgpt.com',profile:f.profile,now:()=>1000,elapsedNow:()=>1000});
 try{
  const command={type:'HOST_CONTEXT_ASSOCIATE',challenge:'first',actualURL:url,conversationId:C,expiresAt:new Date(7000).toISOString()};
  const call=(message,sender={id:'ext'})=>{const replies=[];for(const fn of listeners)fn(message,sender,v=>replies.push(v));return replies;};
  assert.deepEqual(call(command),[{challenge:'first',actualURL:url,conversationId:C,association:'explicit-body-id'}]);
  assert.deepEqual(call(command,{id:'ext',tab:{id:1}}),[]);
  f.root.children[0].attrs['data-c']=D;
  assert(!call({...command,challenge:'second'}).some(r=>r?.association==='explicit-body-id'));
 }finally{bridge.stop();}
 assert.equal(listeners.size,0);
});

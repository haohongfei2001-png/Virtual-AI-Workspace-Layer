import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeFrameClient} from '../../src/host/free-frame-client.mjs';

const settle=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const held=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const C='33333333-3333-4333-8333-333333333333',url=`https://chatgpt.com/c/${C}`;
// Offline lifecycle reconstruction: actual frame client/lifecycle, no DOM authority.
function fixture(){
 let nav,generation=0,timer=0;const pending=[],calls=[],timers=new Map();
 const element=()=>({children:[],setAttribute(){},append(n){n.parent=this;this.children.push(n);},replaceChildren(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}});
 const document={body:element(),createElement:element,defaultView:{parent:{postMessage(){}}}};
 const runtime={connect:()=>({onMessage:{addListener(){},removeListener(){}},onDisconnect:{addListener(){},removeListener(){}},disconnect(){}}),async sendMessage(m){
  calls.push(m);
  if(m.type==='HOST_UI_JOIN'){generation++;return {ok:true,grant:{id:`grant_${generation}`,mountId:`mount_${generation}`,parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:`scope_${generation}`,role:'workspace',expiresAt:new Date(21000).toISOString()}};}
  if(m.type==='HOST_UI_VIEW')return {ok:true,state:'ready',navigation:[],page:{protocol:'vaiwl-free-frame/1',role:'workspace',scope:`scope_${generation}`,completeSnapshot:false,workspaceRevision:5,groups:{items:[]},entries:{noProject:{items:[]},unknown:{items:[]}},selection:null,current:{refId:C,projectId:null,nativeUrl:url},...(m.query.search?{search:{items:[{id:C,snippetMatches:[{id:'saved',preview:'manual text'}]}]}}:{})}};
  if(m.type==='HOST_UI_SNIPPET'){const request=held();pending.push(request);return request.promise;}
  throw Error('unexpected fixture request');
 }};
 const client=createFreeFrameClient({document,runtime,role:'workspace',parentOrigin:'https://chatgpt.com',now:()=>1000,elapsedNow:()=>1000,makeNonce:()=> 'nonce',schedule:fn=>{timers.set(++timer,fn);return timer;},cancel:id=>timers.delete(id),navigationFactory:options=>{nav=options;return {invalidate(){},stop(){},updateFrameProjection(){}};}});
 return {client,pending,calls,get nav(){return nav;},async search(){await nav.onProjectionRequest({search:{query:'manual',projectId:null,offset:0,limit:24}});}};
}

test('late old-generation locate completion cannot unlock a restarted authorized client request',async t=>{
 const f=fixture();t.after(()=>f.client.stop());
 assert.equal(await f.client.start(),true);await settle();await f.search();
 const old=f.nav.onSnippetLocateRequest({id:'saved'});await settle();assert.equal(f.pending.length,1);
 // start() is public and intentionally restarts the real lifecycle with a new grant.
 assert.equal(await f.client.start(),true);await settle();await f.search();
 const fresh=f.nav.onSnippetLocateRequest({id:'saved'});await settle();assert.equal(f.pending.length,2);
 f.pending[0].resolve({ok:true});assert.deepEqual(await old,{ok:false});
 assert.deepEqual(await f.nav.onSnippetLocateRequest({id:'saved'}),{ok:false});
 assert.equal(f.pending.length,2,'old finally must not release the current attempt lock');
 assert.deepEqual(f.calls.filter(m=>m.type==='HOST_UI_SNIPPET').map(m=>m.grantId),['grant_1','grant_2']);
 f.pending[1].resolve({ok:true});assert.deepEqual(await fresh,{ok:true});
 const next=f.nav.onSnippetLocateRequest({id:'saved'});await settle();assert.equal(f.pending.length,3);
 f.pending[2].resolve({ok:true});assert.deepEqual(await next,{ok:true});
});

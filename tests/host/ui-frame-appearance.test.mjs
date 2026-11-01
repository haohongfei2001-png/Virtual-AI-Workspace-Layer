import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiFrameClient} from '../../src/host/ui-frame-client.mjs';
const appearance={theme:'dark',direction:'rtl',fontFamily:'serif',baseFontSize:24};
function fixture(){
 const attrs=new Map([['dir','ltr']]),styles=new Map([['color-scheme',{value:'light',priority:'important'}]]),listeners=new Set(),history=[],requests=[];let timer=0,renders=0,clears=0;
 const root={getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,String(v)),removeAttribute:k=>attrs.delete(k),style:{getPropertyValue:k=>styles.get(k)?.value??'',getPropertyPriority:k=>styles.get(k)?.priority??'',setProperty:(k,v,priority='')=>styles.set(k,{value:String(v),priority}),removeProperty:k=>styles.delete(k)}};
 const body={textContent:'',replaceChildren(){clears++;this.textContent='';}};
 const parent={postMessage(){}};
 const doc={body,documentElement:root,defaultView:{parent,addEventListener:(type,fn)=>{assert.equal(type,'message');listeners.add(fn);history.push(fn);},removeEventListener:(type,fn)=>listeners.delete(fn)}};
 const grant={id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui',scopeGrantId:'scope',role:'sidebar',expiresAt:new Date(21000).toISOString()};
 const runtime={connect:()=>({onDisconnect:{addListener(){},removeListener(){}},onMessage:{addListener(){},removeListener(){}},disconnect(){}}),sendMessage:async m=>{requests.push(m);return {ok:true,grant};}};
 const client=createUiFrameClient({document:doc,runtime,role:'sidebar',parentOrigin:'https://chatgpt.com',now:()=>1000,elapsedNow:()=>1000,makeNonce:()=> 'nonce',schedule:()=>++timer,cancel(){},onGrant(){renders++;body.textContent='private';}});
 const data=(value=appearance)=>({type:'VAIWL_UI_APPEARANCE',role:'sidebar',appearance:value});
 const event=(value=data(),patch={})=>({source:parent,origin:'https://chatgpt.com',data:value,...patch});
 const emit=(value=data(),patch={})=>{for(const fn of listeners)fn(event(value,patch));};
 const snapshot=()=>JSON.stringify({attrs:[...attrs],styles:[...styles]});
 return {client,runtime,grant,root,body,listeners,history,requests,data,event,emit,snapshot,counts:()=>({renders,clears})};
}
test('public appearance changes only presentation and does not read or rerender private data',async()=>{
 const f=fixture();await f.client.start();const requests=f.requests.length,counts=f.counts();f.emit();
 assert.equal(f.root.getAttribute('data-vaiwl-theme'),'dark');assert.equal(f.root.getAttribute('dir'),'rtl');assert.equal(f.root.style.getPropertyValue('--vaiwl-font-scale'),'1.5');assert.equal(f.root.style.getPropertyValue('--vaiwl-font-family'),'serif');
 assert.equal(f.requests.length,requests);assert.deepEqual(f.counts(),counts);assert.equal(f.body.textContent,'private');assert.equal(f.client.isAuthorized(),true);f.client.stop();
});
test('wrong parent, exact origin, role and message shape are rejected without getter evaluation',async()=>{
 const f=fixture();await f.client.start();const before=f.snapshot();let gets=0;
 for(const patch of [{source:{}},{origin:'https://chatgpt.com.evil'},{origin:'https://chatgpt.com/'},{origin:'null'}])f.emit(f.data(),patch);
 const getter=f.data();Object.defineProperty(getter,'appearance',{get(){gets++;return appearance;},enumerable:true});
 for(const value of [null,[],{...f.data(),role:'workspace'},{...f.data(),type:'OTHER'},{...f.data(),extra:1},{...f.data(),[Symbol('extra')]:1},Object.assign(Object.create({}),f.data()),Object.create(f.data()),getter])f.emit(value);
 assert.equal(gets,0);assert.equal(f.snapshot(),before);assert.equal(f.requests.length,1);f.client.stop();
});
test('invalid CSS values and nested record shapes cannot partially apply appearance',async()=>{
 const f=fixture();await f.client.start();const before=f.snapshot();let gets=0;const getter={...appearance};Object.defineProperty(getter,'theme',{get(){gets++;return 'dark';},enumerable:true});
 const invalid=[null,[],{...appearance,theme:'url(https://evil)'},{...appearance,direction:'rtl;display:none'},{...appearance,fontFamily:'serif; color:red'},{...appearance,fontFamily:'private-font'},...[-1,11,33,Infinity,NaN,'16'].map(baseFontSize=>({...appearance,baseFontSize})),{...appearance,extra:1},{...appearance,[Symbol('extra')]:1},Object.assign(Object.create(null),appearance),Object.assign(Object.create({}),appearance),getter];
 for(const value of invalid){f.emit(f.data(value));assert.equal(f.snapshot(),before);}
 assert.equal(gets,0);assert.equal(f.body.textContent,'private');assert.equal(f.requests.length,1);f.client.stop();
});
test('stop restores owned styles and removes listener; historical callbacks cannot cross restart',async()=>{
 const f=fixture(),original=f.snapshot();await f.client.start();const old=f.history[0];f.emit();assert.notEqual(f.snapshot(),original);f.client.stop();assert.equal(f.listeners.size,0);assert.equal(f.snapshot(),original);old(f.event());assert.equal(f.snapshot(),original);assert.equal(f.client.isAuthorized(),false);
 await f.client.start();old(f.event());assert.equal(f.snapshot(),original);assert.equal(f.listeners.size,1);f.emit();assert.notEqual(f.snapshot(),original);f.client.stop();assert.equal(f.snapshot(),original);
});
test('pending join permits cosmetic input but never authorizes or creates private content',async()=>{
 const f=fixture();let resolve;f.runtime.sendMessage=m=>{f.requests.push(m);return new Promise(r=>{resolve=r;});};const pending=f.client.start();for(let i=0;i<10;i++)await Promise.resolve();
 const counts=f.counts();f.emit();assert.equal(f.root.getAttribute('data-vaiwl-theme'),'dark');assert.equal(f.client.isAuthorized(),false);assert.equal(f.body.textContent,'');assert.deepEqual(f.counts(),counts);assert.equal(f.requests.length,1);
 f.client.stop();resolve({ok:true,grant:f.grant});assert.equal(await pending,false);assert.equal(f.client.isAuthorized(),false);assert.equal(f.body.textContent,'');assert.equal(f.root.getAttribute('data-vaiwl-theme'),null);
});

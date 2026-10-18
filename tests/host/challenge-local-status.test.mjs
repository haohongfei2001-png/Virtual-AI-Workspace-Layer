import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHostContentSession} from '../../src/host/content-session.mjs';
import {installLocalStatus,readActiveLocalStatus} from '../../src/host/local-status.mjs';
const source=readFileSync(new URL('./content-session.test.mjs',import.meta.url),'utf8');
const boundary="\ntest('production composition sequences HELLO REFRESH and mount with no page bridge; restart seq is monotonic'";
assert.equal(source.split(boundary).length,2);
const fixture=new Function('assert','createHostContentSession',source.slice(0,source.indexOf(boundary)).replace(/^import .*;\n/gm,'')+'\nreturn fixture;')(assert,createHostContentSession);
const challenge=()=>({ok:true,v:1,type:'HOST_SCOPE_STATUS',state:'unverified',reason:'host-verification-required'});
function setup(reply=challenge()){
 const f=fixture({contextRecovery:true});
 f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?reply:{ok:true,grants:[]});return f;
}
async function popupState(f){
 const remove=installLocalStatus({runtime:f.runtime,readState:()=>f.client.localStatus()});
 try{return await readActiveLocalStatus({tabs:{query:async()=>[{id:1}],sendMessage:async(_id,message)=>{
  let result;for(const listener of [...f.listeners])listener(message,{id:f.runtime.id,url:f.runtime.getURL('status.html')},value=>{result=value;});return result;
 }}});}finally{remove();}
}
test('exact challenge is passive local status through real content session and popup transport',async()=>{
 const f=setup();try{assert.equal(await f.client.start(),null);const count=f.calls.length;
  assert.equal(f.client.localStatus(),'verification-required');assert.equal(await popupState(f),'verification-required');
  await f.advance(30000);assert.equal(f.calls.length,count,'status inspection and elapsed time must not retry authentication');assert.equal(f.client.showWorkspace(),false);
 }finally{f.client.stop();}
});
test('challenge hint is restricted to its original route and explicit stop clears it',async()=>{
 const f=setup();try{await f.client.start();assert.equal(f.client.localStatus(),'verification-required');
  f.document.location.href+='c/other';assert.notEqual(f.client.localStatus(),'verification-required');
  f.client.stop();assert.equal(f.client.localStatus(),'unavailable');
 }finally{f.client.stop();}
});
test('fresh successful handshake clears old challenge even after later context wait',async()=>{
 const f=setup();try{await f.client.start();assert.equal(f.client.localStatus(),'verification-required');
  f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:{ok:true,grants:[]});
  assert.deepEqual(await f.client.contextReady(),{id:'mount'});assert.notEqual(f.client.localStatus(),'verification-required');
  f.client.contextPending();assert.equal(f.client.localStatus(),'waiting');
 }finally{f.client.stop();}
});
test('malformed or unrelated scope rejection never becomes a challenge hint',async()=>{
 for(const patch of [{ok:false},{v:2},{type:'OTHER'},{state:'unknown'},{reason:'scope-unavailable'},{extra:'not-allowed'}]){
  const f=setup({...challenge(),...patch});try{await f.client.start();assert.notEqual(f.client.localStatus(),'verification-required');assert.notEqual(await popupState(f),'verification-required');}finally{f.client.stop();}
 }
});

test('late old-route challenge cannot label the replacement document route',async()=>{
 const f=fixture({contextRecovery:true});let resolve,reads=0;
 f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?(++reads===1?new Promise(r=>{resolve=r;}):{state:'verified'}):{ok:true,grants:[]});
 try{const starting=f.client.start();for(let i=0;i<80&&!resolve;i++)await Promise.resolve();assert.equal(typeof resolve,'function');
  f.document.location.href+='c/new';resolve(challenge());await starting;for(let i=0;i<80;i++)await Promise.resolve();
  assert.notEqual(f.client.localStatus(),'verification-required');assert.notEqual(await popupState(f),'verification-required');
 }finally{f.client.stop();}
});

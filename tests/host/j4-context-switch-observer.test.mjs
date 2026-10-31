import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {observeJ4ContextSwitch} from './j4-context-switch-observer.mjs';

const origin='http://127.0.0.1:12345';
function surface(){
 const handlers=[],dialog={id:'native-dialog',open:true};
 const listen=owner=>({addEventListener(type,fn,capture){handlers.push({owner,type,fn,capture});},removeEventListener(type,fn,capture){const i=handlers.findIndex(h=>h.owner===owner&&h.type===type&&h.fn===fn&&h.capture===capture);if(i>=0)handlers.splice(i,1);}});
 const document={...listen('document'),querySelector:selector=>{assert.equal(selector,'#native-dialog');return dialog;}};
 const context=vm.createContext({document,...listen('window')});
 const emit=(type,path,{prevented=false,trusted=true}={})=>{for(const h of [...handlers].filter(h=>h.type===type)){h.fn({composedPath:()=>path,isTrusted:trusted,defaultPrevented:prevented});}};
 return {context,handlers,dialog,emit};
}
class Page extends EventEmitter{
 constructor(){super();this.surface=surface();this.frame={};}
 mainFrame(){return this.frame;}
 async evaluate(fn,arg){return vm.runInContext('('+fn.toString()+')',this.surface.context)(arg);}
 request({url=origin+'/native/context',frame=this.frame,method='POST',failure=null}={}){return {url:()=>url,frame:()=>frame,method:()=>method,failure:()=>failure};}
}
test('exact main-document request and native capture/bubble distinguish rejection from missing navigation',async()=>{
 const page=new Page(),observer=await observeJ4ContextSwitch(page,{origin});
 const button={tagName:'BUTTON',textContent:'Switch to Personal',closest:s=>s==='#native-dialog'?page.surface.dialog:null};
 for(const type of ['pointerdown','pointerup','click'])page.surface.emit(type,[button,page.surface.dialog]);
 const request=page.request();page.emit('request',request);page.emit('response',{request:()=>request,status:()=>403});
 const r=await observer.finish({requests:{'/native/context':1},actions:{}});
 assert.equal(r.setup,'INSTALLED');assert.equal(r.document.state,'ORIGINAL_DOCUMENT_CAPTURE');
 assert.deepEqual(Array.from(r.document.events,e=>e.phase),['capture','bubble','capture','bubble','capture','bubble']);
 assert(r.document.events.every(e=>e.target==='personal'&&e.trusted&&e.dialogOpen&&!e.defaultPrevented));
 assert.deepEqual(r.network.events,[{type:'request',request:1,method:'POST'},{type:'response',request:1,status:403}]);
 assert.deepEqual(r.server,{requests:1,successfulSwitches:0});assert.equal(r.originalActionRepeated,false);
 assert.equal(page.surface.handlers.length,0);assert.equal(page.listenerCount('request'),0);
 assert.equal(await observer.finish({actions:{'context-switch':9}}),r,'first boundary snapshot stays fixed');
});
test('unrelated frame/url/body data never enters records; fixed failure class and caps remain explicit',async()=>{
 const page=new Page(),observer=await observeJ4ContextSwitch(page,{origin});
 for(const request of [page.request({url:origin+'/native/context?private'}),page.request({frame:{}}),page.request({url:'https://private.example/native/context'})]){page.emit('request',request);page.emit('response',{request:()=>request,status:()=>200});}
 const request=page.request({failure:{errorText:'secret browser text'}});page.emit('request',request);page.emit('requestfailed',request);
 for(let i=0;i<40;i++)page.emit('response',{request:()=>request,status:()=>200});
 for(let i=0;i<40;i++)page.surface.emit('click',[{textContent:'private unrelated title'}]);
 const r=await observer.finish();assert.equal(r.network.events.length,32);assert.equal(r.network.dropped,10);assert.equal(r.document.events.length,64);assert.equal(r.document.dropped,16);
 assert.equal(r.network.events[1].reason,'OTHER');assert(r.document.events.every(e=>e.target==='other'));
 assert(!JSON.stringify(r).includes('private'));assert(!JSON.stringify(r).includes('secret'));assert(!JSON.stringify(r).includes('12345'));
});
test('a replaced document cannot supply a fabricated old click trace or be reinstalled',async()=>{
 const page=new Page(),observer=await observeJ4ContextSwitch(page,{origin}),old=page.surface;
 old.emit('click',[{id:'account-button'}]);page.surface=surface();
 const r=await observer.finish({requests:{'/native/context':1},actions:{'context-switch':1}});
 assert.equal(r.document.state,'DOCUMENT_REPLACED_OR_PROBE_MISSING');assert.equal(page.surface.handlers.length,0);assert.equal(page.listenerCount('response'),0);
 assert.deepEqual(r.server,{requests:1,successfulSwitches:1});
});
test('missing capture is explicit and cannot replace original action outcome',async()=>{
 const page=new Page();page.evaluate=async()=>{throw Error('closed private document');};
 const observer=await observeJ4ContextSwitch(page,{origin}),r=await observer.finish();
 assert.equal(r.setup,'UNAVAILABLE');assert.equal(r.document.state,'CAPTURE_UNAVAILABLE');assert.equal(page.listenerCount('requestfailed'),0);assert(!JSON.stringify(r).includes('private'));
});
test('native event record keeps default cancellation separate from trusted input',async()=>{
 const page=new Page(),observer=await observeJ4ContextSwitch(page,{origin});page.surface.emit('click',[{id:'account-button'}],{prevented:true,trusted:false});page.surface.emit('beforeunload',[]);
 const r=await observer.finish();assert.equal(r.document.events[0].target,'account');assert.equal(r.document.events[0].defaultPrevented,true);assert.equal(r.document.events[0].trusted,false);assert.equal(r.document.events[2].target,'document');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnippetSelectionSession} from '../../src/host/snippet-selection-session.mjs';
const ref={id:'C',nativeUrl:'https://chatgpt.com/c/C'},selected={refId:'C',messageId:'M',branchId:'B',text:'用户选择',bodyHash:'a'.repeat(64)};
function fixture(){let time=1000,elapsed=1000,bound='document:producer:route:scopeGrant',value={...selected},serial=0,epoch='root-message-node-epoch',reads=0,hook=()=>{};const session=createSnippetSelectionSession({adapter:{selectedSnippet(){reads++;hook();return value;}},currentBinding:()=>bound,currentSelectionEpoch:()=>epoch,now:()=>time,elapsedNow:()=>elapsed,makeId:()=>`selection_${++serial}`});return {session,setTime:n=>time=n,setElapsed:n=>elapsed=n,setBinding:b=>bound=b,setEpoch:e=>epoch=e,setValue:v=>value=v,setHook:f=>hook=f,reads:()=>reads};}
test('capture exposes only opaque token, read rechecks selection and consume is single-use',()=>{const h=fixture(),id=h.session.capture(ref);assert.equal(id,'selection_1');assert.equal(h.reads(),1);const value=h.session.read(id,ref);assert.deepEqual(value,selected);assert.equal(h.reads(),2);assert.ok(Object.isFrozen(value));assert.equal(h.session.consume(id),true);assert.equal(h.session.consume(id),false);assert.equal(h.session.read(id,ref),null);});
test('only one ticket and no current binding by default',()=>{const h=fixture(),old=h.session.capture(ref),fresh=h.session.capture(ref);assert.equal(h.session.read(old,ref),null);assert.ok(h.session.read(fresh,ref));const absent=createSnippetSelectionSession({adapter:{selectedSnippet:()=>selected}});assert.equal(absent.capture(ref),null);});
for(const elapsed of [-1,6000,6001])test('clock rollback or TTL boundary '+elapsed+' clears ticket',()=>{const h=fixture(),id=h.session.capture(ref);h.setTime(1000+elapsed);assert.equal(h.session.read(id,ref),null);h.setTime(1000);assert.equal(h.session.consume(id),false);});
test('5999ms remains valid; stop is permanent',()=>{const h=fixture(),id=h.session.capture(ref);h.setTime(6999);assert.ok(h.session.read(id,ref));h.session.stop();assert.equal(h.session.capture(ref),null);assert.equal(h.session.read(id,ref),null);assert.equal(h.session.consume(id),false);});
for(const field of ['refId','messageId','branchId','text','bodyHash'])test('changed '+field+' cannot read cached selection',()=>{const h=fixture(),id=h.session.capture(ref);h.setValue({...selected,[field]:field==='bodyHash'?'b'.repeat(64):'changed'});assert.equal(h.session.read(id,ref),null);h.setValue({...selected});assert.equal(h.session.read(id,ref),null);});
test('selection disappearing on iframe focus is rejected rather than restoring a cached Range',()=>{const h=fixture(),id=h.session.capture(ref);h.setValue(null);assert.equal(h.session.read(id,ref),null);assert.equal(h.session.consume(id),false);});
test('binding change before or during read invalidates even when original binding returns',()=>{for(const during of [false,true]){const h=fixture(),id=h.session.capture(ref);if(during)h.setHook(()=>h.setBinding('new-scope-grant'));else h.setBinding('new-document');assert.equal(h.session.read(id,ref),null);h.setHook(()=>{});h.setBinding('document:producer:route:scopeGrant');assert.equal(h.session.consume(id),false);}});
test('capture checks authority and time again after adapter callback',()=>{for(const hook of [h=>h.setBinding(null),h=>h.setTime(7000)]){const h=fixture();h.setHook(()=>hook(h));assert.equal(h.session.capture(ref),null);}});
test('wrong ref, same id with changed URL, adapter throw and malformed clocks fail closed',()=>{for(const changed of [{...ref,id:'other'},{...ref,nativeUrl:'https://chatgpt.com/c/other'}]){const h=fixture(),id=h.session.capture(ref);assert.equal(h.session.read(id,changed),null);assert.equal(h.session.consume(id),false);}const h=fixture(),id=h.session.capture(ref);h.setHook(()=>{throw Error('fixture');});assert.equal(h.session.read(id,ref),null);h.setTime(NaN);assert.equal(h.session.capture(ref),null);});
test('legacy shape rejects extra fields, oversized text, invalid IDs/hash and accessors without invoking them',()=>{for(const value of [{...selected,id:'extra'},{...selected,text:' '},{...selected,text:'x'.repeat(2001)},{...selected,bodyHash:'A'.repeat(64)},{...selected,messageId:''},{...selected,branchId:'constructor'},null,[]]){const h=fixture();h.setValue(value);assert.equal(h.session.capture(ref),null);}let called=false;const value={...selected};Object.defineProperty(value,'text',{get(){called=true;return 'secret';}});const h=fixture();h.setValue(value);assert.equal(h.session.capture(ref),null);assert.equal(called,false);});
test('captured anchor copy cannot be changed through adapter object alias',()=>{const h=fixture(),value={...selected};h.setValue(value);const id=h.session.capture(ref);value.text='edited';assert.equal(h.session.read(id,ref),null);});

test('same text and message IDs after node epoch replacement revoke old ticket',()=>{const h=fixture(),id=h.session.capture(ref);h.setEpoch('replacement-node');assert.equal(h.session.read(id,ref),null);h.setEpoch('root-message-node-epoch');assert.equal(h.session.consume(id),false);});
test('missing selection epoch refuses even with valid binding; epoch change during capture refuses',()=>{const session=createSnippetSelectionSession({adapter:{selectedSnippet:()=>selected},currentBinding:()=> 'bound'});assert.equal(session.capture(ref),null);const h=fixture();h.setHook(()=>h.setEpoch('new-node'));assert.equal(h.session.capture(ref),null);});

for(const age of [5999,6000,6001])test('elapsed ticket lifetime stays six seconds with a stalled wall clock: '+age,()=>{
 const h=fixture(),id=h.session.capture(ref);h.setElapsed(1000+age);
 assert.equal(h.session.read(id,ref)!==null,age<6000);
 assert.equal(h.session.consume(id),age<6000);
});
for(const clock of ['wall','elapsed'])test('observed '+clock+' rollback above capture retires the ticket permanently',()=>{
 const h=fixture(),id=h.session.capture(ref),set=clock==='wall'?h.setTime:h.setElapsed;
 set(5000);assert.deepEqual(h.session.read(id,ref),selected);set(4000);
 assert.equal(h.session.read(id,ref),null);set(5000);assert.equal(h.session.consume(id),false);
});
for(const value of [NaN,Infinity,-Infinity])test('invalid elapsed clock refuses capture and retires live ticket: '+value,()=>{
 const h=fixture(),id=h.session.capture(ref);h.setElapsed(value);
 assert.equal(h.session.read(id,ref),null);assert.equal(h.session.capture(ref),null);
 h.setElapsed(1000);assert.equal(h.session.consume(id),false);
});
test('elapsed expiry during adapter capture or read cannot return a selection',()=>{
 for(const phase of ['capture','read']){const h=fixture(),id=phase==='read'?h.session.capture(ref):null;
 h.setHook(()=>h.setElapsed(7000));assert.equal(phase==='capture'?h.session.capture(ref):h.session.read(id,ref),null);
 if(id)assert.equal(h.session.consume(id),false);}
});
test('ticket ID allocation cannot extend the original elapsed capture window',()=>{
 let elapsed=1000;const session=createSnippetSelectionSession({adapter:{selectedSnippet:()=>selected},currentBinding:()=> 'bound',currentSelectionEpoch:()=> 'epoch',now:()=>1000,elapsedNow:()=>elapsed,makeId:()=>{elapsed=7000;return 'selection';}});
 assert.equal(session.capture(ref),null);assert.equal(session.consume('selection'),false);
});
test('valid repeated reads never renew the elapsed deadline and consume rejects at the boundary',()=>{
 const h=fixture(),id=h.session.capture(ref);for(const at of [2000,4000,6999]){h.setElapsed(at);assert.deepEqual(h.session.read(id,ref),selected);}
 h.setElapsed(7000);assert.equal(h.session.consume(id),false);h.setElapsed(1000);assert.equal(h.session.read(id,ref),null);
});
test('elapsed clock dependency must be a function',()=>{
 assert.throws(()=>createSnippetSelectionSession({adapter:{selectedSnippet:()=>selected},elapsedNow:null}),/invalid-snippet-selection-session/);
});
for(const phase of ['read','consume'])test('elapsed expiry during selection epoch validation rejects '+phase,()=>{
 let elapsed=1000,expire=false;
 const session=createSnippetSelectionSession({adapter:{selectedSnippet:()=>selected},currentBinding:()=> 'bound',currentSelectionEpoch:()=>{if(expire)elapsed=7000;return 'epoch';},now:()=>1000,elapsedNow:()=>elapsed,makeId:()=> 'selection'});
 const id=session.capture(ref);assert.equal(id,'selection');expire=true;
 assert.equal(phase==='read'?session.read(id,ref):session.consume(id),phase==='read'?null:false);
 expire=false;elapsed=1000;assert.equal(session.consume(id),false);
});
for(const clock of ['wall','elapsed'])test('capture retains the post-adapter '+clock+' high-water mark',()=>{
 const h=fixture(),set=clock==='wall'?h.setTime:h.setElapsed;h.setHook(()=>set(2000));
 const id=h.session.capture(ref);assert(id);h.setHook(()=>{});set(1500);
 assert.equal(h.session.read(id,ref),null);set(2000);assert.equal(h.session.consume(id),false);
});

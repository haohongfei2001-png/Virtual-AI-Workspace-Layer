import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../tools/native-me-probe/content.mjs',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'');
function receiver(){
 const events=new Map(),location={origin:'https://chatgpt.com',href:'https://chatgpt.com/'},document={visibilityState:'visible',addEventListener:(type,fn)=>events.set(type,fn)};
 let listener,created=0,starts=0,keys=0,options,finish;
 const window={addEventListener:(type,fn,config)=>events.set(type,{fn,once:config?.once})};window.top=window;
 const sender={id:'fixture',url:'chrome-extension://fixture/native-me-probe.html'};
 const createCredentialControlProbe=input=>{created++;options=input;return {peek:()=>null,run:()=>{starts++;return new Promise(resolve=>{finish=resolve;});}};};
 vm.runInNewContext(source,{window,location,document,VAIWL_CREDENTIAL_CONTROL:true,createCredentialControlProbe,AbortController,crypto:{randomUUID:()=>String(++keys)},chrome:{runtime:{id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,onMessage:{addListener:fn=>listener=fn}}}});
 const send=(suffix,extra={})=>{let response;listener({type:'VAIWL_CREDENTIAL_CONTROL_'+suffix,...extra},sender,value=>{response=value;});return response;};
 return {location,document,send,get created(){return created;},get starts(){return starts;},get signal(){return options.signal;},get current(){return options.isCurrent();},finish:()=>finish?.({state:'finished'}),event(type,arg={isTrusted:true}){const item=events.get(type);if(typeof item==='function')item(arg);else if(item){if(item.once)events.delete(type);item.fn(arg);}}};
}
test('preflight route events keep an unspent receiver usable and revoke previously offered keys',()=>{
 const f=receiver(),first=f.send('READY');assert.equal(first.ready,true);
 f.event('popstate');const second=f.send('READY');
 assert.equal(second.ready,true);assert.equal(second.spent,false);assert.notEqual(second.documentKey,first.documentKey);
 f.send('ONCE',{documentKey:first.documentKey});assert.equal(f.starts,0);
 f.send('ONCE',{documentKey:second.documentKey});assert.equal(f.starts,1);assert.equal(f.created,1);assert.equal(f.signal.aborted,false);
 // The next route event must still be watched after a preflight event.
 f.event('popstate');assert.equal(f.signal.aborted,true);assert.equal(f.send('READY').ready,false);f.finish();
});
test('silent URL change before ONCE rejects the old key without starting a request',()=>{
 const f=receiver(),before=f.send('READY');f.location.href='https://chatgpt.com/c/fixture';
 f.send('ONCE',{documentKey:before.documentKey});assert.equal(f.starts,0);
 f.location.href='https://chatgpt.com/';const ready=f.send('READY');assert.equal(ready.ready,true);assert.notEqual(ready.documentKey,before.documentKey);
 f.send('ONCE',{documentKey:ready.documentKey});assert.equal(f.starts,1);assert.equal(f.current,true);f.finish();
});
test('pagehide is terminal even before execution and cannot be revived by later route events',()=>{
 const f=receiver();f.event('pagehide');const before=f.send('READY');f.event('popstate');f.location.href+='?changed';
 const after=f.send('READY');assert.equal(after.ready,false);assert.equal(after.reason,'pagehide');assert.equal(after.documentKey,before.documentKey);assert.equal(f.signal.aborted,true);assert.equal(f.created,1);assert.equal(f.starts,0);
});
for(const event of ['popstate','pagehide','visibilitychange','pointerdown'])test('started attempt never rearms after '+event,()=>{
 const f=receiver(),ready=f.send('READY');f.send('ONCE',{documentKey:ready.documentKey});
 if(event==='visibilitychange')f.document.visibilityState='hidden';f.event(event);
 f.document.visibilityState='visible';f.event('popstate');const after=f.send('READY');
 assert.equal(after.ready,false);assert.equal(after.spent,true);assert.equal(after.documentKey,ready.documentKey);assert.equal(f.signal.aborted,true);assert.equal(f.created,1);f.finish();
});

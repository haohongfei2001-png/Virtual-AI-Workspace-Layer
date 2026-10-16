import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyLoadedWorkerBytes} from './loaded-worker-bytes.mjs';
const extensionId='a'.repeat(32),prefix=`chrome-extension://${extensionId}/`,debugEndpoint='ws://127.0.0.1:43210/devtools/browser/isolated';
async function fixture(t,{module=false,mode='ok'}={}){
 const packagePath=await mkdtemp(join(tmpdir(),'loaded-worker-bytes-'));t.after(()=>rm(packagePath,{recursive:true,force:true}));
 const sources=new Map((module?['extension/worker.mjs','src/data/schema.mjs','src/b1/scope-repository.mjs']:['extension/worker.mjs','extension/classic-runtime.js']).map((path,index)=>[prefix+path,`// PRIVATE_SOURCE_${index}\nvoid ${index};\n`]));
 await writeFile(join(packagePath,'manifest.json'),JSON.stringify({background:{service_worker:'extension/worker.mjs',...(module?{type:'module'}:{})}}));
 for(const [url,source]of sources){const path=join(packagePath,url.slice(prefix.length));await mkdir(dirname(path),{recursive:true});await writeFile(path,source);}
 let socket,targets=0;const calls=[],scheduled=[];t.after(()=>scheduled.forEach(clearTimeout));
 class Socket extends EventTarget{
  constructor(){super();socket=this;this.closed=false;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
  receive(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
  send(text){const m=JSON.parse(text);calls.push(m);queueMicrotask(()=>{
   const reply=result=>this.receive({id:m.id,...m.sessionId?{sessionId:m.sessionId}:{},result});
   if(m.method==='Target.getTargets'){targets++;const target={type:'service_worker',targetId:mode==='replace'&&targets>1?'new':'worker',url:prefix+'extension/worker.mjs'};reply({targetInfos:mode==='absent'||mode==='appear'&&targets===1||mode==='disappear'&&targets>1?[]:mode==='wrong-target'?[{...target,url:prefix+'other.mjs'}]:mode==='duplicate-target'?[target,{...target,targetId:'other'}]:[target]});}
   else if(m.method==='Target.attachToTarget'){if(mode==='attach-error')this.receive({id:m.id,error:{message:'PRIVATE_ATTACH'}});else reply({sessionId:'session'});}
   else if(m.method==='Debugger.enable'){
    if(mode==='silent')return;
    if(['delayed-scripts','delayed-duplicate','delayed-detach'].includes(mode)){
     reply({});scheduled.push(setTimeout(()=>{
      if(mode==='delayed-detach'){this.receive({method:'Target.detachedFromTarget',params:{sessionId:'session',targetId:'worker'}});return;}
      let index=0;for(const url of sources.keys()){const params={scriptId:String(index++),url};this.receive({sessionId:'session',method:'Debugger.scriptParsed',params});if(mode==='delayed-duplicate'){this.receive({sessionId:'session',method:'Debugger.scriptParsed',params:{...params,scriptId:'duplicate'}});break;}}
     },30));return;
    }
    let index=0;for(const url of sources.keys()){
     if(mode==='missing'&&index===1){index++;continue;}
     const params={scriptId:String(index++),url};this.receive({sessionId:mode==='foreign-session'?'other':'session',method:'Debugger.scriptParsed',params});
     if(mode==='duplicate-script'&&index===1)this.receive({sessionId:'session',method:'Debugger.scriptParsed',params:{...params,scriptId:'duplicate'}});
    }
    reply({});
   }else if(m.method==='Debugger.getScriptSource'){
    if(mode==='detached'){this.receive({method:'Target.detachedFromTarget',params:{sessionId:'session',targetId:'worker'}});return;}
    if(mode==='destroyed'){this.receive({method:'Target.targetDestroyed',params:{targetId:'worker'}});return;}
    if(mode==='command-error'){this.receive({id:m.id,sessionId:'session',error:{message:'PRIVATE_REMOTE_SECRET'}});return;}
    if(mode==='late-script')this.receive({sessionId:'session',method:'Debugger.scriptParsed',params:{scriptId:'late',url:prefix+'extension/worker.mjs'}});
    reply(mode==='missing-source'?{}:{scriptSource:(mode==='hash'||mode==='hash-last'&&Number(m.params.scriptId)===sources.size-1)?'PRIVATE_WRONG_SOURCE':Array.from(sources.values())[Number(m.params.scriptId)]});
   }else if(m.method==='Target.detachFromTarget'){if(mode==='silent-detach')return;reply({});}
   else throw Error('unexpected-method');
  });}
  close(){this.closed=true;this.dispatchEvent(new Event('close'));}
 }
 return {run:()=>verifyLoadedWorkerBytes({debugEndpoint,extensionId,packagePath},{Socket,budgetMs:mode==='silent'?20:['wrong-target','absent','missing','foreign-session'].includes(mode)?160:1000}),calls,get socket(){return socket;},sources};
}
for(const module of [false,true])test('verifies exact loaded '+(module?'ESM':'classic')+' bytes and detaches without source in report',async t=>{
 const f=await fixture(t,{module}),result=await f.run();assert.equal(result.targetUrl,prefix+'extension/worker.mjs');assert.equal(result.scripts.length,module?3:2);for(const row of result.scripts){assert.deepEqual(Object.keys(row),['url','expectedSha256','loadedSha256']);assert.equal(row.expectedSha256,row.loadedSha256);assert.match(row.loadedSha256,/^[a-f0-9]{64}$/);}assert(!JSON.stringify(result).includes('PRIVATE'));assert.equal(f.calls.filter(c=>c.method==='Target.detachFromTarget').length,1);assert(f.socket.closed);assert(f.calls.find(c=>c.method==='Target.attachToTarget').params.flatten);assert(!f.calls.some(c=>/evaluate|fetch|resume|startWorker/i.test(c.method)));
});
for(const [mode,error]of [['attach-error','verification-failed'],['wrong-target','target-absent-deadline'],['duplicate-target','multiple-targets'],['missing','script-absent-deadline'],['foreign-session','script-absent-deadline'],['duplicate-script','unique-script'],['hash','hash-mismatch'],['missing-source','missing-source'],['replace','target-changed'],['late-script','target-changed'],['detached','target-unavailable'],['destroyed','target-unavailable'],['command-error','command-failed'],['silent','deadline|command-failed|target-unavailable']])test(mode+' fails closed and cleans independent connection',async t=>{
 const f=await fixture(t,{mode});await assert.rejects(f.run(),e=>{assert.match(e.message,new RegExp(error));assert(!e.message.includes('PRIVATE'));return true;});assert(f.socket.closed);assert.equal(f.calls.filter(c=>c.method==='Target.detachFromTarget').length,['attach-error','wrong-target','duplicate-target'].includes(mode)?0:1);
});
test('silent detach has bounded cleanup and closes the connection',async t=>{const f=await fixture(t,{mode:'silent-detach'}),start=Date.now();await f.run();assert(Date.now()-start<1000);assert(f.socket.closed);});
test('invalid input fails before opening any connection',async()=>{await assert.rejects(verifyLoadedWorkerBytes({debugEndpoint,extensionId:'wrong',packagePath:'/tmp'}),/invalid-input/);});

for(const module of [false,true])test('last required '+(module?'scope repository':'classic runtime')+' byte mismatch is rejected',async t=>{const f=await fixture(t,{module,mode:'hash-last'});await assert.rejects(f.run(),/hash-mismatch/);assert.equal(f.calls.filter(c=>c.method==='Debugger.getScriptSource').length,module?3:2);assert(f.socket.closed);});

test('initial absent worker appears on read-only retry within original deadline',async t=>{
 const f=await fixture(t,{mode:'appear'});await f.run();assert.equal(f.calls.filter(c=>c.method==='Target.getTargets').length,3);assert.equal(f.calls.filter(c=>c.method==='Target.attachToTarget').length,1);assert(f.socket.closed);assert(!f.calls.some(c=>/evaluate|fetch|startWorker/i.test(c.method)));
});
test('persistently absent worker reaches original deadline without attachment',async t=>{
 const f=await fixture(t,{mode:'absent'}),start=Date.now();await assert.rejects(f.run(),/target-absent-deadline/);assert(Date.now()-start<700);const reads=f.calls.filter(c=>c.method==='Target.getTargets').length;assert(reads>=2&&reads<=4);assert(!f.calls.some(c=>c.method==='Target.attachToTarget'));assert(f.socket.closed);
});
test('multiple targets fail on first discovery without retry',async t=>{
 const f=await fixture(t,{mode:'duplicate-target'});await assert.rejects(f.run(),/multiple-targets/);assert.equal(f.calls.filter(c=>c.method==='Target.getTargets').length,1);assert(f.socket.closed);
});
for(const mode of ['disappear','replace'])test('final '+mode+' fails immediately and never waits for a replacement',async t=>{
 const f=await fixture(t,{mode});await assert.rejects(f.run(),mode==='replace'?/target-changed/:/target-absent$/);assert.equal(f.calls.filter(c=>c.method==='Target.getTargets').length,2);assert.equal(f.calls.filter(c=>c.method==='Target.attachToTarget').length,1);assert(f.socket.closed);
});

for(const module of [false,true])test('scripts parsed after Debugger.enable still verify within same deadline module='+module,async t=>{
 const f=await fixture(t,{module,mode:'delayed-scripts'}),result=await f.run();assert.equal(result.scripts.length,module?3:2);assert(f.socket.closed);assert.equal(f.calls.filter(c=>c.method==='Debugger.enable').length,1);
});
test('missing script reports bounded fixed path counts at original deadline',async t=>{
 const f=await fixture(t,{mode:'missing'});await assert.rejects(f.run(),e=>{assert.match(e.message,/script-absent-deadline/);assert.deepEqual(e.scriptCounts,{'extension/worker.mjs':1,'extension/classic-runtime.js':0});assert(!JSON.stringify(e).includes('PRIVATE'));return true;});assert(!f.calls.some(c=>c.method==='Debugger.getScriptSource'));assert(f.socket.closed);
});
for(const mode of ['delayed-duplicate','delayed-detach'])test(mode+' rejects while waiting without reading source',async t=>{
 const f=await fixture(t,{mode});await assert.rejects(f.run(),mode==='delayed-duplicate'?/unique-script-required/:/target-unavailable/);assert(!f.calls.some(c=>c.method==='Debugger.getScriptSource'));assert(f.socket.closed);assert.equal(f.calls.filter(c=>c.method==='Target.detachFromTarget').length,1);
});

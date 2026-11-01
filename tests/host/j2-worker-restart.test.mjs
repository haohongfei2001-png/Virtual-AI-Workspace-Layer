import test from 'node:test';import assert from 'node:assert/strict';
import {restartJ2Worker,assertJ2ReloadPrecondition} from './j2-worker-restart.mjs';
function setup({stopped=true,restarted=true,precondition={editorCount:1,draft:'',selectedFiles:0},stale=false,foreign=false}={}){
 const scriptURL='chrome-extension://target/extension/worker.mjs',calls=[],records=[];let listener;
 const emit=(runningStatus,versionId='7',url=scriptURL)=>listener({versions:[{versionId,scriptURL:url,runningStatus}]});
 const cdp={on:(_,fn)=>{listener=fn;},off:()=>calls.push('off'),send:async method=>{calls.push(method);if(method==='ServiceWorker.enable'){emit('running');if(stale)emit('stopped');}else{emit('running');if(stopped)emit('stopped');}}};
 const args={cdp,scriptURL,within:async(_,fn)=>fn(),poll:async fn=>{const value=await fn();if(!value)throw Error('bounded-observation-missing');return value;},readPrecondition:async()=>{calls.push('precondition');return precondition;},reload:async()=>{calls.push('reload');if(restarted)emit('running',foreign?'other':'7');},record:r=>records.push(r)};
 return {args,calls,records};
}
test('actual stop precedes safe native reload and subsequent matching running evidence',async()=>{const f=setup(),r=await restartJ2Worker(f.args);assert(r.restartedIndex>r.stoppedIndex);assert.equal(r.spontaneousRecovery,'NOT_ESTABLISHED');assert.deepEqual(f.calls,['ServiceWorker.enable','ServiceWorker.stopWorker','precondition','reload','off']);assert.equal(f.records[0].status,'PASS');});
for(const config of [{stopped:false},{restarted:false},{foreign:true},{stale:true}])test('missing or stale lifecycle evidence is never admitted '+JSON.stringify(config),async()=>{const f=setup(config);await assert.rejects(restartJ2Worker(f.args));assert.equal(f.records[0].status,'FAIL');if(config.stopped===false||config.stale)assert(!f.calls.includes('reload'));});
for(const precondition of [{editorCount:0,draft:'',selectedFiles:0},{editorCount:2,draft:'',selectedFiles:0},{editorCount:1,draft:'unsent',selectedFiles:0},{editorCount:1,draft:'',selectedFiles:1}])test('unsafe native reload precondition preserves user state '+JSON.stringify(precondition),async()=>{assert.throws(()=>assertJ2ReloadPrecondition(precondition));const f=setup({precondition});await assert.rejects(restartJ2Worker(f.args));assert(!f.calls.includes('reload'));});

import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {instrumentReadErrorSource,READ_ERROR_ANCHOR} from './read-error-injection.mjs';
test('injection uses exactly three rejected refresh boundaries per actual owner, then real refresh',async()=>{
 const logs=[],sandbox={console:{log:value=>logs.push(value)}};vm.createContext(sandbox);vm.runInContext(instrumentReadErrorSource('let refreshes=0;globalThis.active=()=>refreshes;globalThis.run=async(entry,...args)=>{refreshes++;try{return await entry.owner.refresh(...args);}finally{refreshes--;}};'),sandbox);
 let refreshes=0;const first={refresh:async()=>{refreshes++;return 'real';}},second={refresh:async()=>{refreshes++;return 'second';}};
 for(let n=0;n<3;n++){const pending=sandbox.run({owner:first});assert.equal(sandbox.active(),1);await assert.rejects(pending,/snapshot-revision-changed/);assert.equal(sandbox.active(),0);}assert.equal(refreshes,0);assert.equal(await sandbox.run({owner:first}),'real');assert.equal(refreshes,1);assert.equal(sandbox.active(),0);await assert.rejects(sandbox.run({owner:second}),/snapshot-revision-changed/);assert.deepEqual(logs.map(value=>JSON.parse(value.slice('READ_ERROR_ATTEMPT '.length)).attempt),[1,2,3,4,1]);
});
test('missing duplicate and already instrumented anchors fail closed',()=>{for(const value of ['',READ_ERROR_ANCHOR+READ_ERROR_ANCHOR,'__readErrorRefresh '+READ_ERROR_ANCHOR])assert.throws(()=>instrumentReadErrorSource(value),/read-error-injection-anchor-mismatch/);});
test('current production boundary is uniquely instrumentable without altering retries, grants or repair',async()=>{const source=await readFile(new URL('../../src/runtime/host-view-service.mjs',import.meta.url),'utf8'),modified=instrumentReadErrorSource(source);assert(source.includes('retries<2'));assert(modified.includes('retries<2'));assert(modified.endsWith(source.slice(source.indexOf(READ_ERROR_ANCHOR)+READ_ERROR_ANCHOR.length)));for(const banned of ['setInterval(','setTimeout(','grantId:','indexedDB.'])assert(!modified.slice(0,modified.indexOf('import ')).includes(banned));});

test('argument-bearing auto refresh remains real and does not consume preparation injections',async()=>{
 const sandbox={console:{log(){}}};vm.createContext(sandbox);vm.runInContext(instrumentReadErrorSource('globalThis.run=async(entry,...args)=>{return await entry.owner.refresh(...args);};'),sandbox);
 const calls=[],owner={refresh:async(...args)=>{calls.push(args);return args[0];}},option={now:'2026-10-17'};
 assert.equal(await sandbox.run({owner},option),option);assert.deepEqual(calls,[[option]]);
 for(let n=0;n<3;n++)await assert.rejects(sandbox.run({owner}),/snapshot-revision-changed/);
 assert.equal(calls.length,1);await sandbox.run({owner});assert.equal(calls.length,2);
});

test('actual production refreshOwner retains idle count around injected rejection',async()=>{
 const source=await readFile(new URL('../../src/runtime/host-view-service.mjs',import.meta.url),'utf8'),modified=instrumentReadErrorSource(source);
 const helper=modified.match(/ async function refreshOwner\(entry,\.\.\.args\)\{[^\n]+\}/g);assert.equal(helper?.length,1);
 const sandbox={console:{log(){}}};vm.createContext(sandbox);vm.runInContext(modified.slice(0,modified.indexOf('import '))+'let refreshes=0;'+helper[0]+';globalThis.run=refreshOwner;globalThis.active=()=>refreshes;',sandbox);
 const owner={refresh:async()=> 'real'},pending=sandbox.run({owner});assert.equal(sandbox.active(),1);await assert.rejects(pending,/snapshot-revision-changed/);assert.equal(sandbox.active(),0);
});

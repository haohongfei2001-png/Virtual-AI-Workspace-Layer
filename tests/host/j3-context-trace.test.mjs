import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {J3_CONTEXT_PATHS,instrumentJ3ContextSource} from './j3-context-trace.mjs';
for(const path of J3_CONTEXT_PATHS)test('J3 passive timing trace retains actual source '+path,async()=>{const original=await readFile(path,'utf8'),modified=instrumentJ3ContextSource(path,original);assert(modified.includes('__j3ContextTrace'));assert.throws(()=>instrumentJ3ContextSource(path,modified),/already-instrumented/);assert.throws(()=>instrumentJ3ContextSource(path,''),/anchor-mismatch/);for(const forbidden of ['setTimeout(','fetch(','Authorization','Cookie'])assert(!modified.slice(0,modified.indexOf('import ')).includes(forbidden));});
for(const path of J3_CONTEXT_PATHS)test('RAM-only J3 diagnostics do not wrap RPC promises or log to console: '+path,async()=>{
 const original=await readFile(path,'utf8'),modified=instrumentJ3ContextSource(path,original,{ramOnly:true});
 assert(!modified.includes("console.log('J3_CONTEXT_TRACE '"));
 if(path.endsWith('content-session.mjs')){assert(modified.includes('return send(message,owner);'));assert(!modified.includes('send(message,owner).then'));assert(modified.includes('content-hello'));assert(modified.includes('content-auth'));}
});

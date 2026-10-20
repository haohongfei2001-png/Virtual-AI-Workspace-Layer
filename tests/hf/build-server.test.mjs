import test from 'node:test';
import assert from 'node:assert/strict';
import { build,bundle } from '../../simulator/build.mjs';
import { createServer } from '../../simulator/server.mjs';
import { mkdtempSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
test('MV3 build deterministic, scoped and CSP-safe',()=>{
 const root=mkdtempSync(join(tmpdir(),'vaiwl-hf-build-')),a=build(join(root,'a')),b=build(join(root,'b'));assert.deepEqual(a,b);
 const manifest=JSON.parse(readFileSync(join(root,'a/manifest.json'),'utf8'));assert.deepEqual(manifest.permissions,['webNavigation']);assert.deepEqual(manifest.content_scripts[0].matches,['http://127.0.0.1/hf/*']);assert(!JSON.stringify(manifest).includes('chatgpt.com'));new vm.Script(readFileSync(join(root,'a/content.js'),'utf8'));assert.throws(()=>build(join(root,'a')),/new/);
});
test('opaque browser bundle compiles the same actual navigation and broker modules',()=>{const code=bundle('tests/hf/opaque-entry.mjs');new vm.Script(code);assert(code.includes('src/navigation/navigation.mjs'));assert(code.includes('src/b1/document-binding-broker.mjs'));assert(code.includes('read-only-test-double-not-storage'));});
test('actual Node HTTP host serves app and rejects unsafe/unrelated paths',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const path of ['/control.html','/hf/A/c/T0?mode=page','/simulator/main.mjs','/src/b1/scope-repository.mjs','/src/host/frame-row-windows.mjs','/src/host/frame-resume-state.mjs','/src/host/current-navigation-plan.mjs','/src/host/contract.mjs']){const r=await fetch(origin+path);assert.equal(r.status,200);assert((await r.text()).length>30);assert(r.headers.get('content-security-policy').includes("connect-src 'none'"));}
 for(const path of ['/src/host/content-session.mjs','/src/runtime/host-send-candidates.mjs','/etc/passwd','/../AGENTS.md','/src/b1/../../../etc/passwd'])assert.equal((await fetch(origin+path)).status,404);assert.equal((await fetch(origin+'/control.html',{method:'POST'})).status,405);
 }finally{await new Promise(r=>server.close(r));}
});

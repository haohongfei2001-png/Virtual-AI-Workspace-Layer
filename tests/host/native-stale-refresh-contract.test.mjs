import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {withNativeConcurrentRefresh} from './fixtures/native-current-refresh.mjs';
const C='33333333-3333-4333-8333-333333333333',headers={'Chatgpt-Account-Id':'account-host-team'};
test('native concurrent controls use the existing request/body function without extension hooks',async()=>{
 const source=withNativeConcurrentRefresh(await readFile(new URL('./fixtures/variants-native.mjs',import.meta.url),'utf8'));
 assert.equal((source.match(/await loadCurrentMessages\(true\)/g)??[]).length,2);assert.match(source,/secondRefresh\.disabled=true/);assert.match(source,/refreshButton\.disabled=true/);assert.doesNotMatch(source,/chrome\.|__vaiwl|setTimeout|setInterval/);
});
test('server holds old request while newer 200 completes, then releases old as 503',async t=>{
 const server=await createVariantHostFixtureServer({profile:'MODERN',nativeCurrentRefresh:true,nativeStaleRefresh:true});t.after(()=>server.close());
 const landing=await fetch(server.origin+'/');const headers={'Chatgpt-Account-Id':'account-host-team',Cookie:landing.headers.get('set-cookie').split(';')[0]};
 const url=server.origin+'/backend-api/conversation/'+C;
 assert.equal((await fetch(url,{headers})).status,200);let settled=false;const old=fetch(url,{headers}).then(r=>{settled=true;return r;});
 for(let n=0;n<100&&!server.snapshot().staleRefreshEvents.some(e=>e.ordinal===2);n++)await new Promise(r=>setImmediate(r));
 assert(server.snapshot().staleRefreshEvents.some(e=>e.ordinal===2));assert.equal(settled,false);assert.equal((await fetch(url,{headers})).status,200);assert.equal(settled,false);
 assert.equal(server.releaseNativeStaleRefresh(),true);assert.equal((await old).status,503);assert.equal(server.releaseNativeStaleRefresh(),false);
 assert.deepEqual(server.snapshot().staleRefreshEvents,[{ordinal:1,stage:'request'},{ordinal:1,stage:'response',status:200},{ordinal:2,stage:'request'},{ordinal:3,stage:'request'},{ordinal:3,stage:'response',status:200},{ordinal:2,stage:'response',status:503}]);
});
test('stale mode requires the explicit native refresh fixture',async()=>{await assert.rejects(createVariantHostFixtureServer({profile:'MODERN',nativeStaleRefresh:true}),/invalid-native-stale-refresh/);});
test('runner keeps packaged source guard mutation and post-terminal oracle separate from acceptance',async()=>{
 const s=await readFile(new URL('./context-stale-request-package-browser.mjs',import.meta.url),'utf8');
 assert.match(s,/RESTORE_OLD_TERMINAL_GUARD/);assert.match(s,/compileClassicWorker\(built.unpacked\)/);assert.match(s,/new-projection-revoked-by-stale-terminal/);assert.match(s,/realChatGPT:'NOT_RUN'/);assert.match(s,/releaseStatus:'NOT_RELEASE_READY'/);assert.doesNotMatch(s,/__vaiwlIdleProbeSession|FREE_CHROME_HEADED/);
});

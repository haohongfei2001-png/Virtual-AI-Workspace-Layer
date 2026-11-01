import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {runtimeBuildMatches} from '../../extension/runtime-build.mjs';
import {compileBrowserLocalContent} from '../../extension/classic-worker-build.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){const root=mkdtempSync(join(tmpdir(),'vaiwl-build-binding-')),out=join(root,'package');t.after(()=>rmSync(root,{recursive:true,force:true}));buildHost(out,{browserLocal:true});return out;}
function rewrite(out,name,text){writeFileSync(join(out,name),text);const p=join(out,'build-manifest.json'),info=JSON.parse(readFileSync(p));info.files[name]=sha(text);writeFileSync(p,JSON.stringify(info));}
test('version fence verifier refuses old BOOT bytes even after their inventory hash is rewritten',t=>{
 const out=fixture(t),content=readFileSync(join(out,'content.js'),'utf8');
 rewrite(out,'content.js',content.replace(/\bbuild="[a-f0-9]{64}"/,'build="e287d27625cbeadbfdb3bf4410fe16011e0ae73c68bdf436b1071a38b50279cf"'));
 assert.throws(()=>verifyHost(out),/build|fingerprint|content/);
});
test('version fence actual BOOT sender and registered manifest carry one build',t=>{
 const out=fixture(t),content=readFileSync(join(out,'content.js'),'utf8'),manifest=JSON.parse(readFileSync(join(out,'manifest.json'))),build=/\bbuild="([a-f0-9]{64})"/.exec(content)?.[1];
 assert.match(build,/^[a-f0-9]{64}$/);assert.equal(manifest.version_name,build);
});
test('version fence content bootstrap cannot import a different-generation module graph',t=>{
 const out=fixture(t),content=readFileSync(join(out,'content.js'),'utf8');
 assert.doesNotMatch(content,/import\(runtime\.getURL\('extension\/content-entry\.mjs'\)\)/);
 assert.match(content,/createHostContentSession/);
});
for(const role of ['workspace','sidebar'])test('version fence frame '+role+' rejects a different registered generation before any ready or start',()=>{
 const source=readFileSync(new URL('../../extension/'+role+'.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');let started=0,ready=0;
 const invoke=()=>new Function('createFreeFrameClient','HOST_CONFIG','runtimeBuildMatches','window','chrome','document',source)(()=>({start(){started++;}}),{browserLocal:true,origin:'https://chatgpt.com'},runtimeBuildMatches,{parent:{postMessage(){ready++;}}},{runtime:{getManifest:()=>({version_name:'b'.repeat(64)})}},{querySelector:()=>null});
 assert.throws(invoke,/runtime-build-mismatch/);assert.equal(started,0);assert.equal(ready,0);
});
for(const path of ['extension/worker-source.mjs','extension/content-bootstrap.js'])test('version fence private build source cannot become a public resource: '+path,t=>{
 const out=fixture(t),manifest=JSON.parse(readFileSync(join(out,'manifest.json')));manifest.web_accessible_resources[0].resources.push(path);rewrite(out,'manifest.json',JSON.stringify(manifest));
 assert.throws(()=>verifyHost(out),/invalid-host-package-public-boundary/);
});
test('version fence compiler refuses a bootstrap template with a hardcoded historical BOOT',t=>{
 const out=fixture(t),path=join(out,'extension/content-bootstrap.js');writeFileSync(path,readFileSync(path,'utf8').replace("/* build-content-fingerprint */ 'source'",'"e287d27625cbeadbfdb3bf4410fe16011e0ae73c68bdf436b1071a38b50279cf"'));
 assert.throws(()=>compileBrowserLocalContent(out),/bootstrap-fingerprint/);
});

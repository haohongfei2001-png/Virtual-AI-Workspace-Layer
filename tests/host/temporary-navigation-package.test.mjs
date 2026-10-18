import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildHost} from '../../extension/build.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function root(t){const dir=mkdtempSync(join(tmpdir(),'vaiwl-temporary-package-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
function rewrite(out,name,source){writeFileSync(join(out,name),source);const info=json(join(out,'build-manifest.json'));info.files[name]=sha(source);writeFileSync(join(out,'build-manifest.json'),JSON.stringify(info,null,2)+'\n');}
const modes=[['production',{observedChatGPTContext:true}],['offline',{offlineOrigin:'http://127.0.0.1:43210'}]];
for(const [name,base]of modes)test(name+' temporary readonly package is explicit, verifiable and adds no permissions',async t=>{
 const dir=root(t),normal=join(dir,'normal');buildHost(normal,base);const built=packageHost(join(dir,'temporary'),{...base,temporaryReadOnly:true}),out=built.unpacked;
 const info=json(join(out,'build-manifest.json')),manifest=json(join(out,'manifest.json')),ordinary=json(join(normal,'manifest.json')),html=readFileSync(join(out,'status.html'),'utf8');
 const {HOST_CONFIG}=await import(pathToFileURL(join(out,'extension/config.mjs')).href);
 assert.equal(info.temporaryReadOnly,true);assert.equal(HOST_CONFIG.temporaryReadOnly,true);assert.match(html,/extension\/temporary-navigation\.mjs/);assert.match(html,/临时/);assert.match(html,/只读/);assert.doesNotMatch(html,/<script[^>]*src="extension\/status\.mjs"/);
 assert.deepEqual(manifest.permissions,ordinary.permissions);assert.deepEqual(manifest.host_permissions,ordinary.host_permissions);assert.deepEqual(manifest.content_scripts,ordinary.content_scripts);assert.equal(manifest.action.default_popup,'status.html');
 assert(!manifest.web_accessible_resources[0].resources.includes('status.html'));assert(!manifest.web_accessible_resources[0].resources.includes('extension/temporary-navigation.mjs'));assert.equal(verifyHost(out).releaseStatus,'NOT_RELEASE_READY');assert.equal(built.archiveSha256,sha(readFileSync(built.archive)));
});
test('ordinary default never activates temporary navigation',async t=>{
 const out=join(root(t),'default'),info=buildHost(out),{HOST_CONFIG}=await import(pathToFileURL(join(out,'extension/config.mjs')).href);assert.equal(Object.hasOwn(info,'temporaryReadOnly'),false);assert.equal(Object.hasOwn(HOST_CONFIG,'temporaryReadOnly'),false);const html=readFileSync(join(out,'status.html'),'utf8');assert.match(html,/extension\/status\.mjs/);assert.doesNotMatch(html,/temporary-navigation\.mjs/);verifyHost(out);
});
for(const flag of [false,'unknown',null,1])test('verifier rejects changed temporary metadata flag '+String(flag),t=>{
 const out=join(root(t),'mutated');buildHost(out,{observedChatGPTContext:true,temporaryReadOnly:true});const info=json(join(out,'build-manifest.json'));info.temporaryReadOnly=flag;writeFileSync(join(out,'build-manifest.json'),JSON.stringify(info,null,2)+'\n');assert.throws(()=>verifyHost(out));
});
for(const flag of [false,'unknown'])test('verifier rejects rehashed config temporary flag '+String(flag),t=>{
 const out=join(root(t),'mutated');buildHost(out,{observedChatGPTContext:true,temporaryReadOnly:true});const source=readFileSync(join(out,'extension/config.mjs'),'utf8');assert(source.includes('"temporaryReadOnly":true'));rewrite(out,'extension/config.mjs',source.replace('"temporaryReadOnly":true','"temporaryReadOnly":'+JSON.stringify(flag)));assert.throws(()=>verifyHost(out));
});
for(const flag of ['true',null,1,{}])test('builder rejects nonboolean temporary opt-in '+JSON.stringify(flag),t=>{assert.throws(()=>buildHost(join(root(t),'bad'),{observedChatGPTContext:true,temporaryReadOnly:flag}));});

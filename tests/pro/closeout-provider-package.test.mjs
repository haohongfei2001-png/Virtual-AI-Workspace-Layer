/** R1 provider capability is optional, Pro-only and bounded independently of
 * package file hashes. No browser permission is requested and no API is called. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildHost} from '../../extension/build.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {assertHostManifestBoundary} from '../../extension/package-manifest-boundary.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJSON=path=>JSON.parse(readFileSync(path,'utf8'));
const loopback='http://127.0.0.1:43210';
const provider='https://api.openai.com';
const csp=connections=>`script-src 'self'; object-src 'none'; connect-src ${connections}`;
function workspace(t){const path=mkdtempSync(join(tmpdir(),'vaiwl-pro-provider-package-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;}
function fixture(t,options){
 const out=join(workspace(t),'extension');buildHost(out,options);
 const manifest=readJSON(join(out,'manifest.json')),info=readJSON(join(out,'build-manifest.json'));
 function rewrite(next,{proR1=info.proR1}={}){
  const text=JSON.stringify(next,null,2)+'\n',updated={...info,files:{...info.files,'manifest.json':hash(text)}};
  if(proR1===undefined)delete updated.proR1;else updated.proR1=proR1;
  writeFileSync(join(out,'manifest.json'),text);writeFileSync(join(out,'build-manifest.json'),JSON.stringify(updated,null,2)+'\n');
  assert.equal(readJSON(join(out,'build-manifest.json')).files['manifest.json'],hash(readFileSync(join(out,'manifest.json'))));
 }
 return {out,manifest,info,rewrite};
}

// Literal pre-closeout privilege/CSP values. The Free graph stays independent;
// introducing any optional permission is a failure even if it is the Pro host.
for(const [name,options,expected] of [
 ['default',{},'{"permissions":["webNavigation"],"host_permissions":["https://chatgpt.com/*"],"content_security_policy":{"extension_pages":"script-src \'self\'; object-src \'none\'; connect-src https://chatgpt.com"}}'],
 ['browser-local',{browserLocal:true},'{"permissions":["webNavigation","storage"],"host_permissions":["https://chatgpt.com/*"],"content_security_policy":{"extension_pages":"script-src \'self\'; object-src \'none\'; connect-src \'none\'"}}'],
 ['loopback',{offlineOrigin:loopback},'{"permissions":["webNavigation"],"host_permissions":["http://127.0.0.1/*"],"content_security_policy":{"extension_pages":"script-src \'self\'; object-src \'none\'; connect-src http://127.0.0.1:43210"}}'],
])test('Free '+name+' retains exact permission and CSP bytes without Pro code',t=>{
 const f=fixture(t,options),m=f.manifest;
 assert.equal(JSON.stringify({permissions:m.permissions,host_permissions:m.host_permissions,content_security_policy:m.content_security_policy}),expected);
 assert.equal(Object.hasOwn(m,'optional_permissions'),false);assert.equal(Object.hasOwn(m,'optional_host_permissions'),false);
 assert.equal(Object.keys(f.info.files).some(path=>path.startsWith('src/pro/')),false);
 assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});

test('actual Pro archive declares only the fixed optional provider and no required grant',t=>{
 const built=packageHost(join(workspace(t),'package'),{browserLocal:true,proR1:true}),m=readJSON(join(built.unpacked,'manifest.json'));
 assert.equal(hash(readFileSync(built.archive)),built.archiveSha256);
 assert.deepEqual(m.permissions,['webNavigation','storage']);assert.deepEqual(m.host_permissions,['https://chatgpt.com/*']);
 assert.deepEqual(m.optional_host_permissions,[provider+'/*']);assert.equal(Object.hasOwn(m,'optional_permissions'),false);
 assert.equal(m.content_security_policy.extension_pages,csp(provider));
 assert.deepEqual(m.content_scripts[0].matches,['https://chatgpt.com/*']);assert.deepEqual(m.web_accessible_resources[0].matches,['https://chatgpt.com/*']);
 assert.equal(verifyHost(built.unpacked).releaseStatus,'NOT_RELEASE_READY');
 // The package is prepared for future explicit authorization, not an automatic
 // browser prompt. The shipped worker still composes no modelProvider.
 assert.doesNotMatch(readFileSync(join(built.unpacked,'extension/classic-runtime.js'),'utf8'),/\.permissions\s*\.\s*request\s*\(/u);
});

for(const [name,options,origin] of [['strict',{proR1:true},'https://chatgpt.com'],['loopback',{proR1:true,offlineOrigin:loopback},loopback]])test('Pro '+name+' preserves its existing origin beside the exact provider',t=>{
 const f=fixture(t,options),m=f.manifest;
 assert.deepEqual(m.optional_host_permissions,[provider+'/*']);assert.equal(m.content_security_policy.extension_pages,csp(origin+' '+provider));
 assert.deepEqual(m.host_permissions,[name==='strict'?'https://chatgpt.com/*':'http://127.0.0.1/*']);
 assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});

test('rehashing a Pro manifest cannot expand optional hosts, required hosts or CSP',async t=>{
 const f=fixture(t,{browserLocal:true,proR1:true});
 const changes=[
  ['all URLs',m=>{m.optional_host_permissions=['<all_urls>'];}],
  ['wildcard subdomains',m=>{m.optional_host_permissions=['https://*.openai.com/*'];}],
  ['HTTP provider',m=>{m.optional_host_permissions=['http://api.openai.com/*'];}],
  ['lookalike host',m=>{m.optional_host_permissions=['https://api.openai.com.example.invalid/*'];}],
  ['provider plus another host',m=>{m.optional_host_permissions.push('https://example.invalid/*');}],
  ['duplicate provider entries',m=>{m.optional_host_permissions.push(provider+'/*');}],
  ['different path pattern',m=>{m.optional_host_permissions=[provider+'/v1/*'];}],
  ['wrong optional type',m=>{m.optional_host_permissions=provider+'/*';}],
  ['missing optional declaration',m=>{delete m.optional_host_permissions;}],
  ['required provider grant',m=>{m.host_permissions.push(provider+'/*');}],
  ['required arbitrary API permission',m=>{m.permissions.push('management');}],
  ['optional arbitrary API permission',m=>{m.optional_permissions=['management'];}],
  ['provider content injection',m=>{m.content_scripts[0].matches.push(provider+'/*');}],
  ['provider public-resource access',m=>{m.web_accessible_resources[0].matches.push(provider+'/*');}],
  ['CSP wildcard',m=>{m.content_security_policy.extension_pages=csp('https:');}],
  ['CSP arbitrary origin',m=>{m.content_security_policy.extension_pages=csp(provider+' https://example.invalid');}],
  ['CSP native API in Browser-Local',m=>{m.content_security_policy.extension_pages=csp('https://chatgpt.com '+provider);}],
  ['CSP transport left impossible',m=>{m.content_security_policy.extension_pages=csp("'none'");}],
 ];
 for(const [name,change] of changes)await t.test(name,()=>{
  const m=structuredClone(f.manifest);change(m);f.rewrite(m);
  assert.throws(()=>verifyHost(f.out),/invalid-host-package/);
 });
 f.rewrite(f.manifest);assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});

test('Free cannot acquire the provider by rehashing its manifest or relabeling a build flag',t=>{
 const f=fixture(t,{browserLocal:true}),m=structuredClone(f.manifest);
 m.optional_host_permissions=[provider+'/*'];m.content_security_policy.extension_pages=csp(provider);f.rewrite(m);
 assert.throws(()=>verifyHost(f.out),/invalid-host-package/);
 f.rewrite(m,{proR1:true});assert.throws(()=>verifyHost(f.out),/invalid-host-package-context/);
 f.rewrite(f.manifest);assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});

test('standalone boundary admits the exact optional provider only with explicit Pro mode',t=>{
 const f=fixture(t,{browserLocal:true,proR1:true});
 assert.throws(()=>assertHostManifestBoundary(f.manifest),/invalid-host-package-manifest-boundary/);
 assert.doesNotThrow(()=>assertHostManifestBoundary(f.manifest,{proR1:true}));
 for(const hosts of [[],['<all_urls>'],['https://*.openai.com/*'],[provider+'/*','https://example.invalid/*']]){
  assert.throws(()=>assertHostManifestBoundary({...f.manifest,optional_host_permissions:hosts},{proR1:true}),/invalid-host-package-permissions/);
 }
 assert.throws(()=>assertHostManifestBoundary(f.manifest,{proR1:'true'}),/invalid-host-package-manifest-boundary/);
});

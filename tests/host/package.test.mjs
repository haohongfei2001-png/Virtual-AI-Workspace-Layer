import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost,packageHost} from '../../extension/package.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
function root(t){const dir=mkdtempSync(join(tmpdir(),'vaiwl-host-package-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
test('frame shell bytes participate in the live source drift check and package digest',t=>{
 const out=join(root(t),'shells'),info=buildHost(out);
 for(const role of ['workspace','sidebar']){
  const path='extension/'+role+'.html',bytes=readFileSync(new URL('../../'+path,import.meta.url));
  assert.equal(info.sourceHashes[path],sha(bytes));assert.equal(info.files[role+'.html'],sha(bytes));
  assert.notEqual(info.sourceHashes[path],sha(Buffer.concat([bytes,Buffer.from('<style>main{height:1px}</style>')])));
  assert.match(bytes.toString(),/href="extension\/frame-shell\.css"/);
 }
 const css=readFileSync(new URL('../../extension/frame-shell.css',import.meta.url));
 assert.equal(info.sourceHashes['extension/frame-shell.css'],sha(css));
 assert.deepEqual(readFileSync(join(out,'extension/frame-shell.css')),css);
 assert.equal(info.files['extension/frame-shell.css'],sha(css));
});
test('formal development build defaults to unverified context without simulator or seed modules',async t=>{
 const out=join(root(t),'formal'),info=buildHost(out),manifest=json(join(out,'manifest.json'));
 assert.equal(info.status,'HOST_IMPLEMENTATION_UNVERIFIED');assert.equal(info.releaseStatus,'NOT_RELEASE_READY');assert.equal(info.realChatGPT,'NOT_RUN');assert.equal(info.contextSelection,'UNVERIFIED_FAIL_CLOSED');
 const {HOST_CONFIG}=await import(pathToFileURL(join(out,'extension/config.mjs')).href);assert.equal(HOST_CONFIG.origin,'https://chatgpt.com');assert.equal(HOST_CONFIG.scopeProfile.singlePersonalDefault,false);
 assert.deepEqual(manifest.host_permissions,['https://chatgpt.com/*']);assert.deepEqual(manifest.permissions,['webNavigation']);assert.equal(manifest.content_scripts[0].all_frames,false);
 assert(Object.keys(info.files).every(path=>!path.startsWith('simulator/')&&!path.startsWith('tests/')));assert(!Object.keys(info.files).some(path=>/seed|fixture/i.test(path)));
 assert.equal(verifyHost(out).status,info.status);assert.match(readFileSync(join(out,'README.txt'),'utf8'),/NOT_RELEASE_READY/);
});
test('offline build accepts only exact IPv4 loopback origin and limits manifest to loopback',async t=>{
 const dir=root(t),origin='http://127.0.0.1:43210',out=join(dir,'offline'),info=buildHost(out,{offlineOrigin:origin}),manifest=json(join(out,'manifest.json'));
 assert.equal(info.status,'OFFLINE_HOST_RECONSTRUCTION');assert.equal(info.contextSelection,'EXPLICIT_OFFLINE_C3');
 assert.deepEqual(manifest.host_permissions,['http://127.0.0.1/*']);assert.deepEqual(manifest.content_scripts[0].matches,['http://127.0.0.1/*']);assert.deepEqual(manifest.web_accessible_resources[0].matches,['http://127.0.0.1/*']);assert(manifest.content_security_policy.extension_pages.includes('connect-src '+origin));
 const {HOST_CONFIG}=await import(pathToFileURL(join(out,'extension/config.mjs')).href);assert.equal(HOST_CONFIG.origin,origin);assert.equal(HOST_CONFIG.scopeProfile.singlePersonalDefault,true);
 for(const [i,value]of ['http://localhost:43210','http://[::1]:43210','https://127.0.0.1:43210','http://example.com','https://chatgpt.com','http://127.0.0.1:43210/','http://127.0.0.1:43210/path','http://user@127.0.0.1:43210'].entries())assert.throws(()=>buildHost(join(dir,'bad'+i),{offlineOrigin:value}),/offline-origin-must-be-loopback/);
});
test('every shipped static import/re-export resolves inside module closure and WAR excludes worker-only code',t=>{
 const out=join(root(t),'closure'),info=buildHost(out),manifest=json(join(out,'manifest.json'));
 const dependencies=source=>[...source.matchAll(/\b(?:import|export)\s+(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?|[\w$]+)\s+from\s*['"]([^'"]+)['"]/g),...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
 for(const file of Object.keys(info.files).filter(p=>p.endsWith('.mjs')))for(const dependency of dependencies(readFileSync(join(out,file),'utf8'))){assert(dependency.startsWith('.'),file);const target=resolve(out,dirname(file),dependency);assert(target.startsWith(out+'/'));assert(existsSync(target),file+' imports '+dependency);}
 const war=manifest.web_accessible_resources[0].resources;assert(!war.includes('extension/worker.mjs'));assert(!war.includes('src/runtime/session-provider.mjs'));assert(!war.includes('src/runtime/host-binding-service.mjs'));assert(war.includes('extension/content-entry.mjs'));assert(war.includes('workspace.html'));assert(war.includes('sidebar.html'));
});
test('host development ZIP and SHA256SUMS reproduce byte-for-byte',t=>{
 const dir=root(t),a=packageHost(join(dir,'a')),b=packageHost(join(dir,'b'));
 const first=readFileSync(a.archive),second=readFileSync(b.archive);assert.deepEqual(first,second);assert.equal(a.archiveSha256,b.archiveSha256);assert.equal(a.archiveSha256,sha(first));assert.equal(first.readUInt32LE(0),0x04034b50);assert.equal(readFileSync(join(dir,'a','SHA256SUMS'),'utf8'),a.archiveSha256+'  vaiwl-free-host-development.zip\n');
 assert.throws(()=>packageHost(join(dir,'a')),/output-must-be-new/);
});
for(const mutation of ['extra','bytes','symlink'])test(`host verifier rejects ${mutation} package mutation`,t=>{
 const out=join(root(t),'changed');buildHost(out);
 if(mutation==='extra')writeFileSync(join(out,'unexpected.txt'),'unlisted');
 if(mutation==='bytes')writeFileSync(join(out,'extension/config.mjs'),'export const HOST_CONFIG={};');
 if(mutation==='symlink')symlinkSync(join(out,'manifest.json'),join(out,'unexpected-link'));
 assert.throws(()=>verifyHost(out),mutation==='extra'?/unexpected-host-package-files/:mutation==='bytes'?/host-package-hash-mismatch/:/host-package-symlink/);
});

function rewriteHashed(out,name,value){
 const source=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';writeFileSync(join(out,name),source);
 const info=json(join(out,'build-manifest.json'));info.files[name]=sha(source);writeFileSync(join(out,'build-manifest.json'),JSON.stringify(info,null,2)+'\n');
}
test('rehashed config cannot enable unverified production C3 while claiming fail-closed',t=>{
 const out=join(root(t),'config');buildHost(out);
 const source=readFileSync(join(out,'extension/config.mjs'),'utf8');assert(source.includes('"singlePersonalDefault":false'));
 rewriteHashed(out,'extension/config.mjs',source.replace('"singlePersonalDefault":false','"singlePersonalDefault":true'));
 assert.equal(json(join(out,'build-manifest.json')).contextSelection,'UNVERIFIED_FAIL_CLOSED');assert.throws(()=>verifyHost(out));
});
for(const mutation of ['origin','csp','war'])test(`rehashed offline package rejects mixed production ${mutation} boundary`,t=>{
 const out=join(root(t),'mixed');buildHost(out,{offlineOrigin:'http://127.0.0.1:43210'});
 if(mutation==='origin'){
  const info=json(join(out,'build-manifest.json'));info.origin='https://chatgpt.com';writeFileSync(join(out,'build-manifest.json'),JSON.stringify(info));
 }else{
  const manifest=json(join(out,'manifest.json'));
  if(mutation==='csp')manifest.content_security_policy.extension_pages+=" https://chatgpt.com";
  if(mutation==='war')manifest.web_accessible_resources[0].matches.push('https://chatgpt.com/*');
  rewriteHashed(out,'manifest.json',manifest);
 }
 assert.throws(()=>verifyHost(out));
});

test('snippet reconstruction profile is explicit loopback-only and cannot enable production',t=>{
 const dir=root(t);assert.throws(()=>buildHost(join(dir,'production-snippets'),{offlineSnippets:true}),/snippet-profile-offline-only/);
 const out=join(dir,'offline-snippets'),info=buildHost(out,{offlineOrigin:'http://127.0.0.1:43210',offlineSnippets:true});assert.equal(info.offlineSnippets,true);assert.equal(verifyHost(out).status,'OFFLINE_HOST_RECONSTRUCTION');
 assert.match(readFileSync(join(out,'extension/config.mjs'),'utf8'),/"offlineSnippets":true/);
});

test('historical grammar is explicit offline-only package configuration',t=>{
 const out=join(root(t),'history'),info=buildHost(out,{offlineOrigin:'http://127.0.0.1:3210',offlineHistory:true});
 assert.equal(info.offlineHistory,true);assert.equal(verifyHost(out).status,'OFFLINE_HOST_RECONSTRUCTION');
 const config=readFileSync(join(out,'extension/config.mjs'),'utf8');assert.match(config,/"historicalSendProfile"/);assert.match(config,/fixture-original-self-send/);assert.match(config,/"currentMetadataReadEnabled":true/);
 assert.throws(()=>buildHost(join(root(t),'live'),{offlineHistory:true}),/offline-only/);
 const plain=join(root(t),'plain');buildHost(plain);assert(!readFileSync(join(plain,'extension/config.mjs'),'utf8').includes('historicalSendProfile'));
});
test('explicit existing-C ACK composition requires loopback C2 and never enables first-send observer',async t=>{
 const dir=root(t),built=packageHost(join(dir,'existing'),{offlineOrigin:'http://127.0.0.1:1234',offlineContext:true,offlineExistingSend:true,offlineHistory:true});assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');const info=json(join(built.unpacked,'build-manifest.json')),manifest=json(join(built.unpacked,'manifest.json')),config=(await import(pathToFileURL(join(built.unpacked,'extension/config.mjs')))).HOST_CONFIG;
 assert.equal(info.offlineExistingSend,true);assert.equal(info.contextSelection,'EXPLICIT_OFFLINE_C2_CONVERSATION');assert.equal(config.scopeProfile.browserRequestContext,true);assert.equal(config.scopeProfile.singlePersonalDefault,false);assert.equal(config.sessionProfile.currentConversationContextHeader,true);assert.equal(config.currentMetadataReadEnabled,true);assert.equal(config.sendCandidatesEnabled,true);assert.equal(config.offlineFirstSend,undefined);assert.equal(info.offlineFirstSend,undefined);assert.deepEqual(config.sendAckProfile,{id:'loopback-existing-send-ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}});assert(config.historicalSendProfile);assert.deepEqual(manifest.permissions,['webNavigation','webRequest']);assert.equal(manifest.content_security_policy.extension_pages,"script-src 'self'; object-src 'none'; connect-src http://127.0.0.1:1234");
 for(const opts of [{offlineExistingSend:true},{offlineExistingSend:true,offlineOrigin:'http://127.0.0.1:1234'},{offlineExistingSend:true,offlineContext:true,offlineFirstSend:true,offlineOrigin:'http://127.0.0.1:1234'},{offlineExistingSend:'true',offlineContext:true,offlineOrigin:'http://127.0.0.1:1234'}])assert.throws(()=>buildHost(join(dir,'invalid'),opts),/existing-send-profile-offline-c2-only/);
 const ordinary=join(dir,'ordinary');buildHost(ordinary,{offlineOrigin:'http://127.0.0.1:1234',offlineContext:true});const normal=(await import(pathToFileURL(join(ordinary,'extension/config.mjs')))).HOST_CONFIG;assert.equal(normal.sendAckProfile,undefined);assert.equal(normal.sendCandidatesEnabled,undefined);
});
test('package verifier rejects forged existing-send composition even with rewritten config file hash',t=>{
 const dir=root(t),built=packageHost(join(dir,'build'),{offlineOrigin:'http://127.0.0.1:1234',offlineContext:true,offlineExistingSend:true}),path=join(built.unpacked,'build-manifest.json'),original=json(path);
 for(const patch of [{offlineContext:false},{offlineFirstSend:true},{offlineExistingSend:false}]){writeFileSync(path,JSON.stringify({...original,...patch}));assert.throws(()=>verifyHost(built.unpacked),/invalid-host-(?:.*profile|package-permissions)/);}writeFileSync(path,JSON.stringify(original));assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
 const configPath=join(built.unpacked,'extension/config.mjs'),forged=readFileSync(configPath,'utf8').replace('loopback-existing-send-ack','forged-ack');writeFileSync(configPath,forged);original.files['extension/config.mjs']=sha(forged);writeFileSync(path,JSON.stringify(original));assert.throws(()=>verifyHost(built.unpacked),/invalid-host-package-context/);
});

test('explicit loopback Project C2 package round-trips and rejects changed context configuration',t=>{
 const out=join(root(t),'project'),info=buildHost(out,{offlineOrigin:'http://127.0.0.1:8123',offlineContext:true,offlineProjectContext:true});
 assert.equal(info.contextSelection,'EXPLICIT_OFFLINE_C2_PROJECT_CONVERSATION');assert.equal(info.offlineProjectContext,true);assert.equal(verifyHost(out).status,'OFFLINE_HOST_RECONSTRUCTION');
 const config=join(out,'extension/config.mjs'),changed=readFileSync(config,'utf8').replace('loopback-project-v1','future-project-v2');writeFileSync(config,changed);
 const manifest=json(join(out,'build-manifest.json'));manifest.files['extension/config.mjs']=sha(changed);writeFileSync(join(out,'build-manifest.json'),JSON.stringify(manifest));
 assert.throws(()=>verifyHost(out),/invalid-host-package-context/);
});
for(const options of [{offlineProjectContext:true},{offlineOrigin:'http://127.0.0.1:8123',offlineProjectContext:true},{offlineOrigin:'https://chatgpt.com',offlineContext:true,offlineProjectContext:true}])test('Project profile cannot escape explicit offline C2 '+JSON.stringify(options),t=>{assert.throws(()=>buildHost(join(root(t),'invalid'),options));});

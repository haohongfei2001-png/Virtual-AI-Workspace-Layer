import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const readJson=path=>JSON.parse(readFileSync(path,'utf8'));
function fixture(t,options={}){
 const root=mkdtempSync(join(tmpdir(),'vaiwl-manifest-boundary-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const out=join(root,'extension');buildHost(out,options);
 const manifest=readJson(join(out,'manifest.json'));
 const info=readJson(join(out,'build-manifest.json'));
 function rewrite(m){
  const text=JSON.stringify(m,null,2)+'\n';
  writeFileSync(join(out,'manifest.json'),text);
  writeFileSync(join(out,'build-manifest.json'),JSON.stringify({...info,files:{...info.files,'manifest.json':sha(text)}},null,2)+'\n');
 }
 return {out,manifest,rewrite};
}

const mutations=[
 ['optional management permission',m=>{m.optional_permissions=['management'];}],
 ['optional arbitrary hosts',m=>{m.optional_host_permissions=['<all_urls>'];}],
 ['external message entry',m=>{m.externally_connectable={matches:['https://example.com/*']};}],
 ['toolbar popup entry',m=>{m.action={default_popup:'workspace.html'};}],
 ['options page entry',m=>{m.options_ui={page:'workspace.html',open_in_tab:true};}],
 ['side panel entry',m=>{m.side_panel={default_path:'workspace.html'};}],
 ['browser override entry',m=>{m.chrome_url_overrides={newtab:'workspace.html'};}],
 ['unapproved update channel',m=>{m.update_url='https://example.com/updates.xml';}],
 ['additional content entry',m=>{m.content_scripts[0].js.push('extension/config.mjs');}],
 ['replaced content entry',m=>{m.content_scripts[0].js=['extension/config.mjs'];}],
 ['removed content entry',m=>{m.content_scripts[0].js=[];}],
 ['content CSS injection',m=>{m.content_scripts[0].css=['extension/frame-shell.css'];}],
 ['changed injection timing',m=>{m.content_scripts[0].run_at='document_start';}],
 ['all-frame content injection',m=>{m.content_scripts[0].all_frames=true;}],
 ['MAIN-world content execution',m=>{m.content_scripts[0].world='MAIN';}],
 ['about:blank fallback',m=>{m.content_scripts[0].match_about_blank=true;}],
 ['origin fallback',m=>{m.content_scripts[0].match_origin_as_fallback=true;}],
 ['external extension resource access',m=>{m.web_accessible_resources[0].extension_ids=['*'];}],
 ['status popup public resource',m=>{m.web_accessible_resources[0].resources.push('status.html');}],
 ['encoded status popup public resource',m=>{m.web_accessible_resources[0].resources.push('/%73tatus.html');}],
 ['private status entry',m=>{m.web_accessible_resources[0].resources.push('extension/status.mjs');}],
 ['private status style',m=>{m.web_accessible_resources[0].resources.push('extension/status.css');}],
 ['unexpected action field',m=>{m.action.default_title='Changed';}],
 ['removed status action',m=>{delete m.action;}],
 ['private worker resource',m=>{m.web_accessible_resources[0].resources.push('extension/worker.mjs');}],
 ['private compiled runtime resource',m=>{m.web_accessible_resources[0].resources.push('extension/classic-runtime.js');}],
 ['private runtime module',m=>{m.web_accessible_resources[0].resources.push('src/runtime/host-worker-runtime.mjs');}],
 ['wildcard resource',m=>{m.web_accessible_resources[0].resources.push('extension/*');}],
 ['encoded leading-slash private worker',m=>{m.web_accessible_resources[0].resources.push('%2Fextension/worker.mjs');}],
 ['encoded separator private worker',m=>{m.web_accessible_resources[0].resources.push('extension%2fworker.mjs');}],
 ['encoded dot private worker',m=>{m.web_accessible_resources[0].resources.push('extension/worker%2Emjs');}],
 ['encoded dash compiled runtime',m=>{m.web_accessible_resources[0].resources.push('extension/classic%2Druntime.js');}],
 ['encoded wildcard resource',m=>{m.web_accessible_resources[0].resources.push('extension/%2a');}],
 ['malformed encoded resource',m=>{m.web_accessible_resources[0].resources.push('workspace%ZZ.html');}],
 ['non-string resource',m=>{m.web_accessible_resources[0].resources.push(null);}],
 ['non-array resources',m=>{m.web_accessible_resources[0].resources='workspace.html';}],
 ['leading-slash private worker resource',m=>{m.web_accessible_resources[0].resources.push('/extension/worker.mjs');}],
 ['repeated-leading-slash private worker resource',m=>{m.web_accessible_resources[0].resources.push('//extension/worker.mjs');}],
 ['leading-slash compiled runtime resource',m=>{m.web_accessible_resources[0].resources.push('/extension/classic-runtime.js');}],
 ['leading-slash private runtime module',m=>{m.web_accessible_resources[0].resources.push('/src/runtime/host-worker-runtime.mjs');}],
 ['percent-encoded private worker directory',m=>{m.web_accessible_resources[0].resources.push('%65xtension/worker.mjs');}],
 ['percent-encoded private worker name',m=>{m.web_accessible_resources[0].resources.push('extension/%77orker.mjs');}],
 ['percent-encoded private runtime directory',m=>{m.web_accessible_resources[0].resources.push('src/%72untime/host-worker-runtime.mjs');}],
 ['percent-encoded compiled runtime directory',m=>{m.web_accessible_resources[0].resources.push('%65xtension/classic-runtime.js');}],
 ['leading-slash and percent-encoded private worker',m=>{m.web_accessible_resources[0].resources.push('/%65xtension/worker.mjs');}],
 ['unreviewed CSP surface',m=>{m.content_security_policy.sandbox="sandbox allow-scripts; script-src 'self'";}],
 ...[
  ['private bootstrap entry','extension/browser-bootstrap.mjs'],
  ['encoded bootstrap entry','/%65xtension/browser%2Dbootstrap.mjs'],
  ['private no-receipt policy','src/runtime/context-recovery/no-receipt-recovery.mjs'],
  ['slash-prefixed no-receipt policy','//src/runtime/context-recovery/no-receipt-recovery.mjs'],
  ['encoded no-receipt policy','%2Fsrc/%72untime/context-recovery/no-receipt-recovery.mjs'],
  ['relative private worker','./extension/worker.mjs'],
  ['relative private no-receipt policy','./src/runtime/context-recovery/no-receipt-recovery.mjs'],
  ['dot-segment private worker','extension/../extension/worker.mjs'],
  ['dot-segment no-receipt policy','extension/../src/runtime/context-recovery/no-receipt-recovery.mjs'],
  ['encoded dot-segment no-receipt policy','extension/%2e%2e/src/runtime/context-recovery/no-receipt-recovery.mjs'],
  ['backslash private worker','extension\\worker.mjs'],
  ['encoded backslash private worker','extension%5cworker.mjs'],
  ['repeated separator private worker','extension//worker.mjs'],
  ['double encoded private worker','%2565xtension/worker.mjs'],
  ['private worker query','extension/worker.mjs?public'],
  ['private worker fragment','extension/worker.mjs#public'],
  ['encoded private worker fragment','extension/worker.mjs%23public'],
  ['private worker tab','extension/wo\trker.mjs'],
  ['encoded private worker newline','extension/wo%0Arker.mjs'],
  ['NUL resource','workspace.html%00'],
  ['empty resource',''],
  ['only slash resource','///'],
  ['case-altered private worker','Extension/Worker.mjs'],
  ['case-altered private owner family','SRC/RUNTIME/future-private-owner.mjs'],
  ['case-altered bootstrap','extension/BROWSER-BOOTSTRAP.mjs'],
  ['trailing-dot private worker','extension/worker.mjs.'],
  ['trailing-dot private directory','src/runtime./context-recovery/no-receipt-recovery.mjs'],
  ['private worker stream suffix','extension/worker.mjs:stream'],
 ].map(([name,path])=>[name,m=>{m.web_accessible_resources[0].resources.push(path);}]),
];

for(const resource of ['all','workspace.html','sidebar.html','extension/content-entry.mjs','src/host/free-frame-client.mjs'])test('package rejects missing public dependency coverage: '+resource,t=>{
 const f=fixture(t),m=structuredClone(f.manifest);
 assert(m.web_accessible_resources[0].resources.includes(resource)||resource==='all');
 m.web_accessible_resources[0].resources=resource==='all'?[]:m.web_accessible_resources[0].resources.filter(name=>name!==resource);
 f.rewrite(m);assert.throws(()=>verifyHost(f.out),/missing-host-package-public-resource/);
});
for(const name of ['content.js','workspace.html','sidebar.html','extension/frame-shell.css'])test('package rejects a missing required asset even with a matching file manifest: '+name,t=>{
 const f=fixture(t),path=join(f.out,'build-manifest.json'),info=readJson(path);
 rmSync(join(f.out,name));delete info.files[name];writeFileSync(path,JSON.stringify(info));
 assert.throws(()=>verifyHost(f.out),/missing-host-package-entry/);
});
test('public resource declaration must resolve to an actual package file',t=>{
 const f=fixture(t),m=structuredClone(f.manifest);m.web_accessible_resources[0].resources.push('/extension/%6dissing.mjs');
 f.rewrite(m);assert.throws(()=>verifyHost(f.out),/missing-host-package-public-file/);
});
test('public closure is taken from supplied package imports, not repository sources',t=>{
 const f=fixture(t),name='extension/content-entry.mjs',target='extension/new-public-dependency.mjs',path=join(f.out,'build-manifest.json'),info=readJson(path);
 const source=readFileSync(join(f.out,name),'utf8')+"\nimport './new-public-dependency.mjs';\n",dependency='export const example=1;\n';
 writeFileSync(join(f.out,name),source);writeFileSync(join(f.out,target),dependency);info.files[name]=sha(source);info.files[target]=sha(dependency);writeFileSync(path,JSON.stringify(info));
 assert.throws(()=>verifyHost(f.out),/missing-host-package-public-resource/);
 const manifest=readJson(join(f.out,'manifest.json'));manifest.web_accessible_resources[0].resources.push(target);
 const text=JSON.stringify(manifest);writeFileSync(join(f.out,'manifest.json'),text);info.files['manifest.json']=sha(text);writeFileSync(path,JSON.stringify(info));
 assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});
for(const [profile,options]of [['formal',{}],['offline',{offlineOrigin:'http://127.0.0.1:43210'}]]){
 test('rehashed '+profile+' manifests preserve the supported package boundary',async t=>{
  const f=fixture(t,options);assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
  for(const [name,mutate]of mutations)await t.test(name,()=>{
   const m=structuredClone(f.manifest);mutate(m);f.rewrite(m);
   assert.throws(()=>verifyHost(f.out),/invalid-host-package/);
  });
  f.rewrite(f.manifest);assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
 });
}

test('explicit restrictive Chrome defaults and ordinary metadata remain compatible',t=>{
 const f=fixture(t),m=structuredClone(f.manifest),script=m.content_scripts[0];
 delete script.all_frames; // Chrome defaults to the top frame only.
 script.world='ISOLATED';script.match_about_blank=false;script.match_origin_as_fallback=false;
 m.web_accessible_resources[0].use_dynamic_url=false;
 m.name='Same privileges, new development label';m.version='0.3.1';
 m.description='A development package';m.short_name='VAIWL';m.version_name='0.3.1 candidate';
 f.rewrite(m);assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});

test('leading slashes keep already-public resources valid without changing package files',t=>{
 const f=fixture(t),m=structuredClone(f.manifest);
 // Chromium's WAR GetPattern strips every leading slash. Public aliases must
 // remain public, while the exact same normalization cannot expose the worker.
 m.web_accessible_resources[0].resources=m.web_accessible_resources[0].resources.map((path,i)=>(i%2?'/':'//')+path);
 f.rewrite(m);assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});

test('percent-encoded already-public resources retain their supported boundary',t=>{
 const f=fixture(t),m=structuredClone(f.manifest);
 m.web_accessible_resources[0].resources=m.web_accessible_resources[0].resources.map((path,i)=>
  (i%2?'/%2F':'')+path.replace(/[a-z]/g,char=>'%'+char.charCodeAt(0).toString(16)));
 f.rewrite(m);assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});

const origin='http://127.0.0.1:43210';
const supportedOptions=[
 {},{offlineOrigin:origin},
 {offlineOrigin:origin,offlineSnippets:true},
 {offlineOrigin:origin,offlineHistory:true},
 {offlineOrigin:origin,offlineContext:true},
 {offlineOrigin:origin,offlineContext:true,offlineProjectContext:true},
 {offlineOrigin:origin,offlineContext:true,offlineExistingSend:true,offlineOldSendTerminal:true},
 {offlineOrigin:origin,offlineContext:true,offlineExistingSend:true,offlineHistory:true,offlineSnippets:true,offlineProjectContext:true},
 {offlineOrigin:origin,offlineFirstSend:true},
 {offlineOrigin:origin,offlineFirstSend:true,offlineOldSendTerminal:true,offlineHistory:true,offlineSnippets:true},
];
for(const options of supportedOptions)test('existing build configuration stays valid '+JSON.stringify(options),t=>{
 const f=fixture(t,options),before=readFileSync(join(f.out,'manifest.json'));
 assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
 assert.deepEqual(readFileSync(join(f.out,'manifest.json')),before);
});

test('new no-receipt recovery dependency stays packaged, hashed and private',t=>{
 const f=fixture(t,{offlineOrigin:origin,offlineContext:true});
 const info=readJson(join(f.out,'build-manifest.json'));
 const path='src/runtime/context-recovery/no-receipt-recovery.mjs';
 assert.equal(info.files[path],sha(readFileSync(join(f.out,path))));
 assert.equal(info.sourceHashes[path],info.files[path]);
 assert.equal(f.manifest.web_accessible_resources[0].resources.includes(path),false);
 assert.match(readFileSync(join(f.out,'extension/classic-runtime.js'),'utf8'),/createNoReceiptContextRecovery/);
 assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});

test('unified Pro repair stays private even when an otherwise valid supplied manifest is rehashed to expose it',t=>{
 const f=fixture(t,{browserLocal:true,proR1:true}),path='src/pro/integration/storage-recovery.mjs',info=readJson(join(f.out,'build-manifest.json'));
 assert.equal(info.files[path],sha(readFileSync(join(f.out,path))));
 assert.equal(info.sourceHashes[path],info.files[path]);
 assert.equal(f.manifest.web_accessible_resources[0].resources.includes(path),false);
 assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
 for(const target of [path,'/'+path,'//src/pro/integration/storage%2Drecovery.mjs']){
  const changed=structuredClone(f.manifest);changed.web_accessible_resources[0].resources.push(target);f.rewrite(changed);
  assert.throws(()=>verifyHost(f.out),/invalid-host-package-public-boundary/);
 }
 f.rewrite(f.manifest);assert.equal(verifyHost(f.out).releaseStatus,'NOT_RELEASE_READY');
});

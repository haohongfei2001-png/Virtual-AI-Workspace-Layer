import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';

const origin='http://127.0.0.1:43210',options={offlineOrigin:origin,offlineContext:true};
const read=(root,path)=>readFileSync(join(root,path),'utf8');
const json=(root,path)=>JSON.parse(read(root,path));
const sha=value=>createHash('sha256').update(value).digest('hex');
function directory(t){const dir=mkdtempSync(join(tmpdir(),'vaiwl-classic-build-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
function rewrite(root,path,text){writeFileSync(join(root,path),text);const info=json(root,'build-manifest.json');info.files[path]=sha(text);writeFileSync(join(root,'build-manifest.json'),JSON.stringify(info));}

test('classic worker builds reproduce across absolute directories and compile as actual classic scripts',t=>{
 const dir=directory(t),a=join(dir,'first'),b=join(dir,'second');
 const infoA=buildHost(a,options),infoB=buildHost(b,options);
 assert.deepEqual(infoA.files,infoB.files);
 const compiled=compileClassicWorker(a);assert.deepEqual(compiled,compileClassicWorker(b));
 for(const [key,path]of [['entry','extension/worker.mjs'],['runtime','extension/classic-runtime.js']]){
  assert.equal(typeof compiled[key],'string');assert.equal(read(a,path),compiled[key]);
  assert.doesNotThrow(()=>new vm.Script(compiled[key],{filename:path}));
  assert(!compiled[key].includes(dir),'bundle must not embed build directory');
 }
 for(const root of [a,b]){
  assert.deepEqual(json(root,'manifest.json').background,{service_worker:'extension/worker.mjs'});
  const war=json(root,'manifest.json').web_accessible_resources.flatMap(row=>row.resources);
  assert(!war.includes('extension/worker.mjs'));assert(!war.includes('extension/classic-runtime.js'));
  assert.equal(verifyHost(root).status,'OFFLINE_HOST_RECONSTRUCTION');
 }
});

function bootstrapHarness(entry,{failImport=false}={}){
 const events=()=>({listeners:new Set(),added:0,addListener(fn){this.added++;this.listeners.add(fn);},removeListener(fn){this.listeners.delete(fn);}});
 const webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>[name,events()]));
 const lifecycle=[events(),events(),events()],all=[...Object.values(webRequest),...lifecycle];
 const chrome={runtime:{id:'classic-contract',getContexts(){}},webRequest,webNavigation:{getFrame(){throw Error('unexpected request');},onCommitted:lifecycle[0],onHistoryStateUpdated:lifecycle[1]},tabs:{get(){throw Error('unexpected request');},onRemoved:lifecycle[2]}};
 let imported=0,owner,bridgeKey;
 const failure=Error('runtime-import-failed');
 const sandbox={chrome,URL,Date,Map,Set,WeakMap,WeakSet,performance,crypto,AbortController,setTimeout,clearTimeout,importScripts(path){
  assert.equal(path,'classic-runtime.js');assert.equal(++imported,1);
  for(const event of all){assert.equal(event.added,1,'registered exactly once before runtime import');assert.equal(event.listeners.size,1);}
  const bridges=Object.entries(sandbox).filter(([,value])=>value&&typeof value.claim==='function'&&typeof value.stop==='function');assert.equal(bridges.length,1);
  [bridgeKey,owner]=bridges[0];
  if(failImport)throw failure;
  const claim=owner.claim({chrome,origin,scopeProfile:{browserRequestContext:true}});
  assert.throws(()=>owner.claim({chrome,origin,scopeProfile:{browserRequestContext:true}}),/not-available/);
  claim.attach({onContextInvalidate(){},onContextReady(){},onNavigation(){},onRemoved(){}});
  assert.throws(()=>claim.attach({}),/not-available/);
 }};
 if(failImport)assert.throws(()=>vm.runInNewContext(entry,sandbox),error=>error===failure);else vm.runInNewContext(entry,sandbox);
 assert.equal(imported,1);assert.equal(Object.hasOwn(sandbox,bridgeKey),false,'bridge removed after import');
 if(!failImport)for(const event of all)assert.equal(event.listeners.size,1,'same owner survives runtime attachment');
 else for(const event of all)assert.equal(event.listeners.size,0,'failed runtime import cleans bootstrap listeners');
 owner.stop();owner.stop();for(const event of all){assert.equal(event.listeners.size,0);assert.equal(event.added,1);}
}

test('real compiled bootstrap registers before runtime import, permits one owner and cleans on stop',t=>{
 const root=join(directory(t),'build');buildHost(root,options);bootstrapHarness(read(root,'extension/worker.mjs'));
});
test('classic runtime import failure removes all real bootstrap listeners and temporary bridge',t=>{
 const root=join(directory(t),'build');buildHost(root,options);bootstrapHarness(read(root,'extension/worker.mjs'),{failImport:true});
});

test('verifier rejects rewritten-hash bundle, config, manifest and WAR mutations',async t=>{
 const dir=directory(t),base=join(dir,'base');buildHost(base,options);verifyHost(base);
 const mutations={
  'entry bytes':root=>rewrite(root,'extension/worker.mjs',read(root,'extension/worker.mjs')+'\n;globalThis.__forged=true;\n'),
  'runtime bytes':root=>rewrite(root,'extension/classic-runtime.js',read(root,'extension/classic-runtime.js')+'\n;globalThis.__forged=true;\n'),
  'config inconsistent with build manifest':root=>rewrite(root,'extension/config.mjs',read(root,'extension/config.mjs').replace(origin,'http://127.0.0.1:43211')),
  'module background':root=>{const manifest=json(root,'manifest.json');manifest.background.type='module';rewrite(root,'manifest.json',JSON.stringify(manifest));},
  'extra background property':root=>{const manifest=json(root,'manifest.json');manifest.background.persistent=true;rewrite(root,'manifest.json',JSON.stringify(manifest));},
  'runtime WAR exposure':root=>{const manifest=json(root,'manifest.json');manifest.web_accessible_resources[0].resources.push('extension/classic-runtime.js');rewrite(root,'manifest.json',JSON.stringify(manifest));},
  'entry WAR exposure':root=>{const manifest=json(root,'manifest.json');manifest.web_accessible_resources[0].resources.push('extension/worker.mjs');rewrite(root,'manifest.json',JSON.stringify(manifest));},
 };
 let index=0;for(const [name,mutate]of Object.entries(mutations))await t.test(name,()=>{
  const root=join(dir,'mutation-'+index++);cpSync(base,root,{recursive:true});mutate(root);
  const info=json(root,'build-manifest.json');for(const [path,hash]of Object.entries(info.files))assert.equal(sha(readFileSync(join(root,path))),hash,'all advertised hashes remain internally consistent');
  assert.throws(()=>verifyHost(root));
 });
});

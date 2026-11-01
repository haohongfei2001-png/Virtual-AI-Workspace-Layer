import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
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

function startContent(source,{origin='https://chatgpt.com',top=true}={}){
 const listeners=new Set(),events=new Map();let observers=0,scans=0;
 const window={addEventListener:(type,fn)=>{const set=events.get(type)??new Set();set.add(fn);events.set(type,set);},removeEventListener:(type,fn)=>events.get(type)?.delete(fn),MutationObserver:class{constructor(){observers++;}observe(){}disconnect(){observers--;}takeRecords(){return [];}}};window.top=top?window:{};
 const document={defaultView:window,location:{origin,href:origin+'/'},documentElement:{},querySelectorAll:()=>{scans++;return [];},addEventListener:window.addEventListener,removeEventListener:window.removeEventListener};
 const context=vm.createContext({window,document,location:document.location,URL,TextEncoder,chrome:{runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}}});
 for(const name of ['fetch','indexedDB'])Object.defineProperty(context,name,{get(){assert.fail('temporary bootstrap must not access '+name);}});
 vm.runInContext(source,context);
 return {listeners,events,observers:()=>observers,scans:()=>scans,request(){context.listener=[...listeners][0];return vm.runInContext("(()=>{let result;listener({v:1,type:'HOST_TEMPORARY_NATIVE_LIST'},{id:'extension',url:'chrome-extension://extension/status.html'},value=>result=value);return result;})()",context);},hide(persisted){for(const fn of [...events.get('pagehide')??[]])fn({persisted});}};
}
test('temporary packaged receiver is ready in the injection task and keeps lifecycle boundaries',t=>{
 const out=join(root(t),'sync');buildHost(out,{observedChatGPTContext:true,temporaryReadOnly:true});const source=readFileSync(join(out,'content.js'),'utf8');
 assert.doesNotMatch(source,/\bimport\s*\(/);
 const f=startContent(source);assert.equal(f.listeners.size,1);assert.equal(f.observers(),1);assert.equal(f.scans(),0,'bootstrap must not eagerly read titles');
 assert.equal(f.request().unavailable,true,'first request is received synchronously even without a supported sidebar');
 f.hide(true);assert.equal(f.listeners.size,1);assert.equal(f.observers(),1);
 f.hide(false);assert.equal(f.listeners.size,0);assert.equal(f.observers(),0);
 for(const options of [{origin:'https://other.test'},{top:false}]){const denied=startContent(source,options);assert.equal(denied.listeners.size,0);assert.equal(denied.observers(),0);assert.equal(denied.scans(),0);}
});
test('temporary verifier rejects a rehashed asynchronous bootstrap downgrade',t=>{
 const out=join(root(t),'downgrade');buildHost(out,{observedChatGPTContext:true,temporaryReadOnly:true});rewrite(out,'content.js',"void import(chrome.runtime.getURL('extension/content-entry.mjs')).catch(()=>{});\n");
 assert.throws(()=>verifyHost(out),/host-package-temporary-content-build-mismatch/);
});

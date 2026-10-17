/** Reachable source paths with existing DOM/runtime/controller doubles only.
 * No claim about Chromium's physical focus order in the earlier CI run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const importSource=(source,url)=>import('data:text/javascript;base64,'+Buffer.from(source.replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'")).toString('base64'));
async function fixtureModule(path,ending,patches,exported){
 const url=new URL(path,import.meta.url),original=await readFile(url,'utf8');
 assert.equal(original.split(ending).length,2,'fixture boundary must remain exact: '+path);
 let source=original.slice(0,original.indexOf(ending));
 for(const [before,after] of patches){assert.equal(source.split(before).length,2,'fixture adaptation must remain exact: '+before);source=source.replace(before,after);}
 return importSource(source+'\nexport {'+exported+'};\n',url);
}
// Reuse fixture constructors without importing their registered tests. Exact
// adapters only inject this test's shared document/session factory and expose
// the fixture's existing window listener map. No production source is copied.
const {fixture,drain}=await fixtureModule('./content-native-prepare-wake.test.mjs',"test('native prepare wakes",[
 ['const document={location:','const document=overrides.document??{location:'],
 ['const client=createHostContentSession({...options,...overrides});','const client=(overrides.sessionFactory??createHostContentSession)({...options,...overrides});']
],'fixture,drain');
const {sendFixture,bodyAck,settle}=await fixtureModule('./adapter-recovery-preparation.test.mjs','// A recovery snapshot',[
 ['return {adapter,document,documentListeners,binding,','return {adapter,document,documentListeners,windowListeners:listeners,binding,']
],'sendFixture,bodyAck,settle');

// Apply exactly the browser negative control's one-branch mutation in memory.
const sessionURL=new URL('../../src/host/content-session.mjs',import.meta.url),original=await readFile(sessionURL,'utf8');
const anchor="    if(enabled&&live(s)&&exactHostRecord(result,['ok','reason'])&&result.ok===false&&result.reason==='invalid-host-document'&&typeof s.scopeKey==='string'&&s.scopeKey&&!s.recoveryDenied&&s.busyClose!==true&&recoveryRemaining>0){\n     recoveryRemaining--;rebind(s,null,s.scopeKey);return;\n    }\n";
assert.equal(original.split(anchor).length,2,'remove exactly the foreground invalid-document recovery branch');
const {createHostContentSession:mutantFactory}=await importSource(original.replace(anchor,''),sessionURL);

async function prepare(t,mutant){
 let nativePrepare;
 const adapter=sendFixture({onNativePrepare:producer=>nativePrepare(producer)});
 adapter.setTime(1000);adapter.document.location.origin='https://chatgpt.com';adapter.document.visibilityState='visible';
 const f=fixture({document:adapter.document,...(mutant?{sessionFactory:mutantFactory}:{}),adapterFactory:options=>{nativePrepare=options.onNativePrepare;return adapter.adapter;}});
 t.after(()=>f.client.stop());
 f.setResponse(m=>m.type==='HOST_FOCUS'?{ok:false,reason:'invalid-host-document'}:m.protocol==='vaiwl-host-observation/1'?bodyAck(m):f.normal(m));
 await f.client.start();
 await adapter.start(f.context.emit,{binding:f.context.binding,ingestionPass:f.context.ingestionPass});await settle();await drain();
 assert(f.client.prepareIdle());assert.equal(await f.client.enterDormant(),true);
 await f.advance(20001);adapter.setTime(21001);
 assert.equal(adapter.adapter.prepareIdle(),null);assert(adapter.adapter.prepareRecovery());
 adapter.windowListeners.get('blur')();
 const before=f.calls.length;
 return {f,adapter,before,types:()=>f.calls.slice(before).map(m=>m.type).filter(t=>['HOST_FOCUS','HOST_HELLO','HOST_REFRESH'].includes(t))};
}
for(const mutant of [false,true])test(`editor focusin before window focus bypasses foreground branch (mutant=${mutant})`,async t=>{
 const {f,adapter,types}=await prepare(t,mutant);
 adapter.documentListeners.get('focusin')({type:'focusin',isTrusted:true,target:adapter.editor});
 adapter.windowListeners.get('focus')();
 await drain();await settle();
 assert.deepEqual(types(),['HOST_HELLO','HOST_REFRESH']);
 assert.equal(f.resumed.length,1);assert.deepEqual(f.resumed[0].mode,{mode:'reading'});
});
for(const mutant of [false,true])test(`non-composer heading focus cannot prepare; window focus hits exact branch (mutant=${mutant})`,async t=>{
 const {f,adapter,types}=await prepare(t,mutant);
 const heading={tagName:'H1'};
 for(const type of ['pointerdown','focusin','click'])adapter.documentListeners.get(type)?.({type,isTrusted:true,target:heading,button:0});
 adapter.windowListeners.get('focus')();
 await drain();await settle();await drain();
 assert.deepEqual(types(),mutant?['HOST_FOCUS']:['HOST_FOCUS','HOST_HELLO','HOST_REFRESH']);
 assert.equal(f.resumed.length,0);
});

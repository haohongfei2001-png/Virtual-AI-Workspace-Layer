import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotMainMountCheck,validMainMountCheck,createMainMountDiagnosticSlot,claimMainMountDiagnostic,MAIN_MOUNT_DIAGNOSTIC_BATCH} from '../../src/host/native-flow-diagnostic.mjs';
import {createMainMountSnapshot,installLocalStatus,validLayoutShape} from '../../src/host/local-status.mjs';
function fixture(){
 const document={location:{href:'https://chatgpt.com/'},defaultView:{performance:{now:()=>1}}};let geometryReads=0;
 const node=(tag,parent=null)=>{const n={nodeType:1,tagName:tag,isConnected:true,ownerDocument:document,parentNode:parent,childNodes:[],getAttribute:key=>{assert.equal(key,'role');return null;},getBoundingClientRect:()=>{geometryReads++;return {x:240,y:80,width:600,height:120};}};for(const k of ['textContent','innerText','outerHTML','innerHTML','id','title','href','className','value'])Object.defineProperty(n,k,{get(){throw Error('PRIVATE_'+k);}});parent?.childNodes.push(n);return n;};
 const root=node('MAIN'),wrapper=node('DIV',root),bad=node('CUSTOM-PRIVATE',wrapper),reading=node('DIV',root),composer=node('FORM',root),header=node('HEADER');
 const inspection={reading,composer,header,protectedRegions:[composer]};
 const args={document,inspection,root,node:bad,reason:'native-flow-uncovered-branch',kind:'conversation',phase:'walk',detail:'branch-without-landmark',visited:3};
 return {document,node,root,bad,wrapper,args,get geometryReads(){return geometryReads;}};
}
test('refused path and landmarks have local topology, fixed categories and no text/attribute values',()=>{
 const f=fixture(),r=snapshotMainMountCheck(f.args);assert(validMainMountCheck(r));assert.equal(r.coverage,'complete');assert.equal(r.rejected,2);
 assert.deepEqual(r.rows.slice(0,3).map(row=>row.slice(0,5)),[[-1,null,'MAIN','absent',3],[0,0,'DIV','absent',1],[1,0,'OTHER','absent',65]]);
 assert.equal(r.rows.length,6);assert.deepEqual(r.landmarks,[3,4,5]);assert(!JSON.stringify(r).includes('PRIVATE'));assert(validLayoutShape({mainMountCheck:r}));
});
test('limits are explicit and cannot be called a complete rejected path',()=>{
 const f=fixture();let parent=f.bad;for(let i=0;i<18;i++)parent=f.node('DIV',parent);
 const deep=snapshotMainMountCheck({...f.args,node:parent});assert(validMainMountCheck(deep));assert.equal(deep.limit,'depth');assert.equal(deep.coverage,'partial');assert(deep.rows.length<=24);
 const wide=fixture();for(let i=0;i<130;i++)wide.node('DIV',wide.wrapper);const last=wide.wrapper.childNodes.at(-1);
 assert.equal(snapshotMainMountCheck({...wide.args,node:last}).limit,'rows');
 let tick=0;const timed=snapshotMainMountCheck({...f.args,elapsedNow:()=>tick+=2});assert(validMainMountCheck(timed));assert.equal(timed.limit,'time');assert.equal(timed.coverage,'partial');
 const failed=snapshotMainMountCheck({...f.args,node:null,root:null,phase:'exception',detail:'exception',reason:'native-flow-check-failed'});assert(validMainMountCheck(failed));assert.equal(failed.coverage,'partial');assert.equal(failed.rejected,null);
});
test('allowlist rejects extra values, accessors, row properties and incomplete claims without invoking getters',()=>{
 const r=snapshotMainMountCheck(fixture().args);
 for(const patch of [{title:'PRIVATE'},{reason:'PRIVATE'},{detail:'PRIVATE'},{kind:'PRIVATE'},{coverage:'complete',limit:'depth'},{rejected:null}])assert.equal(validMainMountCheck({...r,...patch}),false);
 for(const k of Object.keys(r)){let called=false;const v={...r};Object.defineProperty(v,k,{enumerable:true,get(){called=true;throw Error('PRIVATE');}});assert.equal(validMainMountCheck(v),false);assert.equal(called,false);}
 const extra=structuredClone(r);extra.rows[0].secret='PRIVATE';assert.equal(validMainMountCheck(extra),false);
 const getter=structuredClone(r);Object.defineProperty(getter.rows[0],'2',{get(){assert.fail('row getter');}});assert.equal(validMainMountCheck(getter),false);
});
test('status slot is default-off, once-only, read-copy-only and bound to a live home generation',()=>{
 const f=fixture(),report=snapshotMainMountCheck(f.args),off=createMainMountDiagnosticSlot({document:f.document});assert.equal(off.take(()=>true),null);
 let live=true;const slot=createMainMountDiagnosticSlot({document:f.document,enabled:true}),write=slot.take(()=>live);write(report);const reads=f.geometryReads;
 slot.read().rows.length=0;assert(slot.read().rows.length>0);assert.equal(f.geometryReads,reads);assert.equal(slot.take(()=>true),null);
 f.document.location.href+='c/private';assert.equal(slot.read(),null);f.document.location.href='https://chatgpt.com/';live=false;write(report);assert.equal(slot.read(),null);assert.equal(slot.take(()=>true),null);
 f.document.location.href+='g/p/project';assert.equal(createMainMountDiagnosticSlot({document:f.document,enabled:true}).take(()=>true),null);
});
function budget(){let occupied=false,value,writes=0;return {storage:{get:async key=>({[key]:value}),set:async values=>{writes++;value=values[MAIN_MOUNT_DIAGNOSTIC_BATCH];}},locks:{async request(key,opts,fn){assert.equal(key,MAIN_MOUNT_DIAGNOSTIC_BATCH);assert.deepEqual(opts,{ifAvailable:true});if(occupied)return fn(null);occupied=true;try{return await fn({});}finally{occupied=false;}}},get value(){return value;},get writes(){return writes;}};}
test('a fixed spent bit prevents a second tab or Reload from collecting again',async()=>{
 const b=budget(),args={...b,url:'https://chatgpt.com/'};const pair=await Promise.all([claimMainMountDiagnostic(args),claimMainMountDiagnostic(args)]);assert.equal(pair.filter(Boolean).length,1);assert.equal(b.writes,1);assert.deepEqual(b.value,{spent:true});assert.equal(await claimMainMountDiagnostic(args),false);
 const other=budget();assert.equal(await claimMainMountDiagnostic({...other,url:'https://chatgpt.com/c/private'}),false);assert.equal(other.writes,0);
});
test('lost storage reply or a changed document cannot activate or replay the attempt',async()=>{
 const b=budget();let timeout,finish;const args={...b,url:'https://chatgpt.com/',schedule:fn=>(timeout=fn,1),cancel(){}};
 const write=b.storage.set;b.storage.set=async v=>{await write(v);await new Promise(r=>finish=r);};
 const pending=claimMainMountDiagnostic(args);while(!finish)await Promise.resolve();timeout();assert.equal(await pending,false);finish();assert.equal(await claimMainMountDiagnostic({...b,url:args.url}),false);assert.equal(b.writes,1);
 let current='https://chatgpt.com/';const changed=budget(),get=changed.storage.get;changed.storage.get=async key=>{current+='c/private';return get(key);};assert.equal(await claimMainMountDiagnostic({...changed,url:args.url,currentURL:()=>current}),false);assert.equal(changed.writes,0);
 const rejected=budget();rejected.storage.get=async()=>{throw Error('PRIVATE');};assert.equal(await claimMainMountDiagnostic({...rejected,url:args.url}),false);assert.equal(rejected.writes,0);
});
test('existing private status channel exports only validated report and bound build',async()=>{
 const report=snapshotMainMountCheck(fixture().args);let listener,reads=0;const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listener=f,removeListener(){}}};
 const remove=installLocalStatus({runtime,readState:()=> 'surface-native-flow-uncovered-branch',readLayout:()=>{reads++;return {mainMountCheck:report};}});
 const message={v:1,type:'HOST_LOCAL_LAYOUT'},sender={id:runtime.id,url:runtime.getURL('status.html')};
 listener(message,{...sender,url:runtime.getURL('workspace.html')},()=>assert.fail('wrong sender'));assert.equal(reads,0);
 for(let i=0;i<2;i++)listener(message,sender,r=>assert.deepEqual(r.shape.mainMountCheck,report));assert.equal(reads,2);
 const target={tabId:1,documentId:'PRIVATE_DOCUMENT',url:'https://chatgpt.com/'},boot={v:1,stage:'module-loaded',build:'a'.repeat(64)},frame={documentId:target.documentId,url:target.url,documentLifecycle:'active'},args={target,boot,shape:{mainMountCheck:report},webNavigation:{getFrame:async()=>frame}};
 const exported=await createMainMountSnapshot(args);assert.equal(exported.build,boot.build);assert(!JSON.stringify(exported).includes('PRIVATE'));assert.equal(exported.scope,'first-preflight-path-and-landmarks-only');
 assert.equal(await createMainMountSnapshot({...args,webNavigation:{getFrame:async()=>({...frame,documentId:'replacement'})}}),null);
 assert.equal(await createMainMountSnapshot({...args,boot:{...boot,stage:'module-loading'}}),null);remove();
});

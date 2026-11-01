import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 const results=await page.evaluate(async()=>{
  const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{WorkspaceRepository}=await import('/src/data/repository.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{emptyNativeFacts}=await import('/src/data/native-facts.mjs'),{freeProjection}=await import('/src/data/free-projection.mjs'),{digest}=await import('/src/data/hash.mjs');
  const A=scopeOf('A'),B=scopeOf('B'),results=[];
  const check=(v,msg='assertion-failed')=>{if(!v)throw Error(msg);},equal=(a,b,msg='not-equal')=>check(JSON.stringify(a)===JSON.stringify(b),msg+': '+JSON.stringify(a)+' != '+JSON.stringify(b));
  async function harness(){const name='backfill_'+crypto.randomUUID().replaceAll('-',''),base=new ScopeRepository({indexedDB,databaseName:name}),otherBase=new ScopeRepository({indexedDB,databaseName:name}),repo=new WorkspaceRepository({baseRepository:base,evidenceGate:()=>'synthetic'}),other=new WorkspaceRepository({baseRepository:otherBase,evidenceGate:()=>'synthetic'});await base.open();await otherBase.open();return {base,repo,other,close:()=>{base.close();otherBase.close();}};}
  const add=async(h,id,scope=A,projectId=null)=>{const result=await h.base.upsert({scope,ref:{conversationId:id,nativeUrl:`https://vaiwl-hf.test/hf/${scope.accountId}/c/${id}`,projectId},operationId:'add_'+id,expectedRevision:0});check(result.ok,JSON.stringify(result));};
  const state=async(h,scope=A)=>(await h.repo.read(scope)).state;
  const run=async(name,action)=>{const h=await harness();try{await action(h);results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.stack});}finally{h.close();}};
  await run('bounded batches resume after reconnect; done cursor resets for lexically lower new anchor',async h=>{
   for(const id of ['M','N','Z'])await add(h,id);
   const first=await h.repo.reconcileKnownReferences(A,{limit:1});check(first.ok);equal(first.processed,1);equal(first.added,1);check(!first.done);
   h.base.close();const second=await h.repo.reconcileKnownReferences(A,{limit:1});check(second.ok);equal(second.processed,1);equal(second.added,1);
   let done;for(let i=0;i<4;i++){done=await h.repo.reconcileKnownReferences(A,{limit:1});check(done.ok);if(done.done)break;}check(done.done);equal(Object.keys((await state(h)).refs).sort(),['M','N','Z']);
   const idle=await h.repo.reconcileKnownReferences(A,{limit:1});check(idle.ok&&idle.done);equal(idle.added,0);
   await add(h,'A_low');const reset=await h.repo.reconcileKnownReferences(A,{limit:1});check(reset.ok);equal(reset.added,1);check((await state(h)).refs.A_low,'new low-key reference cannot be stranded behind old cursor');
  });
  await run('backfill isolates scope and does not turn historical Project metadata into native name/membership or sources',async h=>{
   await add(h,'Aref',A,'P_old');await add(h,'Bref',B,'P_other');const result=await h.repo.reconcileKnownReferences(A,{limit:5});check(result.ok);const shared=await state(h);equal(Object.keys(shared.refs),['Aref']);equal(Object.keys((await state(h,B)).refs),[]);equal(Object.keys(shared.sources),[]);equal(Object.keys(shared.events),[]);
   const snapshot=freeProjection(emptyNativeFacts(A),{scope:A,now:'2026-10-13T00:00:00Z',knownState:shared});equal(snapshot.refs[0].membership,'UNKNOWN');equal(snapshot.refs[0].nativeTitle,null);equal(snapshot.projects,[]);
  });
  await run('concurrent connections serialize cursor and preserve Pro manual assets',async h=>{
   const created=await h.repo.command(A,{operationId:'pro_asset',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'human',name:'保留人工主题'}});check(created.ok);const manual=(await state(h)).workspaces;
   for(const id of ['one','two','three'])await add(h,id);
   const outcomes=await Promise.all([h.repo.reconcileKnownReferences(A,{limit:2}),h.other.reconcileKnownReferences(A,{limit:2})]);check(outcomes.every(x=>x.ok),JSON.stringify(outcomes));equal(outcomes.reduce((n,r)=>n+r.added,0),3);equal(Object.keys((await state(h)).refs).sort(),['one','three','two']);equal((await state(h)).workspaces,manual);
  });
  await run('invalid limits and cancelled/late guard never advance cursor or publish partial anchors',async h=>{
   await add(h,'A');for(const limit of [0,-1,5001,1.5,NaN]){let rejected=false;try{await h.repo.reconcileKnownReferences(A,{limit});}catch{rejected=true;}check(rejected,'invalid-limit accepted');}
   const before=digest(await state(h)),controller=new AbortController();controller.abort();const aborted=await h.repo.reconcileKnownReferences(A,{limit:1,signal:controller.signal});check(!aborted.ok);equal(digest(await state(h)),before);
   let checks=0;const late=await h.repo.reconcileKnownReferences(A,{limit:1,guard:()=>++checks<3});check(!late.ok);equal(digest(await state(h)),before);
   const retry=await h.repo.reconcileKnownReferences(A,{limit:1});check(retry.ok);equal(retry.added,1);
  });
  await run('injected quota error atomically rolls back both anchor and cursor, then exact batch resumes',async h=>{
   await add(h,'A');const db=await h.base.open(),original=db.transaction.bind(db);let injected=false;
   db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(args[1]==='readwrite'){const put=store.put.bind(store);store.put=value=>{if(!injected){injected=true;throw new DOMException('test-quota','QuotaExceededError');}return put(value);};}return store;};return tx;};
   const failed=await h.repo.reconcileKnownReferences(A,{limit:1});db.transaction=original;check(injected);check(!failed.ok);equal(Object.keys((await state(h)).refs),[]);const retry=await h.repo.reconcileKnownReferences(A,{limit:1});check(retry.ok);equal(retry.added,1);
  });
  for(const partitioned of [false,true])await run(`corrupt root rejects backfill and shared recovery resets durable cursor (${partitioned?'partitioned':'legacy'})`,async h=>{
   const created=await h.repo.command(A,{operationId:'preserved_asset',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'human',name:'恢复保留人工主题'}});check(created.ok);
   if(partitioned)check((await h.repo.migratePartitioned(A)).ok);
   await add(h,'A');await add(h,'B');const filled=await h.repo.reconcileKnownReferences(A,{limit:5});check(filled.ok&&filled.done);
   const shared=await state(h),key=shared.scopeKey,db=await h.base.open(),{knownAnchorCursorKey}=await import('/src/data/known-anchor-key.mjs'),cursorKey=knownAnchorCursorKey(key);
   const get=key=>new Promise((resolve,reject)=>{const tx=db.transaction('b23_states'),request=tx.objectStore('b23_states').get(key);tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);});
   const cursor=await get(cursorKey);check(cursor,'completed cursor persisted');
   const root=await get(key);root.checksum='damaged';await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite');tx.objectStore('b23_states').put(root);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
   const failed=await h.repo.reconcileKnownReferences(A,{limit:1});check(!failed.ok);equal(await get(cursorKey),cursor,'corruption must not advance cursor');
   const plan=await h.repo.recoveryStatus(A);check(plan.recoverable,JSON.stringify(plan));const repaired=await h.repo.recover(A,{operationId:'repair_shared',damagedHash:plan.damagedHash});check(repaired.ok,JSON.stringify(repaired));equal(await get(cursorKey),undefined,'successful recovery invalidates completion marker');
   const resumed=await h.repo.reconcileKnownReferences(A,{limit:5});check(resumed.ok&&resumed.processed>0);const after=await state(h);check(after.refs.A&&after.refs.B);equal(after.workspaces.human.name,'恢复保留人工主题');
  });
  return results;
 });
 await writeFile('/private/tmp/free-known-anchor-backfill-browser.json',JSON.stringify({evidence:'HEADLESS_SYNTHETIC_REAL_IDB',browser:browser.version(),results},null,2));console.log(JSON.stringify(results));assert(results.every(r=>r.status==='PASS'));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

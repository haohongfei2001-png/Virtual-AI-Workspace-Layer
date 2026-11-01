/** Browser-evaluated, TEST ONLY actual IndexedDB concurrency case.
 * Explicitly seeded historical schema; not a captured old Host installation. */
export async function schemaInflightCase(){
 const {ScopeRepository}=await import('/src/b1/scope-repository.mjs');
 const {normalizedScope}=await import('/src/b1/identity.mjs');
 const {digest}=await import('/src/data/hash.mjs');
 const c=globalThis.schemaCase,check=(value,reason)=>{if(!value)throw Error(reason);};
 const dump=db=>new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),rows={};for(const name of names){rows[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const cursor=q.result;if(cursor){rows[name].push({key:cursor.key,value:cursor.value});cursor.continue();}};}tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error);});
 const source=await c.base.open(),seed=await dump(source),name='schema_inflight_v3';c.base.close();
 check(Object.keys(seed).length===8,'expected-eight-real-stores');
 const old=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,3);q.onupgradeneeded=()=>{for(const storeName of Object.keys(seed)){const store=q.result.createObjectStore(storeName,{keyPath:'key'});if(storeName==='refs')store.createIndex('scopeKey','scopeKey');if(storeName==='b23_operations')store.createIndex('scopeKey','payload.scopeKey');for(const row of seed[storeName])store.put(row.value);}};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 const owners=Array.from({length:3},()=>new ScopeRepository({indexedDB,databaseName:name})),events=[];
 try{
  check(digest(await dump(old))===digest(seed),'v3-fixture-copy-not-exact');
  const row=seed.refs.find(row=>row.value.conversationId==='T0'&&row.value.scopeKey===normalizedScope(c.scope).key);check(row,'missing-original-B1-ref');
  const expected=structuredClone(seed),next={...row.value,revision:row.value.revision+1},receipt={key:'inflight-fixture-receipt',payload:{kind:'TEST_ONLY_OLD_TRANSACTION',refKey:row.key,revision:next.revision}};
  expected.refs.find(value=>value.key===row.key).value=next;expected.operations.push({key:receipt.key,value:receipt});expected.operations.sort((a,b)=>indexedDB.cmp(a.key,b.key));
  let upgrading=false,reads=0,closedTransactionReason=null,ownersUnpublished=false;const started=performance.now();
  old.onversionchange=event=>{check(event.isTrusted&&event.oldVersion===3&&event.newVersion===4,'invalid-versionchange');events.push('old-versionchange');upgrading=true;ownersUnpublished=owners.every(owner=>owner.connection===null);old.close();try{old.transaction('refs');}catch(error){closedTransactionReason=error.name;}};
  const tx=old.transaction(['refs','operations'],'readwrite');
  const completed=new Promise((resolve,reject)=>{tx.oncomplete=()=>{events.push('old-transaction-complete');resolve();};tx.onabort=()=>reject(tx.error??Error('old-transaction-aborted'));});
  // Keep only this existing transaction active. Closing the connection must
  // prohibit new transactions but must not discard already accepted writes.
  function read(){const q=tx.objectStore('refs').get(row.key);q.onsuccess=()=>{reads++;if(upgrading){tx.objectStore('refs').put(next);tx.objectStore('operations').put(receipt);events.push('old-write-queued');return;}if(reads>=10000||performance.now()-started>=5000){tx.abort();return;}read();};}
  read();
  const opens=owners.map((owner,index)=>owner.open().then(db=>{events.push('owner-open-'+index);return db;}));
  const [,...connections]=await Promise.all([completed,...opens]);
  check(ownersUnpublished&&closedTransactionReason==='InvalidStateError','closing-connection-or-publication-fence');
  check(connections.every(db=>db.version===4&&db.name===name),'owner-version-mismatch');
  check(events.indexOf('old-versionchange')<events.indexOf('old-write-queued')&&events.indexOf('old-write-queued')<events.indexOf('old-transaction-complete'),'old-write-order');
  check(events.filter(event=>event.startsWith('owner-open-')).length===3&&events.every((event,index)=>!event.startsWith('owner-open-')||index>events.indexOf('old-transaction-complete')),'owners-read-before-old-commit');
  check(digest(await dump(connections[0]))===digest(expected),'upgrade-lost-or-added-records');
  const refused=await new Promise(resolve=>{const q=indexedDB.open(name,3);q.onerror=()=>resolve(q.error.name);q.onsuccess=()=>{q.result.close();resolve('unexpected-open');};});check(refused==='VersionError','old-reopen-not-fenced');
  const scope={verified:true,provider:c.scope.provider,accountId:c.scope.accountId,organizationId:c.scope.organizationId};
  const current=await owners[0].get(scope,'T0');check(current?.revision===next.revision,'current-owner-missed-committed-revision');
  const stale=await owners[1].upsert({scope,ref:{conversationId:'T0',nativeUrl:current.nativeUrl,projectId:current.projectId},operationId:'inflight_stale_cas',expectedRevision:row.value.revision});check(stale.ok===false&&stale.reason==='revision-conflict','stale-CAS-accepted');check(digest(await dump(connections[0]))===digest(expected),'stale-CAS-mutated-records');
  const operationId='inflight_fresh_cas',fresh=await owners[2].upsert({scope,ref:{conversationId:'T0',nativeUrl:current.nativeUrl,projectId:current.projectId},operationId,expectedRevision:current.revision});
  check(fresh.ok===true&&fresh.record.revision===current.revision+1,'fresh-CAS-failed');
  const after=await dump(connections[0]),opKey=JSON.stringify([normalizedScope(scope).key,operationId]);
  check(after.operations.some(value=>value.key===opKey),'fresh-CAS-missing-receipt');
  after.operations=after.operations.filter(value=>value.key!==opKey);after.refs.find(value=>value.key===row.key).value=next;
  check(digest(after)===digest(expected),'fresh-CAS-changed-unrelated-records');
  return {fixture:'EXPLICIT_EIGHT_STORE_SCHEMA3_COPY',events,reads,databaseVersion:4,owners:3,oldReader:refused,closedTransactionReason,ownersUnpublished,freshCASRevision:fresh.record.revision,allEightStoresExact:true,manualAssetsIncluded:true,oldCommittedRevision:next.revision,currentOwnerRevision:current.revision,staleCAS:stale};
 }finally{old.close();for(const owner of owners)owner.close();}
}

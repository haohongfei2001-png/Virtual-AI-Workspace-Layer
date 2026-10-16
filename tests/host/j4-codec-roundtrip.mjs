import {DATABASE_VERSION} from '../../src/data/schema.mjs';
import {ensureUpdatedRuntime} from './historical-host-runtime.mjs';
import assert from 'node:assert/strict';
import {cp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {historicalSource,replaceDisabledPackage,directoryDigest,OLD_HOST_COMMIT} from './historical-package.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
/** TEST ONLY: real archived reader, same isolated extension ID and database.
 * Archived owners must fail at database open; raw inspectors never authorize them. */
export async function probeJ4HistoricalCodec({context,cdp,controller,id,slot,root,origin,scope,pending,committedReceipt,closeProbe,assets,preserved,record}){
 assert.equal(pending.format,'vaiwl-native-continuation-v2');assert(committedReceipt);
 const saved=join(root,'codec-current-package'),frozen=join(root,'codec-old-source');
 await cp(slot,saved,{recursive:true});const currentDigest=await directoryDigest(saved);
 const archive=await historicalSource(fileURLToPath(new URL('../..',import.meta.url)),OLD_HOST_COMMIT,frozen);
 const oldModule=await import(pathToFileURL(join(frozen,'extension/package.mjs')));
 const old=oldModule.packageHost(join(root,'codec-old-package'),{offlineOrigin:origin});
 assert.equal(oldModule.verifyHost(old.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
 const permissions=JSON.parse(await readFile(join(old.unpacked,'manifest.json'),'utf8'));assert.deepEqual(permissions.host_permissions,['http://127.0.0.1/*']);assert.equal(permissions.content_security_policy.extension_pages,`script-src 'self'; object-src 'none'; connect-src ${origin}`);
 const oldManifestHash=hash(await readFile(join(old.unpacked,'build-manifest.json')));
 let probe,disabled=false,slotTouched=false,primaryError=null;
 const runtimeUpdates={old:{},current:{}};
 const runtime=async(expected,report)=>ensureUpdatedRuntime({expected,report,read:async()=>{const page=await context.newPage();try{await page.goto(`chrome-extension://${id}/workspace.html`);return await page.evaluate(()=>chrome.runtime.getManifest());}finally{await page.close();}},reload:async()=>assert.equal((await cdp.send('Extensions.loadUnpacked',{path:slot})).id,id)});
 const enable=async value=>{assert.deepEqual(await controller.evaluate(value=>setTargetEnabled(value),value),{id,enabled:value});disabled=!value;};
 try{
  await closeProbe();await enable(false);
  slotTouched=true;await replaceDisabledPackage(old.unpacked,slot,{disabled,root});
  assert.equal((await cdp.send('Extensions.loadUnpacked',{path:slot})).id,id);await enable(true);await runtime(permissions,runtimeUpdates.old);
  probe=await context.newPage();await probe.goto(`chrome-extension://${id}/workspace.html`);
  assert.equal(hash(await probe.evaluate(async()=>await(await fetch(chrome.runtime.getURL('build-manifest.json'))).text())),oldManifestHash);
  const result=await probe.evaluate(async({scope,pending,committedReceipt,expectedVersion})=>{
   const [{ScopeRepository},{NativeRepository},{digest}]=await Promise.all([import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),import(chrome.runtime.getURL('src/data/native-repository.mjs')),import(chrome.runtime.getURL('src/data/hash.mjs'))]);
   const base=new ScopeRepository({indexedDB});let db;try{
    const normalized=base.scopeOrThrow(scope),nativeKey=JSON.stringify([normalized.key,pending.operationId]);
    // Raw read-only inspector is test evidence, never injected into the old owner.
    db=await new Promise((resolve,reject)=>{const q=indexedDB.open(base.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    if(db.version!==expectedVersion)throw Error('codec-probe-database-version-mismatch');
    const read=()=>new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names,'readonly'),store=tx.objectStore('native_operations'),native=store.get(nativeKey),evidence=store.get(committedReceipt.key),rows={};for(const name of names){rows[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const c=q.result;if(c){rows[name].push({key:c.key,value:c.value});c.continue();}};}tx.oncomplete=()=>resolve({native:native.result,evidence:evidence.result,allTablesDigest:digest(rows)});tx.onabort=()=>reject(tx.error);});
    const before=await read();
    if(!before.native||before.native.checksum!==digest(before.native.payload)||JSON.stringify(before.native.payload.continuation)!==JSON.stringify(pending)||JSON.stringify(before.evidence)!==JSON.stringify(committedReceipt))throw Error('codec-probe-original-record-mismatch');
    const old=new NativeRepository({baseRepository:base}),refusals={};
    for(const [name,run] of [['open',()=>base.open()],['listContinuations',()=>old.listContinuations(scope)],['invalidate',()=>old.invalidate(scope,{operationId:'offline-old-invalidate',expectedRevision:pending.nativeRevision,sourceId:pending.nativeWitness.sourceId},{guard:()=>true})]]){
      try{await run();}catch(error){refusals[name]=error.name;}
      if(refusals[name]!=='VersionError')throw Error('codec-probe-old-owner-not-version-fenced:'+name);
    }
    const refusal='VersionError';
    const after=await read();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('codec-probe-old-reader-changed-records');
    return {refusal,refusals,databaseVersion:db.version,allTablesDigest:before.allTablesDigest,nativeRecordHash:digest(before.native),evidenceReceiptHash:digest(before.evidence),originalRecordsUnchanged:true};
   }finally{db?.close();base.close();}
  },{scope,pending,committedReceipt,expectedVersion:DATABASE_VERSION});
  record('actual-archived-v1-Host-reader-refuses-current-v2-with-original-assets-and-receipts',{...result,archive,oldManifestHash,extensionId:id,runtimeUpdate:runtimeUpdates.old,coverage:'ACTUAL_ARCHIVED_OWNER_DATABASE_VERSION_FENCE'});
 }catch(error){primaryError=error;}finally{
  const cleanupErrors=[];
  for(const close of [()=>probe?.close(),closeProbe])try{await close();}catch(error){cleanupErrors.push(error);}
  if(slotTouched)try{
   // Always confirm disable again: a prior enable may have succeeded before its
   // acknowledgement failed. Never replace an ambiguously enabled package.
   await enable(false);await replaceDisabledPackage(saved,slot,{disabled,root});assert.equal(await directoryDigest(slot),currentDigest);assert.equal((await cdp.send('Extensions.loadUnpacked',{path:slot})).id,id);await enable(true);
   await runtime(JSON.parse(await readFile(join(saved,'manifest.json'),'utf8')),runtimeUpdates.current);
  }catch(error){cleanupErrors.push(error);}
  if(cleanupErrors.length)primaryError=new AggregateError([...(primaryError?[primaryError]:[]),...cleanupErrors],'codec-roundtrip-or-restoration-failed');
 }
 if(primaryError)throw primaryError;
 assert.deepEqual(await assets(scope),preserved);
 record('current-Host-package-restored-same-extension-ID-before-fresh-grant',{extensionId:id,currentDigest,runtimeUpdate:runtimeUpdates.current,authorityRestored:false});
}

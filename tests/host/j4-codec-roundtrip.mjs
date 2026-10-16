import {ensureUpdatedRuntime} from './historical-host-runtime.mjs';
import assert from 'node:assert/strict';
import {cp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {historicalSource,replaceDisabledPackage,directoryDigest,OLD_HOST_COMMIT} from './historical-package.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
/** TEST ONLY: real archived reader, same isolated extension ID and database.
 * This proves a specific old-reader refusal, not all old-writer entry points. */
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
  await enable(true);assert.equal((await cdp.send('Extensions.loadUnpacked',{path:slot})).id,id);await runtime(permissions,runtimeUpdates.old);
  probe=await context.newPage();await probe.goto(`chrome-extension://${id}/workspace.html`);
  assert.equal(hash(await probe.evaluate(async()=>await(await fetch(chrome.runtime.getURL('build-manifest.json'))).text())),oldManifestHash);
  const result=await probe.evaluate(async({scope,pending,committedReceipt})=>{
   const [{ScopeRepository},{NativeRepository},{digest}]=await Promise.all([import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),import(chrome.runtime.getURL('src/data/native-repository.mjs')),import(chrome.runtime.getURL('src/data/hash.mjs'))]);
   const base=new ScopeRepository({indexedDB});try{
    const normalized=base.scopeOrThrow(scope),db=await base.open(),nativeKey=JSON.stringify([normalized.key,pending.operationId]);
    const read=()=>new Promise((resolve,reject)=>{const tx=db.transaction('native_operations','readonly'),store=tx.objectStore('native_operations'),native=store.get(nativeKey),evidence=store.get(committedReceipt.key);tx.oncomplete=()=>resolve({native:native.result,evidence:evidence.result});tx.onabort=()=>reject(tx.error);});
    const before=await read();
    if(!before.native||before.native.checksum!==digest(before.native.payload)||JSON.stringify(before.native.payload.continuation)!==JSON.stringify(pending)||JSON.stringify(before.evidence)!==JSON.stringify(committedReceipt))throw Error('codec-probe-original-record-mismatch');
    let refusal=null;try{await new NativeRepository({baseRepository:base}).listContinuations(scope);}catch(error){refusal=error.message;}
    if(refusal!=='invalid-native-continuation-schema')throw Error('codec-probe-old-reader-did-not-refuse-v2:'+refusal);
    const after=await read();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('codec-probe-old-reader-changed-records');
    return {refusal,nativeRecordHash:digest(before.native),evidenceReceiptHash:digest(before.evidence),originalRecordsUnchanged:true};
   }finally{base.close();}
  },{scope,pending,committedReceipt});
  assert.deepEqual(await assets(scope),preserved);
  record('actual-archived-v1-Host-reader-refuses-current-v2-with-original-assets-and-receipts',{...result,archive,oldManifestHash,extensionId:id,runtimeUpdate:runtimeUpdates.old,coverage:'ACTUAL_OLD_READER_REFUSAL_NOT_ALL_OLD_WRITER_PATHS'});
 }catch(error){primaryError=error;}finally{
  const cleanupErrors=[];
  for(const close of [()=>probe?.close(),closeProbe])try{await close();}catch(error){cleanupErrors.push(error);}
  if(slotTouched)try{
   // Always confirm disable again: a prior enable may have succeeded before its
   // acknowledgement failed. Never replace an ambiguously enabled package.
   await enable(false);await replaceDisabledPackage(saved,slot,{disabled,root});assert.equal(await directoryDigest(slot),currentDigest);await enable(true);assert.equal((await cdp.send('Extensions.loadUnpacked',{path:slot})).id,id);
   await runtime(JSON.parse(await readFile(join(saved,'manifest.json'),'utf8')),runtimeUpdates.current);
  }catch(error){cleanupErrors.push(error);}
  if(cleanupErrors.length)primaryError=new AggregateError([...(primaryError?[primaryError]:[]),...cleanupErrors],'codec-roundtrip-or-restoration-failed');
 }
 if(primaryError)throw primaryError;
 record('current-Host-package-restored-same-extension-ID-before-fresh-grant',{extensionId:id,currentDigest,runtimeUpdate:runtimeUpdates.current,authorityRestored:false});
}

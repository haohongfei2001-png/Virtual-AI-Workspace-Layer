import {freshInstallationRecord} from './free-policy-initialization.mjs';
/** Upgrade the SAME B1 database. No second database, destructive reset or native data. */
export const DATABASE_VERSION = 4;
export const NATIVE_STORES = ['native_states', 'native_operations'];
export const B23_STORES = ['b23_states','b23_operations','b23_checkpoints','b23_views'];
function scopeIndexMatches(store,keyPath){
  if(!store.indexNames.contains('scopeKey'))return false;
  const index=store.index('scopeKey');
  return index.keyPath===keyPath&&index.unique===false&&index.multiEntry===false;
}
const REQUIRED_STORES = ['refs','operations',...B23_STORES,...NATIVE_STORES];
// Synchronous metadata only: usable inside the versionchange transaction so
// malformed historical databases abort before their version is advanced.
function validateMetadata(db,tx){
  if(REQUIRED_STORES.some(name=>!db.objectStoreNames.contains(name)))throw Error('invalid-schema');
  for(const name of REQUIRED_STORES){const store=tx.objectStore(name);if(store.keyPath!=='key'||store.autoIncrement!==false)throw Error('invalid-schema');}
  if(!scopeIndexMatches(tx.objectStore('refs'),'scopeKey')||!scopeIndexMatches(tx.objectStore('b23_operations'),'payload.scopeKey'))throw Error('invalid-schema');
}
/** Check an existing schema without reading, rewriting, or repairing user rows. */
export function validateDatabase(db){
  return new Promise((resolve,reject)=>{
    let tx;
    const invalid=()=>reject(Error('invalid-schema'));
    try{
      if(db.version!==DATABASE_VERSION)throw Error('invalid-schema');
      tx=db.transaction(REQUIRED_STORES,'readonly');
      tx.onabort=invalid;tx.onerror=()=>{};tx.oncomplete=resolve;
      validateMetadata(db,tx);
    }catch{if(tx){try{tx.abort();}catch{}}invalid();}
  });
}
export function upgradeDatabase(db, transaction, oldVersion) {
  if (oldVersion < 1) {
    const refs=db.createObjectStore('refs',{keyPath:'key'});refs.createIndex('scopeKey','scopeKey',{unique:false});
    db.createObjectStore('operations',{keyPath:'key'});
  }
  if (oldVersion < 2) {
    // Missing/malformed B1 structures abort rather than silently recreate user data.
    const refs=transaction.objectStore('refs'),ops=transaction.objectStore('operations');
    if(refs.keyPath!=='key'||ops.keyPath!=='key'||!scopeIndexMatches(refs,'scopeKey'))throw Error('invalid-b1-schema');
    for(const name of B23_STORES){const store=db.createObjectStore(name,{keyPath:'key'});if(name==='b23_operations')store.createIndex('scopeKey','payload.scopeKey',{unique:false});}
  }
  if (oldVersion < 3) {
    for (const name of ['refs', 'operations', ...B23_STORES]) {
      if (transaction.objectStore(name).keyPath !== 'key') throw Error('invalid-v2-schema');
    }
    if (!scopeIndexMatches(transaction.objectStore('refs'),'scopeKey') ||
        !scopeIndexMatches(transaction.objectStore('b23_operations'),'payload.scopeKey')) throw Error('invalid-v2-schema');
    for (const name of NATIVE_STORES) db.createObjectStore(name, {keyPath: 'key'});
  }
  // v4 fences pre-v2-continuation writers through IndexedDB VersionError.
  // The same stores/rows are retained; validate before committing any upgrade.
  validateMetadata(db,transaction);
  // Provenance is written only by the atomic creation transaction, never by
  // observing missing scope data or upgrading an existing database.
  if(oldVersion===0)transaction.objectStore('b23_views').put(freshInstallationRecord());
}

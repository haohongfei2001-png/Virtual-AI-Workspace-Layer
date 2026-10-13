/** Upgrade the SAME B1 database. No second database, destructive reset or native data. */
export const DATABASE_VERSION = 3;
export const NATIVE_STORES = ['native_states', 'native_operations'];
export const B23_STORES = ['b23_states','b23_operations','b23_checkpoints','b23_views'];
function scopeIndexMatches(store,keyPath){
  if(!store.indexNames.contains('scopeKey'))return false;
  const index=store.index('scopeKey');
  return index.keyPath===keyPath&&index.unique===false&&index.multiEntry===false;
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
}

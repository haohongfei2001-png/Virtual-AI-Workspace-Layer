/** Upgrade the SAME B1 database. No second database, destructive reset or native data. */
export const DATABASE_VERSION = 2;
export const B23_STORES = ['b23_states','b23_operations','b23_checkpoints','b23_views'];
export function upgradeDatabase(db, transaction, oldVersion) {
  if (oldVersion < 1) {
    const refs=db.createObjectStore('refs',{keyPath:'key'});refs.createIndex('scopeKey','scopeKey',{unique:false});
    db.createObjectStore('operations',{keyPath:'key'});
  }
  if (oldVersion < 2) {
    // Missing/malformed B1 structures abort rather than silently recreate user data.
    const refs=transaction.objectStore('refs'),ops=transaction.objectStore('operations');
    if(refs.keyPath!=='key'||ops.keyPath!=='key'||!refs.indexNames.contains('scopeKey'))throw Error('invalid-b1-schema');
    for(const name of B23_STORES){const store=db.createObjectStore(name,{keyPath:'key'});if(name==='b23_operations')store.createIndex('scopeKey','payload.scopeKey',{unique:false});}
  }
}

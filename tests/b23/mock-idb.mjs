/** TEST DOUBLE ONLY. In-memory, serial transactions. Never shipped in the extension.
 * Exercises request/abort/control paths; NOT evidence of browser IDB durability,
 * actual scheduling, disk failures, process restart, or native MV3 lifecycle.
 */
const copy=x=>x===undefined?undefined:structuredClone(x);
const names=map=>({contains:k=>map.has(k),[Symbol.iterator]:()=>map.keys()});
const error=name=>Object.assign(new Error(name),{name});
class Transaction {
  constructor(db,stores,mode,{upgrade=false,onDone=null}={}){
    this.db=db;this.names=Array.isArray(stores)?stores:[stores];this.mode=mode;this.upgrade=upgrade;this.done=false;this.tasks=[];this.onDone=onDone;
    if(upgrade){this.local=db.meta.stores;this.started=true;queueMicrotask(()=>this.pump());}
    else {db.meta.queue.push(this);db.factory.start(db.meta);}
  }
  objectStore(name){if(!this.names.includes(name)&&!this.upgrade)throw error('NotFoundError');return new Store(this,name);}
  enqueue(action){if(this.done)throw error('TransactionInactiveError');const req={result:undefined,error:null};this.tasks.push({req,action});if(this.started&&!this.running)queueMicrotask(()=>this.pump());return req;}
  pump(){if(!this.started||this.running||this.done)return;const task=this.tasks.shift();
    if(!task){if(!this.finishing){this.finishing=true;queueMicrotask(()=>{this.finishing=false;if(this.tasks.length)this.pump();else this.complete();});}return;}
    this.running=true;
    try{task.req.result=task.action();task.req.onsuccess?.({target:task.req});}
    catch(e){task.req.error=e;task.req.onerror?.({target:task.req});this.error=e;this.abort();}
    this.running=false;queueMicrotask(()=>this.pump());
  }
  complete(){if(this.done)return;this.done=true;if(!this.upgrade&&this.mode!=='readonly')for(const name of this.names)this.db.meta.stores.set(name,this.local.get(name));this.release();this.oncomplete?.({target:this});this.onDone?.(true);}
  abort(){if(this.done)throw error('InvalidStateError');this.done=true;this.tasks=[];this.release();queueMicrotask(()=>{this.onabort?.({target:this});this.onDone?.(false);});}
  release(){if(!this.upgrade){const q=this.db.meta.queue;if(q[0]===this)q.shift();else {const i=q.indexOf(this);if(i>=0)q.splice(i,1);}this.db.factory.start(this.db.meta);}}
}
class Store {
  constructor(tx,name){this.tx=tx;this.name=name;}
  get data(){const d=(this.tx.local??this.tx.db.meta.stores).get(this.name);if(!d)throw error('NotFoundError');return d;}
  get keyPath(){return this.data.keyPath;}get indexNames(){return names(this.data.indexes);}
  createIndex(name,keyPath){this.data.indexes.set(name,keyPath);}
  get(key){return this.tx.enqueue(()=>copy(this.data.rows.get(String(key))));}
  put(value){return this.write(value,false);}add(value){return this.write(value,true);}
  write(value,unique){const v=copy(value);return this.tx.enqueue(()=>{if(this.tx.mode==='readonly')throw error('ReadOnlyError');
    if(this.tx.db.factory.failNextPut){this.tx.db.factory.failNextPut=false;throw error('QuotaExceededError');}
    const k=v[this.keyPath];if(k===undefined)throw error('DataError');if(unique&&this.data.rows.has(String(k)))throw error('ConstraintError');this.data.rows.set(String(k),v);return k;});}
  delete(key){return this.tx.enqueue(()=>this.data.rows.delete(String(key)));}
  count(){return this.tx.enqueue(()=>this.data.rows.size);}
  index(name){const field=this.data.indexes.get(name);if(!field)throw error('NotFoundError');const indexKey=row=>field.split('.').reduce((v,k)=>v?.[k],row);return {openCursor:range=>this.cursor(row=>indexKey(row)===(range?.value??range),indexKey)};}
  openCursor(){return this.cursor(()=>true);}
  cursor(filter,keyOf=row=>row[this.keyPath]){
    const compare=(a,b)=>a<b?-1:a>b?1:0;let rows,position=0,req;
    const next=()=>{rows??=[...this.data.rows.values()].filter(filter).sort((a,b)=>compare(keyOf(a),keyOf(b))||compare(a[this.keyPath],b[this.keyPath]));if(position>=rows.length)return null;
      const row=rows[position++];let advanced=false;
      const advance=()=>{if(this.tx.done)throw error('TransactionInactiveError');if(advanced)throw error('InvalidStateError');advanced=true;this.tx.tasks.push({req,action:next});};
      return {key:keyOf(row),primaryKey:row[this.keyPath],value:copy(row),continue:advance,
        continuePrimaryKey:(key,primaryKey)=>{if(compare(key,keyOf(row))<0||compare(key,keyOf(row))===0&&compare(primaryKey,row[this.keyPath])<=0)throw error('DataError');while(position<rows.length&&(compare(keyOf(rows[position]),key)<0||compare(keyOf(rows[position]),key)===0&&compare(rows[position][this.keyPath],primaryKey)<0))position++;advance();}};
    };req=this.tx.enqueue(next);return req;
  }
}
class Database {
  constructor(factory,meta){this.factory=factory;this.meta=meta;this.closed=false;meta.handles.add(this);}
  get objectStoreNames(){return names(this.meta.stores);}get version(){return this.meta.version;}get name(){return this.meta.name;}
  createObjectStore(name,{keyPath}={}){if(this.meta.stores.has(name))throw error('ConstraintError');this.meta.stores.set(name,{keyPath,indexes:new Map(),rows:new Map()});return new Store(this.upgradeTx,name);}
  transaction(stores,mode='readonly'){if(this.closed)throw error('InvalidStateError');for(const n of typeof stores==='string'?[stores]:stores)if(!this.meta.stores.has(n))throw error('NotFoundError');return new Transaction(this,stores,mode);}
  close(){this.closed=true;this.meta.handles.delete(this);for(const retry of this.meta.waiting.splice(0))queueMicrotask(retry);}
}
export class MockIDBFactory {
  constructor(){this.databasesMap=new Map();this.failNextPut=false;}
  start(meta){const tx=meta.queue[0];if(!tx||tx.started)return;tx.started=true;tx.local=new Map([...meta.stores].map(([n,d])=>[n,{keyPath:d.keyPath,indexes:new Map(d.indexes),rows:new Map([...d.rows].map(([k,v])=>[k,copy(v)]))}]));queueMicrotask(()=>tx.pump());}
  open(name,version){const req={result:null,error:null,transaction:null};let notified=false;
    const attempt=()=>{
      let meta=this.databasesMap.get(name);if(!meta){meta={name,version:0,stores:new Map(),handles:new Set(),queue:[],waiting:[]};this.databasesMap.set(name,meta);}const target=version??(meta.version||1);
      if(target<meta.version){req.error=error('VersionError');req.onerror?.({target:req});return;}
      if(target>meta.version&&meta.handles.size){for(const handle of [...meta.handles])handle.onversionchange?.({oldVersion:meta.version,newVersion:target});
        if(meta.handles.size){if(!notified){notified=true;req.onblocked?.({target:req});}meta.waiting.push(attempt);return;}}
      const db=new Database(this,meta);req.result=db;
      if(target>meta.version){const oldVersion=meta.version,oldStores=copy(meta.stores);const tx=new Transaction(db,[], 'versionchange',{upgrade:true,onDone:ok=>{if(ok){meta.version=target;req.onsuccess?.({target:req});}else{meta.stores=oldStores;db.close();req.error=error('AbortError');req.onerror?.({target:req});}}});db.upgradeTx=tx;req.transaction=tx;
        try{req.onupgradeneeded?.({target:req,oldVersion,newVersion:target});}catch{tx.abort();}
      }else req.onsuccess?.({target:req});
    };queueMicrotask(attempt);return req;
  }
  deleteDatabase(name){const req={};queueMicrotask(()=>{this.databasesMap.delete(name);req.onsuccess?.({target:req});});return req;}
}

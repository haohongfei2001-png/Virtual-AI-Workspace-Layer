import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {buildSharedRefDirectory,sharedRefBucket} from '../../src/data/shared-ref-directory.mjs';
import {manifest_PARTITION_FORMAT,manifest_partitionRecord,manifest_partitionKey} from '../../src/data/partition-manifest.mjs';
const scope=scopeOf('A'),scopeKey=emptyState(scope).scopeKey,base=new URL('../../src/data/',import.meta.url);
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const imports=(source,origin)=>source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?`from '${new URL(path,origin).href}'`:all);
let serial=0;
async function measured(old=false){
 let reader=await readFile(new URL('shared-directory-reader.mjs',base),'utf8');
 assert(reader.includes('sharedRefBucket,sharedRefDirectoryKey'));
 reader=reader.replace('sharedRefBucket,sharedRefDirectoryKey','sharedRefBucket as originalBucket,sharedRefDirectoryKey');
 reader+='\nlet routingCalls=0;const sharedRefBucket=ref=>{routingCalls++;return originalBucket(ref);};export const routingCount=()=>routingCalls;\n// '+serial++;
 const readerURL=moduleURL(imports(reader,base)),readerModule=await import(readerURL);
 let source=old?execFileSync('git',['show','388fca4be0337d304f5bc830b37169cf2f5d04ab:src/data/shared-directory-retention.mjs'],{encoding:'utf8'}):await readFile(new URL('shared-directory-retention.mjs',base),'utf8');
 source=source.replace("'./shared-directory-reader.mjs'",JSON.stringify(readerURL));
 return {...await import(moduleURL(imports(source,base)+'\n// '+serial++)),routingCount:readerModule.routingCount};
}
function fixture(){
 const other=Array.from({length:5000},(_,i)=>'same_bucket_'+i).find(id=>sharedRefBucket(id)===sharedRefBucket('R'));assert(other);
 const s=emptyState(scope),build=revision=>buildSharedRefDirectory({format:manifest_PARTITION_FORMAT,generation:'retention_probe',scopeKey,revision,channel:s.channel,sources:s.sources,workspaces:s.workspaces,preferences:s.preferences,refVersions:{R:revision,[other]:1},humanRefs:[],units:1,changes:[]},scope);
 return {old:build(1),prior:build(2),next:build(3),other};
}
async function exercise(api,fault=null){
 const f=fixture(),factory=new MockIDBFactory(),db=await new Promise((resolve,reject)=>{const q=factory.open('routing_'+serial++,1);q.onupgradeneeded=()=>{q.result.createObjectStore('b23_states',{keyPath:'key'});q.result.createObjectStore('b23_checkpoints',{keyPath:'key'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 const piece=(id,v)=>manifest_partitionKey(scopeKey,id,v,'retention_probe');
 const seed=[...f.old.records,...f.prior.records,...f.next.records,...[1,2,3].map(v=>({key:piece('R',v),value:v})),{key:piece(f.other,1),value:'retained'}];
 if(fault){const target=f[fault.startsWith('prior')?'prior':'next'].records[0].key,index=seed.findIndex(r=>r.key===target);if(fault.endsWith('missing'))seed.splice(index,1);else seed[index]={...seed[index],checksum:'0'.repeat(64)};}
 const snapshot=()=>new Promise((resolve,reject)=>{const tx=db.transaction('b23_states'),rows=[],q=tx.objectStore('b23_states').openCursor();q.onsuccess=()=>{const c=q.result;if(c){rows.push(c.value);c.continue();}};tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error);});
 try{
 await new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states','b23_checkpoints'],'readwrite');for(const row of seed)tx.objectStore('b23_states').put(row);tx.objectStore('b23_checkpoints').put(manifest_partitionRecord(scopeKey,f.old.root));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const before=await snapshot(),deleted=[];let error;
 const committed=await new Promise(resolve=>{const tx=db.transaction(['b23_states','b23_checkpoints'],'readwrite'),objectStore=tx.objectStore.bind(tx);const wrapped={objectStore(name){const store=objectStore(name);return {get:key=>store.get(key),delete:key=>{deleted.push(key);return store.delete(key);}};}};tx.oncomplete=()=>resolve(true);tx.onabort=()=>resolve(false);api.prepareSharedDirectoryRetention(wrapped,scope,f.prior.root,()=>{},failure=>{error=failure;tx.abort();})(f.next.root);});
 return {committed,error,deleted,before,after:await snapshot(),routes:api.routingCount(),expectedDeletes:[piece('R',1),f.old.records[0].key],untouched:piece(f.other,1)};
 }finally{db.close();}
}
test('known-bucket retention preserves exact deletion set with no lookup rerouting',async t=>{
 const baseline=await exercise(await measured(true)),current=await exercise(await measured(process.env.SHARED_RETENTION_BASELINE==='1'));
 assert(baseline.committed&&current.committed);assert.deepEqual(baseline.deleted.sort(),baseline.expectedDeletes.sort());assert.deepEqual(current.deleted.sort(),baseline.deleted);assert.deepEqual(current.after,baseline.after);assert(current.after.some(r=>r.key===current.untouched));
 t.diagnostic(JSON.stringify({oldRoutingCalls:baseline.routes,currentRoutingCalls:current.routes,deleted:current.deleted.length}));assert.equal(baseline.routes,4);assert.equal(current.routes,0,'already verified same bucket must not reroute members twice');
});
for(const fault of ['prior-missing','prior-corrupt','next-missing','next-corrupt'])test('fresh '+fault+' aborts retention transaction without deletion',async()=>{const result=await exercise(await measured(),fault);assert.equal(result.committed,false);assert(result.error);assert.deepEqual(result.after,result.before);});

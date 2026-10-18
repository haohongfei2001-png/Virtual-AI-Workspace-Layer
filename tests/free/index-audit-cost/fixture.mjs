import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../../b23/mock-idb.mjs';
import {harness,A,B} from '../../b23/contracts.mjs';
import {emptyNativeFacts} from '../../../src/data/native-facts.mjs';
import {nativeRecord} from '../../../src/data/native-partitions.mjs';
export {A,B,nativeRecord};
export const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
export const projectId='g-p-00000000000000000000000000000001';
export const refId=index=>'60000000-0000-4000-8000-'+index.toString(16).padStart(12,'0');
export const scopeKey=emptyNativeFacts(A).scopeKey;
export const now='2026-10-13T00:00:00Z';
const variants=new Map();
export async function variant(name){
 if(variants.has(name))return variants.get(name);
 const directory=mkdtempSync(join(tmpdir(),'vaiwl-page-'+name+'-'));
 cpSync(join(root,'src'),join(directory,'src'),{recursive:true});
 const patch=join(root,'tests/free/index-audit-cost/integration.patch');
 const accepts=reverse=>{try{execFileSync('git',['apply','--check',...(reverse?['--reverse']:[]),patch],{cwd:directory,stdio:'pipe'});return true;}catch{return false;}};
 const forward=accepts(false),reverse=accepts(true);
 assert(forward!==reverse,'owner source must match either side of the exact integration patch');
 if(name==='candidate'&&forward)execFileSync('git',['apply',patch],{cwd:directory});
 if(name==='baseline'&&reverse)execFileSync('git',['apply','--reverse',patch],{cwd:directory});
 const path=join(directory,'src/data/native-version-index.mjs');let source=readFileSync(path,'utf8');
 source=source.replace('export function materializeNativeVersionIndex(root,scope,records){','export function materializeNativeVersionIndex(root,scope,records){\n indexAuditCost.materializeCalls++;indexAuditCost.materializedRows+=records.reduce((sum,row)=>sum+Object.keys(row.payload.versions).length,0);');
 source+='\nexport const indexAuditCost={materializeCalls:0,materializedRows:0};\n';writeFileSync(path,source);
 const api=await import(pathToFileURL(join(directory,'src/data/native-repository.mjs'))),index=await import(pathToFileURL(path));
 const selector=await import(pathToFileURL(join(directory,'src/data/native-index-page.mjs')));
 const value={NativeRepository:api.NativeRepository,index,selectNativeIndexPage:selector.selectNativeIndexPage,cost:index.indexAuditCost,directory};variants.set(name,value);return value;
}
export function cleanup(){for(const value of variants.values())rmSync(value.directory,{recursive:true,force:true});variants.clear();}
export async function setup(name='candidate',count=108){
 const api=await variant(name),h=await harness(new MockIDBFactory(),{seed:false});
 h.native=new api.NativeRepository({baseRepository:h.base,observationGate:()=>({channel:'synthetic',sourceId:'audit_fixture',generation:'one'}),clock:()=>now});
 const refs=Array.from({length:count},(_,i)=>({id:refId(i),nativeTitle:'原生 title '+i,nativeUrl:'https://fixture.test/c/'+refId(i),availability:'available'}));
 const request={operationId:'seed',expectedRevision:0,batch:{scopeKey,sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[{id:projectId,nativeName:'Project',nativeUrl:'https://fixture.test/project/'+projectId,availability:'available'}],refs,membership:refs.map(row=>({id:row.id,state:'PROJECT',projectId})),inventory:{projects:'complete',conversations:'complete',cursor:null}}};
 assert.equal((await h.native.apply(A,request)).ok,true);assert.equal((await h.native.migrateVersionIndex(A,{operationId:'migrate',expectedRevision:1})).ok,true);
 api.cost.materializeCalls=0;api.cost.materializedRows=0;const db=await h.base.open(),original=db.transaction.bind(db),reads=[];
 db.transaction=(...args)=>{const tx=original(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name),get=store.get.bind(store);store.get=key=>{reads.push({store:name,key,mode:args[1]??'readonly'});return get(key);};return store;};return tx;};
 return {...h,api,db,reads,request,restore(){db.transaction=original;},close(){db.transaction=original;h.close();}};
}
export async function readRow(h,key,store='native_states'){return new Promise((resolve,reject)=>{const tx=h.db.transaction(store),request=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);});}
export async function writeRow(h,key,change){return new Promise((resolve,reject)=>{const tx=h.db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),request=store.get(key);request.onsuccess=()=>{const row=change(request.result);if(row===null)store.delete(key);else store.put(row);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
export async function pages(h,{limit=25,revision=2}={}){const out=[];let offset=0;for(;;){const page=await h.native.page(A,{offset,limit,revision});out.push(page);if(page.nextOffset===page.total)break;offset=page.nextOffset;}return out;}

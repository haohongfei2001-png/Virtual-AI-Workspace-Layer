/** Executed ONLY at a real loopback URL. No set_content, mock DB or fake origin. */
import { runRepositoryCases } from './contracts.mjs';
import { runNativeIncrementalCases } from './native-incremental-cases.mjs';
import { ScopeRepository } from '../../src/b1/scope-repository.mjs';
const report={level:'NATIVE_BROWSER_INDEXEDDB_SYNTHETIC',origin:location.origin,startedAt:new Date().toISOString(),results:[]};
async function migration(malformed){
 const name='native_migration_'+crypto.randomUUID().replaceAll('-','');
 const old=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{const refs=r.result.createObjectStore('refs',{keyPath:'key'});if(!malformed)refs.createIndex('scopeKey','scopeKey');r.result.createObjectStore('operations',{keyPath:'key'});refs.put({key:'sentinel',revision:7});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});old.close();
 const base=new ScopeRepository({indexedDB,databaseName:name});
 if(!malformed){const db=await base.open();if(db.version!==2)throw Error('migration-version');const r=db.transaction('refs').objectStore('refs').get('sentinel');const kept=await new Promise(resolve=>{r.onsuccess=()=>resolve(r.result)});if(kept.revision!==7)throw Error('migration-lost-row');base.close();}
 else{let rejected=false;try{await base.open();}catch{rejected=true;}if(!rejected)throw Error('bad-schema-accepted');const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(db.version!==1||db.objectStoreNames.contains('b23_states'))throw Error('failed-upgrade-not-atomic');db.close();}
}
try{
 if(location.protocol!=='http:'||location.hostname!=='127.0.0.1')throw Error('real-loopback-origin-required');
 report.results=await runRepositoryCases(indexedDB);
 report.results.push(...await runNativeIncrementalCases(indexedDB));
 for(const malformed of [false,true]){const name=malformed?'NATIVE-invalid-v1-upgrade-rollback':'NATIVE-v1-upgrade-preserves-ref';try{await migration(malformed);report.results.push({name,status:'PASS'});}catch(e){report.results.push({name,status:'FAIL',error:e.message});}}
}catch(e){report.error=e.message;}
report.endedAt=new Date().toISOString();report.pass=report.results.filter(r=>r.status==='PASS').length;report.fail=report.results.filter(r=>r.status==='FAIL').length+(report.error?1:0);
document.getElementById('result').textContent=JSON.stringify(report,null,2);document.documentElement.dataset.b23NativeDone='true';

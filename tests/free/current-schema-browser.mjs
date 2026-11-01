/** Actual v3 upgrade and current v4 metadata rejection/handle cleanup; no native account data. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const files=['src/data/schema.mjs','src/b1/scope-repository.mjs','src/b1/identity.mjs','tests/free/current-schema-browser.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const before=await hashes(),receipt=process.argv[2]??'/private/tmp/free-current-schema-browser.json',report={evidence:'REAL_HEADLESS_CHROME_INDEXEDDB_V3_TO_V4_AND_CURRENT_SCHEMA_METADATA',realChatGPT:'NOT_RUN',mv3:'NOT_RUN',sourceHashes:before,results:[],pageErrors:[]};
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const save=()=>writeFile(receipt,JSON.stringify(report,null,2)+'\n');
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});report.browser=browser.version();const page=await browser.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 report.results=await page.evaluate(async()=>{
  const {ScopeRepository}=await import('/src/b1/scope-repository.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{normalizedScope}=await import('/src/b1/identity.mjs');
  const stores=['refs','operations','b23_states','b23_operations','b23_checkpoints','b23_views','native_states','native_operations'],scope=scopeOf('A'),scopeKey=normalizedScope(scope).key,results=[];
  const dump=db=>new Promise((resolve,reject)=>{const existing=[...db.objectStoreNames],tx=db.transaction(existing),out={};for(const name of existing){out[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const c=q.result;if(c){out[name].push({key:c.key,value:c.value});c.continue();}};}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});
  const modes=[{name:'valid',store:null,mode:'valid'},...['refs','b23_operations'].flatMap(store=>['wrong-keyPath','unique','multiEntry','array-keyPath'].map(mode=>({name:store+':'+mode,store,mode}))),...['native_states','native_operations'].flatMap(store=>['missing-store','wrong-store-keyPath'].map(mode=>({name:store+':'+mode,store,mode})))];
  for(const scenario of [3,4].flatMap(version=>modes.map(mode=>({...mode,version,name:'v'+version+':'+mode.name})))){
   const name='schema_index_'+crypto.randomUUID().replaceAll('-',''),base=new ScopeRepository({indexedDB,databaseName:name});let raw;
   const result={name:scenario.name,inputVersion:scenario.version,status:'FAIL'};
   try{
    const old=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,scenario.version);q.onupgradeneeded=()=>{const db=q.result;for(const storeName of stores){if(storeName===scenario.store&&scenario.mode==='missing-store')continue;const wrongStore=storeName===scenario.store&&scenario.mode==='wrong-store-keyPath';const store=db.createObjectStore(storeName,{keyPath:wrongStore?'otherKey':'key'});if(storeName==='refs'||storeName==='b23_operations'){
     const expected=storeName==='refs'?'scopeKey':'payload.scopeKey',mode=storeName===scenario.store?scenario.mode:'valid';
     store.createIndex('scopeKey',mode==='wrong-keyPath'?'wrongField':mode==='array-keyPath'?[expected]:expected,{unique:mode==='unique',multiEntry:mode==='multiEntry'});
    }
    // Two rows in distinct scopes avoid accidentally testing unique-index creation failures.
    for(let i=0;i<2;i++){const rowScope=i?normalizedScope(scopeOf('B')).key:scopeKey,key=storeName==='refs'?JSON.stringify([rowScope,'T0']):'sentinel_'+i;
     store.put(storeName==='refs'?{key,scopeKey:rowScope,conversationId:'T0',nativeUrl:'https://fixture.test/c/T0',projectId:null,revision:1}:{key,...(wrongStore?{otherKey:key}:{}),payload:{scopeKey:rowScope,human:'保留 '+storeName+' '+i,revision:7}});
    }
   }};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    const expected=await dump(old);old.close();let opened=false,reason=null;
    try{await base.open();opened=true;}catch(error){reason=error.name+': '+error.message;}
    if(opened&&scenario.store==='refs'&&scenario.mode==='wrong-keyPath')result.leak={getPresent:!!await base.get(scope,'T0'),listedCount:(await base.list(scope)).length};
    if(opened)base.close();raw=await new Promise((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    const actual=await dump(raw),newStores=['native_states','native_operations'].filter(store=>raw.objectStoreNames.contains(store)),sameRows=JSON.stringify(actual)===JSON.stringify(expected);
    Object.assign(result,{opened,reason,version:raw.version,allExistingStoresUnchanged:sameRows,newStores});
    if(scenario.mode==='valid'){assertion(opened&&raw.version===4&&sameRows&&newStores.length===2,'valid v3 upgrade or current v4 must preserve all rows');}
    else if(scenario.version===3)assertion(!opened&&reason?.startsWith('AbortError:')&&raw.version===3&&sameRows,'malformed v3 upgrade must abort and retain version and rows');
    else assertion(!opened&&reason==='Error: invalid-schema'&&raw.version===4&&sameRows,'malformed current v4 must reject without mutation');
    raw.close();raw=null;
    // Do not call base.close() for rejected opens: deletion must prove the failed open itself closed its handle.
    await new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase(name);q.onsuccess=resolve;q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('rejected-open-leaked-database-handle'));});result.noLeakedHandle=true;
    result.status='PASS';
   }catch(error){result.error=error.stack;}finally{base.close();raw?.close();}
   results.push(result);
  }
  return results;
  function assertion(value,message){if(!value)throw Error(message);}
 });
 report.sourceChangedDuringRun=JSON.stringify(await hashes())!==JSON.stringify(before);report.pass=report.results.filter(row=>row.status==='PASS').length;report.fail=report.results.length-report.pass;await save();console.log(JSON.stringify(report.results));assert.equal(report.sourceChangedDuringRun,false);assert.deepEqual(report.pageErrors,[]);assert.equal(report.fail,0,'schema index metadata rejection failures');
}catch(error){report.failure=error.stack;await save();throw error;}finally{await save();await browser?.close();await new Promise(resolve=>server.close(resolve));}

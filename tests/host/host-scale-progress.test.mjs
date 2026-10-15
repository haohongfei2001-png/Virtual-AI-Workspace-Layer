import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readHostScaleProgress,hostScaleFailureProgress} from './fixtures/host-scale-progress.mjs';
const snapshot=()=>({root:{format:'vaiwl-native-version-index-v1',revision:14,refs:{aa:{count:234},bb:{count:11}},projects:{ab:{count:4}},sources:{secretToken:{sourceRevision:23,revoked:false},other:{sourceRevision:4,revoked:true}}},continuationWitness:true});
test('root inventory and source revisions stay numeric and do not claim acceptance',async()=>{
 const result=await readHostScaleProgress({},async()=>snapshot());assert.equal(result.inventoryRefs,245);assert.equal(result.inventoryProjects,4);assert.equal(result.sourceRevisionMin,4);assert.equal(result.sourceRevisionMax,23);assert.equal(result.revokedSources,1);assert.equal(result.acceptance,'NOT_ESTABLISHED');assert.equal(result.queueState,'NOT_READ');assert.equal(result.consistency,'SINGLE_READONLY_TRANSACTION_NOT_INTERVAL_STABILITY');assert(!JSON.stringify(result).includes('secretToken'));
});
test('partitioned and facts inventory counts keys, not descriptor counts',async()=>{for(const format of ['vaiwl-native-partitions-v1','vaiwl-native-facts-v2']){const value=snapshot();value.root.format=format;value.root.refs={one:2,two:3};assert.equal((await readHostScaleProgress({},async()=>value)).inventoryRefs,2);}});
test('absent, corrupt, limit and deadline never produce accepted inventory',async()=>{
 assert.equal((await readHostScaleProgress({},async()=>null)).status,'INDEX_ABSENT');
 for(const error of ['root-marker-conflict','corrupt-native-record','secret-token']){const result=await readHostScaleProgress({},async()=>{throw Error(error);});assert.equal(result.status,'DIAGNOSTIC_UNAVAILABLE');assert(!JSON.stringify(result).includes(error));}
 assert.equal((await readHostScaleProgress({},async()=>{throw Error('key-scan-limit');})).status,'DIAGNOSTIC_KEY_LIMIT');
 assert.equal((await readHostScaleProgress({timeout:5},()=>new Promise(()=>{}))).status,'DIAGNOSTIC_TIMEOUT');
 assert.equal((await readHostScaleProgress({keyLimit:513})).status,'INVALID_DIAGNOSTIC_OPTIONS');
});
const frame=(url='chrome-extension://test/workspace.html')=>({isDetached:()=>false,url:()=>url,evaluate:async()=>({status:'POINT_IN_TIME_ROOT_SNAPSHOT'})});
const page=frames=>({isClosed:()=>false,frames:()=>frames});
test('only one current exact extension workspace can be read',async()=>{let called=0;const f=frame();f.evaluate=async()=>{called++;return {};};for(const list of [[],[f,f],[frame('chrome-extension://other/workspace.html')]])assert.equal((await hostScaleFailureProgress(page(list),'test')).status,'NO_UNIQUE_CURRENT_FRAME');assert.equal(called,0);await hostScaleFailureProgress(page([f]),'test');assert.equal(called,1);});
test('frame replacement or hung evaluate cannot hide failure',async()=>{let list;const f=frame();list=[f];f.evaluate=async()=>{list=[frame()];return {};};assert.equal((await hostScaleFailureProgress({isClosed:()=>false,frames:()=>list},'test')).status,'FRAME_CHANGED');f.evaluate=()=>new Promise(()=>{});assert.equal((await hostScaleFailureProgress(page([f]),'test',{timeout:5})).status,'DIAGNOSTIC_UNAVAILABLE');});
test('browser adapter enforces root+marker checks, no writes or full inventory reads',async()=>{const source=await readFile(new URL('./fixtures/host-scale-progress.mjs',import.meta.url),'utf8');assert.match(source,/repository\.verifiedRoot\(row,scope\)/);assert.match(source,/nativeUnpack\(request.result\)/);assert.match(source,/marker.revision!==root.revision/);assert.match(source,/database.transaction\(\['native_states','native_operations'\],'readonly'\)/);assert.match(source,/request.transaction.abort\(\)/);assert.match(source,/item.continue\('\["\\\\'\)/);assert.doesNotMatch(source,/\.put\(|store\.delete\(|\.count\(|repository\.page\(|repository\.read\(/);});
test('runner failure diagnostics remain outside the unchanged startup deadline',async()=>{const source=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');assert.match(source,/timeout:30000/);assert.match(source,/catch\(error\)\{const \{hostScaleFailureProgress\}/);assert.match(source,/loadedExtensionId=id/);assert.match(source,/report.nativeIndexProgress=await hostScaleFailureProgress\(activePage,loadedExtensionId\)/);});
const busy=ms=>{const until=performance.now()+ms;while(performance.now()<until){}};
test('synchronous reader exceeding deadline cannot return successful inventory',async()=>{
 const result=await readHostScaleProgress({timeout:5},()=>{busy(25);return snapshot();});
 assert.equal(result.status,'DIAGNOSTIC_TIMEOUT');assert.equal(result.inventoryRefs,undefined);
});
test('synchronous frame evaluation exceeding outer deadline cannot return success',async()=>{
 const f=frame();f.evaluate=()=>{busy(25);return {status:'POINT_IN_TIME_ROOT_SNAPSHOT'};};
 assert.equal((await hostScaleFailureProgress(page([f]),'test',{timeout:5})).status,'DIAGNOSTIC_UNAVAILABLE');
});

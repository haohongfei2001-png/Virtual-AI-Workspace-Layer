import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 const sourceHashes={};for(const file of ['src/data/native-partitions.mjs','src/data/native-repository.mjs'])sourceHashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/tests/free/native-gc-browser-cases.mjs',async route=>route.fulfill({status:200,contentType:'text/javascript',body:await readFile(new URL('./native-gc-browser-cases.mjs',import.meta.url),'utf8')}));await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 const result=await page.evaluate(async()=>{const {runNativeGCRecovery}=await import('/tests/free/native-gc-browser-cases.mjs');return runNativeGCRecovery(indexedDB);});assert.deepEqual(errors,[]);
 for(const [file,hash] of Object.entries(sourceHashes))assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),hash,'source changed during validation');
 const evidence={evidence:'HEADLESS_SYNTHETIC_REAL_IDB_NATIVE_GC',browser:browser.version(),result,sourceHashes,errors,pass:1,fail:0};await writeFile('/private/tmp/free-native-gc-browser.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

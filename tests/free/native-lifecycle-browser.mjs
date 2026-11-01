import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
async function paths(dir){const rows=await readdir(dir,{withFileTypes:true}),out=[];for(const row of rows){const path=dir+'/'+row.name;if(row.isDirectory())out.push(...await paths(path));else if(row.name.endsWith('.mjs')&&!/ \d+\.mjs$/.test(row.name))out.push(path);}return out;}
const fixtureModules=['tests/free/native-lifecycle-contracts.mjs','tests/b23/contracts.mjs','tests/b23/b5-cases.mjs','tests/b23/c34-cases.mjs'];
const files=[...await paths('src'),...fixtureModules,'tests/free/native-lifecycle-contracts.mjs','tests/free/native-lifecycle-browser.mjs'],hashes=async()=>Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')]))),sourceHashes=await hashes();
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{})});
 const page=await browser.newPage(),origin=`http://127.0.0.1:${server.address().port}`;let blocked=0;
 await page.route('**/*',async route=>{const url=route.request().url();if(!url.startsWith(origin+'/')){blocked++;return route.abort();}const path=url.slice(origin.length+1);if(fixtureModules.includes(path))return route.fulfill({status:200,contentType:'text/javascript',body:await readFile(path,'utf8')});return route.continue();});
 await page.goto(origin+'/hf/A/c/T0?mode=native');
 const started=performance.now(),results=await page.evaluate(async()=>{const {runLifecycleCases}=await import('/tests/free/native-lifecycle-contracts.mjs');return runLifecycleCases(indexedDB);}),elapsedMs=performance.now()-started;
 assert.deepEqual(await hashes(),sourceHashes);
 const report={status:results.every(row=>row.status==='PASS')?'PASS_REAL_IDB_CONSUMER_ONLY':'FAIL',evidence:'ISOLATED_HEADLESS_REAL_IDB_NOT_MV3_OR_LIVE_SOURCE',browser:browser.version(),elapsedMs,blockedExternalRequests:blocked,sourceHashes,results};
 await writeFile(process.argv[2]??'/private/tmp/vaiwl-native-lifecycle-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));assert(results.every(row=>row.status==='PASS'));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

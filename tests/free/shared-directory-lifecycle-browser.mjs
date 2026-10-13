/** Headless real IndexedDB runner. Contract preparation alone is NOT browser evidence. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
async function sources(path){const entries=await readdir(path,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?sources(`${path}/${e.name}`):e.name.endsWith('.mjs')?[`${path}/${e.name}`]:[]))).flat();}
const contracts=['shared-directory-lifecycle-contracts.mjs','shared-directory-batch-contracts.mjs','shared-directory-retention-contracts.mjs'];
const files=[...await sources('src'),...await sources('simulator'),...contracts.map(f=>'tests/free/'+f),'tests/free/shared-directory-lifecycle-browser.mjs'].sort();
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')]))),sourceHashes=await hashes();
const server=createServer(),normal=server.listeners('request')[0];server.removeAllListeners('request');
server.on('request',async(req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname;if(path==='/shared-contracts.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Isolated IDB contracts</title>');return;}if(contracts.some(f=>path==='/tests/free/'+f)){try{res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(await readFile('.'+path));}catch{res.end();}}else normal(req,res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const results={};
 // Independent origins/IDB contexts prevent fixtures from contaminating each other.
 for(const [name,file,fn] of [['lifecycle',contracts[0],'runSharedLifecycleContracts'],['batch',contracts[1],'runSharedBatchContracts'],['retention',contracts[2],'runSharedRetentionContracts']]){
  const context=await browser.newContext();try{const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/shared-contracts.html`);
   results[name]=await page.evaluate(async({file,fn})=>{const module=await import('/tests/free/'+file);return module[fn](indexedDB,location.origin);},{file,fn});
  }finally{await context.close();}
 }
 assert.equal(results.retention.length,10);assert(results.retention.every(r=>r.status==='PASS'),JSON.stringify(results.retention));assert.equal(results.lifecycle.checks.length,7);assert.equal(results.batch.length,4);assert(results.batch.every(r=>r.status==='PASS'),JSON.stringify(results.batch));assert.deepEqual(await hashes(),sourceHashes);
 await writeFile(process.argv[2]??'/private/tmp/free-shared-directory-lifecycle.json',JSON.stringify({evidence:'REAL_IDB_SYNTHETIC_SHARED_DIRECTORY_LIFECYCLE',browser:browser.version(),sourceHashes,results},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

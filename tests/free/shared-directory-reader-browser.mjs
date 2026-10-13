/** Real IDB owner reads; fixture conversion is NOT a production migration. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const files=['src/data/shared-directory-reader.mjs','src/data/shared-ref-directory.mjs','src/data/partitioned.mjs','src/data/partition-manifest.mjs','src/data/repository.mjs','tests/free/shared-directory-reader-browser.mjs','tests/free/shared-directory-read-contracts.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')]))),sourceHashes=await hashes();
const server=createServer(),normal=server.listeners('request')[0];server.removeAllListeners('request');server.on('request',async(req,res)=>{if(new URL(req.url,'http://127.0.0.1').pathname==='/tests/free/shared-directory-read-contracts.mjs'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(await readFile(new URL('./shared-directory-read-contracts.mjs',import.meta.url)));}else normal(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
const result=await page.evaluate(async()=>{const {runSharedReadContracts}=await import('/tests/free/shared-directory-read-contracts.mjs');return runSharedReadContracts(indexedDB,location.origin);
});assert.deepEqual(await hashes(),sourceHashes);await writeFile(process.argv[2]??'/private/tmp/free-shared-directory-reader.json',JSON.stringify({evidence:'REAL_IDB_SHARED_DIRECTORY_OWNER_READS',browser:browser.version(),sourceHashes,result},null,2)+'\n');console.log(JSON.stringify(result));}finally{await browser?.close();await new Promise(r=>server.close(r));}

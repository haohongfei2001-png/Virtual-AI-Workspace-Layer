import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const server=createServer(),normal=server.listeners('request')[0];server.removeAllListeners('request');
server.on('request',async(request,response)=>{
 const path=new URL(request.url,'http://127.0.0.1').pathname;
 if(path==='/free-evidence-scale'){response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><meta charset="utf-8"><title>Synthetic evidence partition scale</title>');}
 else if(path==='/tests/free/evidence-scale-contracts.mjs'){response.writeHead(200,{'Content-Type':'text/javascript'});response.end(await readFile(new URL('./evidence-scale-contracts.mjs',import.meta.url)));}
 else normal(request,response);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/free-evidence-scale`);
 const sourceHashes={};for(const directory of ['src/data','src/b1','tests/free'])for(const path of await readdir(directory,{recursive:true})){if(!path.endsWith('.mjs'))continue;const file=`${directory}/${path}`;sourceHashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');}
 const report={evidence:'REAL_BROWSER_INDEXEDDB_SYNTHETIC_ONLY',realChatGPT:'NOT_RUN',mv3:'NOT_RUN',navigationLatency:'NOT_RUN',browser:browser.version(),headless:true,results:[],sourceHashes};
 const save=()=>process.argv[2]?writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n'):Promise.resolve();
 const sizes=process.env.FREE_EVIDENCE_RECOVERY_ONLY?[]:(process.env.FREE_EVIDENCE_SIZES??'1000,10000,100000').split(',').map(Number);
 for(const size of sizes){const result=await page.evaluate(async size=>(await import('/tests/free/evidence-scale-contracts.mjs')).runEvidenceScale(size),size);report.results.push(result);console.log(JSON.stringify(result));await save();}
 const recovery=await page.evaluate(async()=>(await import('/tests/free/evidence-scale-contracts.mjs')).runEvidenceMigrationRecovery());report.results.push(recovery);console.log(JSON.stringify(recovery));await save();
 if(report.results.some(result=>result.status!=='PASS'))process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

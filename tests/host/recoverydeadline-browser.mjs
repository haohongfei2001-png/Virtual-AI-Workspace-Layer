/** Real browser IndexedDB with controlled elapsed clock and withheld timers.
 * Synthetic authority only; neither MV3 nor live-account acceptance. */
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
const root=resolve('.'),output=process.argv[2]??join(tmpdir(),'recoverydeadline-browser.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHashes={};for(const file of ['tests/host/recoverydeadline-browser.mjs','tests/host/recoverydeadline-probe.mjs','tests/host/isolated-browser-cleanup.mjs'])sourceHashes[file]=sha(await readFile(file));
const report={status:'RUNNING',sourcesStable:false,sourceCommit:process.env.FREE_SOURCE_COMMIT??null,evidence:'REAL_HEADLESS_CHROME_LOOPBACK_INDEXEDDB',authority:'SYNTHETIC_SOURCE_GATE_AND_UI_AUTHORITY_DOUBLES',mv3:'NOT_RUN',liveChatGPT:'NOT_RUN',sourceHashes,results:[],pageErrors:[]};
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://127.0.0.1').pathname;if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Recovery deadline synthetic IDB fixture</title>');return;}const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep)||!pathname.endsWith('.mjs')||!(pathname.startsWith('/src/')||pathname.startsWith('/simulator/')||pathname==='/tests/host/recoverydeadline-probe.mjs'))throw Error('not-found');const bytes=await readFile(file),key=file.slice(root.length+1),hash=sha(bytes);if(sourceHashes[key]&&sourceHashes[key]!==hash)throw Error('source-changed');sourceHashes[key]=hash;res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
let context,profile;
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 profile=await mkdtemp(join(tmpdir(),'recoverydeadline-'));const executablePath=process.env.FREE_CHROME_EXECUTABLE??process.env.CHROME_BIN??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
 context=await chromium.launchPersistentContext(profile,{headless:true,executablePath,timezoneId:'UTC'});const origin=`http://127.0.0.1:${server.address().port}`;
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(origin);
 const cases=await page.evaluate(async()=> (await import('/tests/host/recoverydeadline-probe.mjs')).recoveryDeadlineCases());
 for(const input of cases){try{report.results.push(await page.evaluate(async({kind,boundary,deadline})=>(await import('/tests/host/recoverydeadline-probe.mjs')).recoveryDeadlineCase(indexedDB,kind,boundary,deadline),input));}catch(error){report.results.push({...input,status:'FAIL',error:String(error)});}}
 report.status=report.results.length===52&&report.results.every(r=>r.status==='PASS')&&!report.pageErrors.length?'PASS':'FAIL';
}catch(error){report.status='FAIL';report.error=error?.stack??String(error);}
finally{
 await cleanupOwnedResources(report,[['browser',()=>context?.close()],['server',()=>server.listening?new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())):undefined],['profile',()=>profile?rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}):undefined],['source-integrity',async()=>{report.sourcesStable=false;report.sourceHashesAfter={};for(const [file,hash]of Object.entries(sourceHashes)){const after=sha(await readFile(file));report.sourceHashesAfter[file]=after;if(after!==hash)throw Error('source-changed: '+file);}report.sourcesStable=true;}]]);
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,results:report.results.length,output}));if(report.status!=='PASS')process.exitCode=1;

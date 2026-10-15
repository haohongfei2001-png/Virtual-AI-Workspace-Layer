/** Real browser prerequisite only; not product or J4 acceptance. */
import assert from 'node:assert/strict';import http from 'node:http';import {mkdtemp,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
const dir=await mkdtemp(join(tmpdir(),'vaiwl-native-visibility-')),server=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end('<title>Isolated native visibility</title><p>Offline native browser visibility prerequisite</p>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));let handle;
const report={status:'NOT_RUN',evidence:'REAL_NATIVE_BROWSER_VISIBILITY_ONLY',productAcceptance:'NOT_ESTABLISHED'};
try{
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',profileDir:join(dir,'profile'),headed:process.env.FREE_CHROME_HEADED==='1'});report.browserPrecondition=handle.diagnostic;
 const {context}=handle,origin='http://127.0.0.1:'+server.address().port;await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const a=await context.newPage();await a.goto(origin+'/a');await a.bringToFront();await a.waitForFunction(()=>document.visibilityState==='visible',null,{polling:100,timeout:5000});
 await a.evaluate(()=>{globalThis.observations=[];document.addEventListener('visibilitychange',e=>observations.push({state:document.visibilityState,trusted:e.isTrusted}));});
 const b=await context.newPage();await b.goto(origin+'/b');await b.bringToFront();await a.waitForFunction(()=>document.visibilityState==='hidden',null,{polling:100,timeout:5000});
 await a.bringToFront();await a.waitForFunction(()=>document.visibilityState==='visible',null,{polling:100,timeout:5000});report.events=await a.evaluate(()=>observations);assert(report.events.some(e=>e.state==='hidden'&&e.trusted));assert(report.events.some(e=>e.state==='visible'&&e.trusted));report.browserVersion=handle.browser.version();report.status='PASS_NATIVE_VISIBILITY_PREREQUISITE';
}catch(e){report.status=handle?'FAIL':'NOT_RUN_BROWSER_STARTUP';report.error=e.stack;process.exitCode=1;}
finally{await handle?.close();await new Promise(r=>server.close(r));await writeFile(process.argv[2]??join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report));

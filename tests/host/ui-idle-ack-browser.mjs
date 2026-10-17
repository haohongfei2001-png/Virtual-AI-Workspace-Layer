/** Actual cross-origin frame/DOM mechanism only; no MV3 or natural-worker claim. */
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex'),sources=new Map(),root=resolve('.');
const script=await readFile(new URL(import.meta.url));let parentOrigin,frameOrigin;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://fixture'),path=url.pathname;
 let body,type='text/html';
 if(path==='/parent')body=`<!doctype html><body><script>globalThis.receipts=[];addEventListener('message',e=>{if(e.origin===${JSON.stringify(frameOrigin)}&&e.data?.type==='VAIWL_UI_IDLE_ACK'){const frame=[...document.querySelectorAll('iframe')].find(f=>f.contentWindow===e.source);if(frame)receipts.push({role:frame.dataset.role,data:e.data,origin:e.origin});}});</script>${['workspace','sidebar'].map(role=>`<iframe data-role="${role}" src="${frameOrigin}/frame?role=${role}"></iframe>`).join('')}`;
 else if(path==='/frame')body=`<!doctype html><body><main id="private"></main><script type="module">
 import {createUiFrameClient} from '/src/host/ui-frame-client.mjs';
 const role=${JSON.stringify(url.searchParams.get('role'))},privateRoot=document.querySelector('#private');
 let release;const held=new Promise(r=>release=r);globalThis.releaseRender=release;
 const event={addListener(){},removeListener(){}},runtime={connect:()=>({onMessage:event,onDisconnect:event,disconnect(){}}),sendMessage:async()=>({ok:true,grant:{id:'grant',mountId:'mount',parentDocumentId:'parent',uiDocumentId:'ui_'+role,scopeGrantId:'scope',role,expiresAt:new Date(Date.now()+20000).toISOString()}})};
 globalThis.client=createUiFrameClient({document,runtime,privateRoot,role,parentOrigin:${JSON.stringify(parentOrigin)},onGrant:async()=>{privateRoot.textContent='OFFLINE_PRIVATE_BEFORE';globalThis.renderStarted=true;await held;privateRoot.textContent='OFFLINE_PRIVATE_LATE';}});
 globalThis.starting=client.start();
 </script>`;
 else {if(!/^\/src\/(host|data|navigation|b1)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('not-found');body=await readFile(resolve(root,'.'+path));sources.set(path,hash(body));type='text/javascript';}
 res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;parentOrigin=`http://127.0.0.1:${port}`;frameOrigin=`http://localhost:${port}`;
const report={evidence:'WEB_MECHANISM_ONLY',mv3:'NOT_TESTED',naturalWorkerSleep:'NOT_TESTED',scriptHash:hash(script),checks:[],status:'NOT_RUN'};let context;
try{
 const dir=await mkdtemp('/private/tmp/vaiwl-idle-ack-');context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 await context.route('**/*',route=>[parentOrigin,frameOrigin].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(parentOrigin+'/parent');
 const frames={};for(const role of ['workspace','sidebar']){const element=await page.locator(`iframe[data-role="${role}"]`).elementHandle();frames[role]=await element.contentFrame();await frames[role].waitForFunction(()=>globalThis.renderStarted===true);}
 await page.evaluate(origin=>{for(const frame of document.querySelectorAll('iframe'))frame.contentWindow.postMessage({type:'VAIWL_UI_IDLE',role:frame.dataset.role,requestId:'browser_idle_1'},origin);},frameOrigin);
 for(const role of ['workspace','sidebar'])await frames[role].waitForFunction(()=>client.isAuthorized()===false&&document.querySelector('#private').textContent==='');
 assert.equal(await page.evaluate(()=>receipts.length),0);report.checks.push('no-ack-before-old-renders-settle');
 await frames.workspace.evaluate(()=>releaseRender());await page.waitForFunction(()=>receipts.length===1);assert.equal(await frames.workspace.locator('#private').textContent(),'');assert.equal(await frames.sidebar.locator('#private').textContent(),'');report.checks.push('first-frame-clears-late-write-without-certifying-second');
 await frames.sidebar.evaluate(()=>releaseRender());await page.waitForFunction(()=>receipts.length===2);
 for(const role of ['workspace','sidebar']){assert.equal(await frames[role].evaluate(()=>starting),false);assert.equal(await frames[role].locator('#private').textContent(),'');}
 const receipts=await page.evaluate(()=>receipts);assert.deepEqual(receipts.map(r=>r.role).sort(),['sidebar','workspace']);for(const r of receipts){assert.equal(r.origin,frameOrigin);assert.deepEqual(r.data,{type:'VAIWL_UI_IDLE_ACK',role:r.role,requestId:'browser_idle_1'});}
 report.checks.push('both-exact-cross-origin-receipts-after-private-dom-clear');assert.deepEqual(errors,[]);report.errors=errors;report.browserVersion=context.browser().version();report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await context?.close();await new Promise(r=>{server.close(r);server.closeAllConnections();});report.sourceHashes=Object.fromEntries(sources);report.sourceChangedDuringRun=false;for(const [path,digest]of sources)if(hash(await readFile(resolve(root,'.'+path)))!==digest)report.sourceChangedDuringRun=true;report.scriptChangedDuringRun=hash(await readFile(new URL(import.meta.url)))!==report.scriptHash;if(report.sourceChangedDuringRun||report.scriptChangedDuringRun){report.status='FAIL';process.exitCode=1;}await writeFile(process.argv[2]??'/private/tmp/ui-idle-ack-browser.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,evidence:report.evidence,checks:report.checks,error:report.error}));

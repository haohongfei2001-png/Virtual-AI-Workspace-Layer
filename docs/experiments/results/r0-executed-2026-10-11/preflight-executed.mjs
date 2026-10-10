import { chromium } from './tools/node_modules/playwright/index.mjs';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
const root = '/tmp/vaiwl-r0-20261011.IFxVsZ';
const html = readFileSync(join(root,'source/experiments/r0/mv3/host-fixture.html'));
const log = { startedAt: new Date().toISOString(), level:'REAL_CHROME_SYNTHETIC_FIXTURE', steps:[] };
const server=createServer((req,res)=>{ if(req.method==='GET' && /^\/r0-mv3-fixture\/[AB]\.html$/.test(req.url)){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);}else{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let context;
try {
 const profile=mkdtempSync(join(root,'chrome-profile-'));
 context=await chromium.launchPersistentContext(profile,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],viewport:{width:1280,height:900}});
 log.browser=context.browser().version();
 const cdp=await context.browser().newBrowserCDPSession();
 log.version=await cdp.send('Browser.getVersion');
 const loaded=await cdp.send('Extensions.loadUnpacked',{path:join(root,'built-original')});
 log.steps.push({name:'Extensions.loadUnpacked',result:loaded});
 const page=await context.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/r0-mv3-fixture/A.html`);
 await page.locator('[data-vawl-r0-mv3]').waitFor({timeout:6000});
 log.steps.push({name:'static content script with Shadow DOM',result:await page.locator('[data-vawl-r0-mv3]').evaluate(e=>({text:e.shadowRoot.textContent,shadow:!!e.shadowRoot}))});
 log.workers=context.serviceWorkers().map(w=>w.url());
 log.status='PASS';
} catch(e){log.status='BLOCKED';log.error={name:e.name,message:e.message};}
finally {if(context) await context.close();await new Promise(r=>server.close(r)); log.endedAt=new Date().toISOString();writeFileSync(join(root,'preflight.json'),JSON.stringify(log,null,2));console.log(JSON.stringify(log,null,2));}

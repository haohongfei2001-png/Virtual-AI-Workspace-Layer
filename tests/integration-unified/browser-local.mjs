/** Formal BrowserLocal composition on the existing anonymous observed-shape
 * host. No server principal, Pro fixture owner, or synthetic grant is supplied. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {observedDesktopHTML} from '../host/fixtures/observed-desktop.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from '../host/historical-network-guard.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';

const C='44444444-4444-4444-8444-444444444444',NAME='Personal local Pro asset',DRAFT='LOCAL_NATIVE_UNSENT_DRAFT';
const executablePath=process.env.FREE_CHROME_EXECUTABLE;
if(!executablePath)throw Error('full-Chromium-required-no-skip');
const directory=await mkdtemp(join(tmpdir(),'vaiwl-unified-local-')),output=resolve(process.argv[2]??join(directory,'report.json'));
await mkdir(dirname(output),{recursive:true});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim(),sourceSHA=git('rev-parse','HEAD');
const sourceStatus=()=>git('status','--porcelain','--untracked-files=all','--','src','extension','tests','.github/workflows/vaiwl-unified-r1.yml');
const sourceStatusBefore=sourceStatus();
if(process.env.VAIWL_SOURCE_COMMIT&&process.env.VAIWL_SOURCE_COMMIT!==sourceSHA)throw Error('local-browser-source-sha-mismatch');
if(process.env.CI==='true'&&sourceStatusBefore)throw Error('local-browser-CI-source-must-match-commit');
const hash=value=>createHash('sha256').update(value).digest('hex'),requests=[];
const html=observedDesktopHTML(C),server=createServer((request,response)=>{requests.push(request.url);response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});response.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,guard=await createHistoricalNetworkGuard({fixtureOrigin:origin});
const report={format:'vaiwl-unified-browser-local/1',sourceSHA,sourceStatusBefore,sourceMatchesCommit:sourceStatusBefore==='',
 evidenceClass:'FORMAL_BROWSER_LOCAL_PACKAGED_MV3_SYNTHETIC_HOST',status:'RUNNING',realChatGPT:'NOT_RUN',personalMac:'NOT_RUN',actualPAIA:'NOT_RUN',
 modelCalls:0,cloudBudget:0,serverIdentity:'NOT_ESTABLISHED',fixtureHash:hash(html),profiles:[],errors:[],requests,
 limits:['Observed selectors are replayed with synthetic text, not a live ChatGPT page.','Personal binding uses the existing explicit extension popup action and does not establish server account identity.']};
let context,page,manifest;
const sourceHashes=async()=>Object.fromEntries(await Promise.all(Object.keys(manifest.sourceHashes).sort().map(async path=>[path,hash(await readFile(path))])));
try{
 for(const proR1 of [false,true]){
  const name=proR1?'unified-free-pro':'standalone-free',built=packageHost(join(directory,name,'package'),{offlineOrigin:origin,browserLocal:true,proR1});
  manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
  const profile={name,package:built,checks:[],sourceHashesBefore:await sourceHashes(),status:'RUNNING'};report.profiles.push(profile);
  const check=label=>{profile.checks.push({name:label,status:'PASS'});console.log('PASS '+name+': '+label);};
  context=await chromium.launchPersistentContext(join(directory,name,'profile'),{executablePath,headless:true,viewport:{width:1000,height:900},
   ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
  report.browser=context.browser().version();await context.route('**/*',route=>route.request().url().startsWith(origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
  context.on('page',p=>p.on('pageerror',error=>report.errors.push(error.message)));
  const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
  const workspaceURL=`chrome-extension://${id}/workspace.html`;
  const frame=()=>page.frames().find(f=>f.url()===workspaceURL);
  const ready=async()=>{await page.frameLocator(`iframe[src="${workspaceURL}"]`).getByRole('link',{name:'Native A',exact:true}).first().waitFor({timeout:20000});return frame();};
  const pro=async()=>{const f=frame();await f.getByRole('button',{name:'Pro',exact:true}).click();await f.getByRole('button',{name:'新建主题',exact:true}).waitFor({timeout:10000});return f;};
  const assertDraft=async()=>assert.equal(await page.evaluate(draft=>globalThis.localEditor===document.querySelector('textarea')&&localEditor.value===draft,DRAFT),true);
  page=await context.newPage();await page.goto(origin+'/c/'+C);let f=await ready();
  const worker=context.serviceWorkers().find(w=>w.url()===`chrome-extension://${id}/extension/worker.mjs`);assert(worker);
  assert.deepEqual(await worker.evaluate(()=>indexedDB.databases()),[]);check('visible native facts work without identity provider or opening a private database');
  await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.locator('textarea').fill(DRAFT);await page.evaluate(()=>{globalThis.localEditor=document.querySelector('textarea');});
  const back=page.getByRole('button',{name:'返回工作空间',exact:true});await back.waitFor();await back.click();f=await ready();await assertDraft();check('native reading, input and four-grid return retain the exact draft node');
  if(!proR1){assert.equal(await f.getByRole('button',{name:'Pro',exact:true}).count(),0);assert(!Object.keys(manifest.files).some(path=>path.startsWith('src/pro/')));check('standalone Free has no Pro code or mode dependency');}
  else{
   f=await pro();assert.equal(await f.getByRole('button',{name:'新建主题',exact:true}).isDisabled(),true);assert.equal(await f.getByRole('heading',{name:NAME,exact:true}).count(),0);
   assert.deepEqual(await worker.evaluate(()=>indexedDB.databases()),[]);check('unbound memory session accurately disables persistent Pro changes and opens no DB');
   const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/status.html`);await page.bringToFront();
   // The existing popup endpoint performs the same explicit local binding used
   // by its own button. It resolves the actual active document in the worker;
   // this test never supplies a grant, scope, owner, seed or account identifier.
   const action=async action=>{await page.bringToFront();const value=await popup.evaluate(action=>chrome.runtime.sendMessage({v:1,type:'HOST_LOCAL_SPACE',action}),action);assert.equal(value.ok,true);return value;};
   await action('unlock');await ready();f=await pro();assert.equal(await f.getByRole('button',{name:'新建主题',exact:true}).isEnabled(),true);
   await f.getByRole('button',{name:'新建主题',exact:true}).click();await f.getByRole('textbox',{name:'主题名称',exact:true}).fill(NAME);await f.getByRole('button',{name:'创建主题',exact:true}).click();await f.getByRole('heading',{name:NAME,exact:true}).waitFor();await assertDraft();
   check('explicit existing popup binding allows a durable manual Pro topic in the personal local namespace');
   await f.getByRole('button',{name:'主题设置：'+NAME,exact:true}).click();await f.getByRole('button',{name:'收录聊天',exact:true}).click();
   await f.getByText('当前没有可确认归属的聊天。原生入口仍可用。',{exact:true}).waitFor();assert.equal(await f.getByRole('combobox',{name:'聊天',exact:true}).count(),0);await f.getByRole('button',{name:'关闭',exact:true}).click();
   check('personal binding does not manufacture positive NONE membership for an observed route');
   await f.getByRole('button',{name:'Free',exact:true}).click();await ready();f=await pro();await f.getByRole('heading',{name:NAME,exact:true}).waitFor();await assertDraft();check('unified local Free and Pro switch retains the private topic and native input');
   await page.reload();await ready();f=await pro();assert.equal(await f.getByRole('heading',{name:NAME,exact:true}).count(),0);assert.equal(await f.getByRole('button',{name:'新建主题',exact:true}).isDisabled(),true);
   check('replacement document starts locked and cannot display the prior private Pro topic');
   await action('unlock');await ready();f=await pro();await f.getByRole('heading',{name:NAME,exact:true}).waitFor();check('fresh explicit document binding recovers the saved private Pro topic');
   await action('lock');await ready();f=await pro();assert.equal(await f.getByRole('heading',{name:NAME,exact:true}).count(),0);assert.equal(await f.getByRole('button',{name:'新建主题',exact:true}).isDisabled(),true);check('explicit local revocation retires private Pro projection while Free stays usable');
   await popup.close();
  }
  profile.verification=verifyHost(built.unpacked);profile.sourceHashesAfter=await sourceHashes();profile.sourcesStable=JSON.stringify(profile.sourceHashesBefore)===JSON.stringify(profile.sourceHashesAfter);assert(profile.sourcesStable,'source changed during local browser check');
  profile.status='PASS';await context.close();context=null;
 }
 assert(requests.every(path=>!path.startsWith('/api/')&&!path.startsWith('/backend-api/')));assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;if(page&&!page.isClosed())try{report.failure={url:page.url(),frames:page.frames().map(f=>f.url()),startup:await page.evaluate(()=>document.documentElement.dataset.vaiwlStartup)};report.screenshot=join(dirname(output),'browser-local-failure.png');await page.screenshot({path:report.screenshot,fullPage:true});}catch{}}
finally{report.sourceStatusAfter=sourceStatus();report.sourceMatchesCommit=report.sourceMatchesCommit&&report.sourceStatusAfter==='';await context?.close();await new Promise(resolve=>server.close(resolve));await guard.close();report.networkGuard=guard.snapshot();await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,profiles:report.profiles.map(p=>({name:p.name,status:p.status,checks:p.checks.length})),error:report.error,output}));}

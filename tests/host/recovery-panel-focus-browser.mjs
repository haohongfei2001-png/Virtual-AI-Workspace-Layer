import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';

test('recovery and backup keep keyboard focus within an explicit local operation',{timeout:30000},async t=>{
 const root=resolve('.'),server=http.createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><button id="open">Open local panel</button><input id="outside" value="KEEP DRAFT"><div id="panel"></div>');return;}
  if(!/^\/src\/(host|b1|data)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('not-found');
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(resolve(root,'.'+path)));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 t.after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext(),origin=`http://127.0.0.1:${server.address().port}`;
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage();await page.goto(origin+'/fixture');await page.locator('#open').focus();
 const results=await page.evaluate(async()=>{
  const {createFreeFrameRecovery}=await import('/src/host/free-frame-recovery.mjs');
  const {createFreeFrameBackup}=await import('/src/host/free-frame-backup.mjs');
  const {createFreeFrameSnippets}=await import('/src/host/free-frame-snippets.mjs');
  const container=document.querySelector('#panel'),checks=[],pending=[],calls=[];
  const healthy={ok:true,plans:Object.fromEntries(['workspace','native','evidence'].map(kind=>[kind,{corrupt:false,recoverable:false}]))};
  const step=()=>new Promise(r=>setTimeout(r,0)),inside=()=>container.contains(document.activeElement);
  const check=(name,value)=>checks.push({name,pass:!!value});
  const recovery=createFreeFrameRecovery({document,container,request:m=>{calls.push(m);return new Promise(r=>pending.push(r));},onResume(){}});
  const opened=recovery.open();check('explicit-open-has-panel-focus',inside());
  pending.shift()(healthy);await opened;check('status-completion-keeps-panel-focus',inside());
  container.querySelector('button').focus();recovery.invalidate();check('refresh-keeps-back-focus',inside()&&document.activeElement.textContent==='返回工作空间');
  pending.shift()(healthy);await step();check('refresh-completion-keeps-back-focus',inside()&&document.activeElement.textContent==='返回工作空间');
  recovery.invalidate();document.querySelector('#outside').focus();pending.shift()(healthy);await step();check('late-check-never-steals-outside-focus',document.activeElement.id==='outside');
  recovery.stop();check('stop-preserves-outside-focus',document.activeElement.id==='outside');
  check('checks-never-repair',calls.every(m=>m.type==='HOST_UI_RECOVERY_STATUS'));
  document.querySelector('#open').focus();const backup=createFreeFrameBackup({document,container,request:async m=>m.type==='HOST_UI_BACKUP_EXPORT'?{ok:true,transferId:'transfer',byteLength:1,chunkBytes:24576,chunkCount:1}:m.type==='HOST_UI_BACKUP_READ'?{ok:true,transferId:'transfer',index:0,data:'eA=='}:{ok:true},onResume(){}});backup.open();check('backup-open-has-panel-focus',inside());
  [...container.querySelectorAll('button')].find(n=>n.textContent==='导出备份').click();await step();const download=container.querySelector('a');download.focus();check('download-is-focused-before-invalidation',document.activeElement===download);backup.invalidate();await step();check('hidden-download-focus-falls-back-to-heading',inside()&&document.activeElement.tagName==='H2');
  document.querySelector('#outside').focus();backup.invalidate();check('backup-invalidation-does-not-steal-focus',document.activeElement.id==='outside');backup.stop();
  document.querySelector('#open').focus();const snippetPending=[];
  const snippets=createFreeFrameSnippets({document,container,parentOrigin:'https://chatgpt.com',request:()=>new Promise(r=>snippetPending.push(r)),currentRef:null,onClose(){}});
  const list={ok:true,workspaceRevision:0,snippets:{total:0,offset:0,limit:12,items:[]}};
  const snippetOpened=snippets.open();check('snippets-open-has-panel-focus',inside());snippetPending.shift()(list);await snippetOpened;check('snippets-completion-keeps-focus',inside());
  [...container.querySelectorAll('button')].find(n=>n.textContent==='返回工作空间').focus();snippets.invalidate();snippetPending.shift()(list);await step();check('snippets-invalidation-keeps-back-focus',inside()&&document.activeElement.textContent==='返回工作空间');
  snippets.invalidate();document.querySelector('#outside').focus();snippetPending.shift()(list);await step();check('snippet-refresh-never-steals-outside-focus',document.activeElement.id==='outside');snippets.stop();
  check('draft-unchanged',document.querySelector('#outside').value==='KEEP DRAFT');return checks;
 });
 console.log(JSON.stringify(results));assert.deepEqual(results.filter(r=>!r.pass),[]);
});

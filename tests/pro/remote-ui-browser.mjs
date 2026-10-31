// Browser-only projection/editing regression. Production MV3 authorization is
// exercised separately by tests/integration-unified/mv3-browser.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url);
test('bounded remote renderer edits a long Series, preserves native-link fallback and exposes read-only scope',async()=>{
 const fixture='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;font-family:system-ui}#workspace{display:block;height:100%}</style><div id="workspace"></div><script type="module" src="/tests/pro/support/remote-ui-fixture.mjs"></script>';
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('content-type','text/html;charset=utf-8');res.end(fixture);return;}if(url.pathname.startsWith('/c/')){res.setHeader('content-type','text/html;charset=utf-8');res.end('<title>Isolated native destination</title><main>Native destination</main>');return;}const path=resolve(repository,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(repository+'/')){res.writeHead(403).end();return;}res.setHeader('content-type',extname(path)==='.mjs'?'text/javascript;charset=utf-8':'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,context;
 try{
  const nodeModules=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,playwright=require(require.resolve('playwright',{paths:nodeModules?[nodeModules]:[repository]}));
  let executablePath=process.env.PRO_CHROMIUM_EXECUTABLE;if(!executablePath){if(!process.env.PRO_CHROMIUM_MODULE)throw Error('Isolated Chromium executable required');executablePath=await (await import(pathToFileURL(process.env.PRO_CHROMIUM_MODULE))).default.executablePath();}
  browser=await playwright.chromium.launch({executablePath,args:['--no-zygote','--disable-gpu'],headless:true});context=await browser.newContext({viewport:{width:1180,height:840}});
  const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.origin);return route.abort();}return route.continue();});
  const source='http://127.0.0.1:'+server.address().port;await page.goto(source);await page.waitForFunction(()=>window.ready);
  const viewSeries=async()=>{await page.getByRole('button',{name:'主题设置：分页工作',exact:true}).click();await page.getByRole('button',{name:'查看与编辑工作线',exact:true}).click();await page.getByRole('button',{name:'查看工作线：长工作线',exact:true}).click();};
  await viewSeries();await page.getByRole('button',{name:'后一页窗口',exact:true}).click();await page.getByRole('button',{name:'调整：第 25 个窗口',exact:true}).click();
  const before=await page.evaluate(()=>testApi.series());await page.getByRole('button',{name:'前移一个位置',exact:true}).click();await page.getByRole('dialog',{name:'确认工作线调整',exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>testApi.series()),before);
  await page.getByRole('button',{name:'确认应用',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  const moved=await page.evaluate(()=>testApi.series());assert.equal(moved.entries[23],before.entries[24]);assert.deepEqual(moved.edges,before.edges);assert.deepEqual(moved.labels,before.labels);
  await viewSeries();await page.getByRole('button',{name:'全部接续与分支',exact:true}).click();await page.getByRole('button',{name:'下一页关系',exact:true}).click();await page.getByRole('button',{name:/^移除：接续：/}).first().click();await page.getByRole('dialog',{name:'确认工作线调整',exact:true}).waitFor();assert.equal(await page.evaluate(()=>testApi.series().edges.length),240);
  await page.getByRole('button',{name:'确认应用',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>testApi.series().edges.length),239);assert.equal(await page.evaluate(()=>testApi.series().entries.length),241);
  await page.getByRole('button',{name:'第 1 个窗口',exact:true}).click();const link=page.getByRole('link',{name:'在新标签打开',exact:true});await link.waitFor();assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');assert.equal(await link.getAttribute('href'),source+'/c/'+before.entries[0]);
  const popupPromise=context.waitForEvent('page');await link.click();const popup=await popupPromise;await popup.waitForURL(source+'/c/'+before.entries[0]);assert.equal(page.url(),source+'/');await popup.close();await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'整理设置',exact:true}).click();await page.getByRole('button',{name:'检查旧版整理升级',exact:true}).click();await page.getByRole('button',{name:'检查可升级资料',exact:true}).click();await page.getByText('当前已有 Pro 整理资料，无法在此覆盖升级。',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'确认升级',exact:true}).count(),0);await page.getByRole('button',{name:'完成',exact:true}).click();
  await page.evaluate(()=>testApi.readOnly());assert.equal(await page.getByRole('button',{name:'新建主题',exact:true}).isDisabled(),true);await page.getByText(/当前为临时预览/).waitFor();
  assert((await page.evaluate(()=>testApi.maxReplyBytes()))<=65536);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{await context?.close();await browser?.close();await new Promise(resolve=>server.close(resolve));}
});

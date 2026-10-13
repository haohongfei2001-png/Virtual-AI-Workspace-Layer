import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './server.mjs';
import {modernExpectedWorld as modern} from '../expected/modern.mjs';
import {partialExpectedWorld as partial} from '../expected/partial.mjs';
const report={evidence:'HEADLESS_NATIVE_PROFILE_RECONSTRUCTIONS',realChatGPT:'NOT_RUN',productionAdapter:'NOT_RUN',workerNetworkPolicy:'NOT_RUN',results:[],fixtures:[],pageErrors:[]};
let browser;
async function run(options,fn){
 const server=await createHostFixtureServer(options);report.fixtures.push(server.manifest);
 const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===server.origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({profile:options.profile,fault:options.fault??null,error:error.message}));
 try{await page.goto(server.url);await fn(page,server);report.results.push({...options,status:'PASS'});}
 finally{await context.close();await server.close();}
}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});report.browser=browser.version();
 await run({profile:'MODERN'},async(page,server)=>{
  assert.equal(await page.getByRole('complementary',{name:'Navigation rail'}).count(),1);
  assert.equal(await page.locator('section[aria-label="Previous conversation"]').isVisible(),false);
  await page.getByRole('link',{name:'Ordinary conversation',exact:true}).click();await page.waitForURL(`**/c/${modern.conversations[2].id}`);
  await page.locator('#reading article[data-message-id="msg-self"]').waitFor();
  assert.equal(await page.locator('#reading [data-message-id="msg-self"]').count(),2);
  assert.equal(await page.locator('#reading article[data-message-id="msg-incomplete"] time').count(),0);
  assert.equal(await page.locator('#reading article[data-message-id="msg-incomplete"]').getAttribute('data-author-id'),null);
  assert.ok(server.snapshot().nativeRequests.some(r=>r.context===modern.selectedContext&&r.path.includes('/conversation/')));
  const region=page.locator('aside nav[aria-label="Chat history"]');await region.hover();await page.mouse.wheel(0,1000);
  await region.getByRole('link',{name:modern.conversations[0].title}).waitFor();
  assert.deepEqual(await region.locator('a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href').slice(3))),modern.afterScrollIds);
 });
 await run({profile:'PARTIAL'},async(page,server)=>{
  const region=page.locator('aside nav[aria-label="Chat history"]');assert.equal(await region.locator('a').count(),25);
  assert.equal(server.snapshot().conversationCount,partial.worldSize);
  await page.locator('#prompt-textarea').fill('Retained during native virtual scroll');
  await region.hover();await page.mouse.wheel(0,3000);
  await region.getByRole('link',{name:partial.conversations[49].title,exact:true}).waitFor();
  assert.equal(await region.locator('a').count(),50);
  await region.getByRole('link',{name:partial.conversations[49].title,exact:true}).click();await page.waitForURL(`**/c/${partial.conversations[49].id}`);
  assert.equal(await page.locator('#prompt-textarea').inputValue(),'Retained during native virtual scroll');
  assert.ok(!await page.content().then(html=>html.includes(partial.conversations[999].id)));
 });
 await run({profile:'FAULT',fault:'unsafe-reading'},async page=>{
  assert.equal(await page.locator('#reading #composer').count(),1);
  await page.locator('#prompt-textarea').fill('Native unsafe-boundary draft');
  await page.getByRole('button',{name:'Send',exact:true}).click();await page.locator('#composer output').filter({hasText:'message not sent'}).waitFor();
  assert.equal(await page.locator('#prompt-textarea').inputValue(),'Native unsafe-boundary draft');
 });
 await run({profile:'FAULT',fault:'iframe-destroy'},async page=>{
  await page.evaluate(()=>{const frame=document.createElement('iframe');frame.id='disposable-frame';frame.src='about:blank';document.body.append(frame);});
  await page.waitForFunction(()=>!document.querySelector('#disposable-frame'));
  await page.getByRole('button',{name:'Search chats',exact:true}).click();await page.locator('#search-dialog[open]').waitFor();
 });
 await run({profile:'FAULT',fault:'csp'},async(page,server)=>{
  const blocked=await page.evaluate(()=>new Promise(resolve=>{addEventListener('securitypolicyviolation',event=>{if(event.effectiveDirective==='frame-src')resolve(event.effectiveDirective);},{once:true});const frame=document.createElement('iframe');frame.src='/';document.body.append(frame);}));
  assert.equal(blocked,'frame-src');assert.equal(server.snapshot().requests['/'],1);
  await page.locator('#prompt-textarea').fill('CSP keeps native editor');
  assert.equal(await page.locator('#prompt-textarea').inputValue(),'CSP keeps native editor');
 });
 assert.deepEqual(report.pageErrors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await browser?.close();await writeFile(process.argv[2]??'/private/tmp/free-host-variants-browser.json',JSON.stringify(report,null,2)+'\n');}

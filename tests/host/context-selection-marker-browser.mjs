import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';

// Real MutationObserver, fixed synthetic DOM/runtime. This is not MV3 authority
// or a live ChatGPT identity assertion. No private profile or endpoint is used.
const out=process.argv[2];assert(out,'output-json-required');
const hash=v=>createHash('sha256').update(v).digest('hex'),started=performance.now();
const report={kind:'WEB_MECHANISM_ONLY',realChatGPT:'NOT_RUN',MV3:'NOT_RUN',checks:[],errors:[],sourceHashes:{}};
const scriptHash=hash(await readFile(new URL(import.meta.url)));let browser;
const C='11111111-1111-4111-8111-111111111111';
const server=http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(path==='/c/'+C){res.setHeader('Content-Type','text/html');res.end('<!doctype html><main><section id="reading"><article style="height:30px">LOCAL FIXTURE</article></section></main><textarea>UNSENT LOCAL DRAFT</textarea>');return;}
 if(!/^\/src\/(host|b1|data)\/[a-z0-9-]+\.mjs$/.test(path))throw Error('not-allowed');
 const bytes=await readFile(resolve('.'+path));report.sourceHashes[path.slice(1)]=hash(bytes);res.setHeader('Content-Type','text/javascript');res.end(bytes);
 }catch{res.writeHead(404);res.end();}});
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),args:['--disable-background-networking']});
 report.browser=browser.version();const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin+'/c/'+C);
 report.checks=await page.evaluate(async({C})=>{
  const {createContextAssociationBridge}=await import('/src/host/context-association.mjs');
  const {CHATGPT_SELECTION_CURRENT_BODY}=await import('/src/host/current-body-discovery.mjs');
  const {createURLPolicy}=await import('/src/host/url-policy.mjs');
  const {createCurrentBodyDiscovery}=await import('/src/host/current-body-discovery.mjs');
  const {LEGACY_SURFACE_PROFILE}=await import('/src/host/surface-discovery.mjs');
  const root=document.querySelector('#reading'),message=root.querySelector('article'),draft=document.querySelector('textarea'),base=location.href;
  let bodyReads=0;for(const n of [root,message])Object.defineProperty(n,'textContent',{get(){bodyReads++;throw Error('body-text-forbidden');}});
  const profile={id:'chatgpt-zh-desktop-observed-20261018',revision:4,currentBody:CHATGPT_SELECTION_CURRENT_BODY},results=[];
  for(const mode of ['marker-only','missing-message','wrong-body','hidden','conflict','two-roots','removed-marker','pending','route','stop','deadline']){
   history.replaceState(null,'',base);root.removeAttribute('data-chatgpt-conversation-selection-target');root.hidden=false;
   message.setAttribute('data-chatgpt-selection-conversation-id',C);message.setAttribute('data-chatgpt-selection-message-id','native-message');
   const listeners=new Set(),answers=[],runtime={id:'fixture-ext',onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)}};
   const bridge=createContextAssociationBridge({document,runtime,origin:location.origin,profile});
   const send=m=>{for(const f of listeners)f(m,{id:runtime.id},a=>answers.push(a));};
   const at=performance.now();send({type:'HOST_CONTEXT_ASSOCIATE',challenge:'challenge_'+mode,actualURL:base,conversationId:C,expiresAt:new Date(Date.now()+6000).toISOString()});
   if(answers.length)throw Error('premature-association');
   let extra=null;
   if(mode==='missing-message')message.removeAttribute('data-chatgpt-selection-message-id');
   if(mode==='wrong-body')message.setAttribute('data-chatgpt-selection-conversation-id','22222222-2222-4222-8222-222222222222');
   if(mode==='hidden')root.hidden=true;
   if(mode==='conflict'){extra=message.cloneNode(true);extra.setAttribute('data-chatgpt-selection-conversation-id','22222222-2222-4222-8222-222222222222');root.append(extra);}
   if(mode==='two-roots'){extra=root.cloneNode(true);extra.setAttribute('data-chatgpt-conversation-selection-target','');root.after(extra);}
   if(mode==='pending')send({type:'HOST_CONTEXT_PENDING'});
   if(mode==='route')history.replaceState(null,'','/c/22222222-2222-4222-8222-222222222222');
   if(mode==='stop')bridge.stop();
   if(mode==='deadline')await new Promise(r=>setTimeout(r,6050));
   // Positive case changes only this one attribute on an already mounted root.
   root.setAttribute('data-chatgpt-conversation-selection-target','');
   if(mode==='removed-marker')root.removeAttribute('data-chatgpt-conversation-selection-target');
   await new Promise(r=>setTimeout(r,200));
   const observed=answers.map(a=>a?.association??null),elapsedMs=performance.now()-at;
   const discovery=createCurrentBodyDiscovery({document,profile,urlPolicy:createURLPolicy({origin:location.origin})});const independentlyReadable=discovery.scan().association;discovery.stop();
   bridge.stop();extra?.remove();
   results.push({mode,observed,elapsedMs,independentlyReadable,bodyReads,listenersRemaining:listeners.size,draftRetained:draft===document.querySelector('textarea')&&draft.value==='UNSENT LOCAL DRAFT'});
  }
  for(const mode of ['legacy-conversation-id','legacy-project-label','legacy-project-ancestor-id']){
   const project=mode!=='legacy-conversation-id',P='g-p-'+'1'.repeat(32);
   history.replaceState(null,'',project?'/g/'+P+'/project':base);root.hidden=false;root.id=mode==='legacy-project-label'?'reading':'pending';
   root.setAttribute('data-conversation-id',C);const members=document.createElement('nav');members.style.height='30px';members.setAttribute('data-project-id',P);
   members.setAttribute('aria-label',mode==='legacy-project-label'?'pending':'Project conversations');root.append(members);
   const listeners=new Set(),answers=[],runtime={id:'fixture-ext',onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)}};
   const bridge=createContextAssociationBridge({document,runtime,origin:location.origin,profile:{...LEGACY_SURFACE_PROFILE,urlPolicy:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}});
   const at=performance.now();for(const f of listeners)f({type:'HOST_CONTEXT_ASSOCIATE',challenge:mode,actualURL:location.href,...project?{projectId:P}:{conversationId:C},expiresAt:new Date(Date.now()+6000).toISOString()},{id:runtime.id},a=>answers.push(a));
   if(answers.length)throw Error('premature-legacy-association');
   if(mode==='legacy-project-label')members.setAttribute('aria-label','Project conversations');else root.id='reading';
   await new Promise(r=>setTimeout(r,200));const observed=answers.map(a=>a?.association??null);bridge.stop();members.remove();
   results.push({mode,observed,elapsedMs:performance.now()-at,bodyReads,listenersRemaining:listeners.size,draftRetained:draft===document.querySelector('textarea')&&draft.value==='UNSENT LOCAL DRAFT'});
  }
  return results;
 },{C});
 assert.equal(report.checks[0].independentlyReadable,'explicit-body-id');assert.deepEqual(report.checks[0].observed,['explicit-body-id']);assert(report.checks[0].elapsedMs<6000);
 for(const c of report.checks.slice(1,11))assert(!c.observed.includes('explicit-body-id'),c.mode);
 for(const c of report.checks.slice(11))assert.deepEqual(c.observed,[c.mode==='legacy-conversation-id'?'explicit-body-id':'explicit-project-id'],c.mode);
 for(const c of report.checks){assert.equal(c.bodyReads,0);assert.equal(c.listenersRemaining,0);assert(c.draftRetained);}
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;}
finally{
 await browser?.close();if(server.listening)await new Promise(r=>server.close(r));
 report.sourceStable=true;for(const [path,digest]of Object.entries(report.sourceHashes))if(hash(await readFile(path))!==digest)report.sourceStable=false;
 report.scriptHash=scriptHash;report.scriptStable=hash(await readFile(new URL(import.meta.url)))===scriptHash;
 if(!report.sourceStable||!report.scriptStable){report.status='FAIL';process.exitCode=1;}
 report.elapsedMs=performance.now()-started;await writeFile(out,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,error:report.error,checks:report.checks.length,elapsedMs:report.elapsedMs}));

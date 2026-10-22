import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
// A new headless context and real IndexedDB, with a synthetic private provider.
// No MV3/browser-receipt or real-account acceptance is asserted by this check.
export async function runDirectoryIDB(output){
 let browser,server;const report={status:'NOT_RUN',evidence:'S_ISOLATED_BROWSER_IDB',realAccount:'NOT_RUN',productionProviderRegistered:false,externalRequests:0};
 try{
  server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Directory owner IDB fixture</title>');return;}if(!path.startsWith('/src/')&&path!=='/tests/host/fixtures/directory-owner.mjs')throw Error('not-found');const file=resolve(root,'.'+path);if(!file.startsWith(root))throw Error('not-found');res.setHeader('content-type','text/javascript');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();report.externalRequests++;return route.abort();});
  const page=await context.newPage();await page.goto(origin);
  report.result=await page.evaluate(async()=>{
   const {directoryHarness,ordinary,C,D}=await import('/tests/host/fixtures/directory-owner.mjs'),h=await directoryHarness(indexedDB),check=(v,reason)=>{if(!v)throw Error(reason);};
   try{
    check((await h.dom()).state==='accepted','dom-before');const before=await h.native.read(h.scope),sourceId=Object.keys(before.sources)[0];h.setPayload(ordinary([C,D]));const result=await h.observe();check(result.ok,'directory-commit');const metadata=await h.native.read(h.scope);check(Object.keys(metadata.sources).length===1&&metadata.sources[sourceId].channel==='host-metadata','one-canonical-source');check(JSON.stringify(metadata.membership)===JSON.stringify(before.membership),'membership-preserved');
    h.base.close();const reopened=await h.native.snapshot(h.scope);check(reopened.unknown.some(row=>row.id===D),'reopened-unknown');check(reopened.projects.some(p=>p.members.some(row=>row.id===C)),'prior-project-membership');
    check((await h.dom()).state==='accepted','dom-after');const final=await h.native.read(h.scope);check(final.refs[D]&&final.sources[sourceId].channel==='host-dom','unseen-row-retained');
    h.setPayload(ordinary([]));const empty=await h.observe();check(empty.replayed&&await h.native.version(h.scope)===final.revision,'no-absence-delete');
    const foreign={verified:true,provider:h.scope.provider,accountId:'foreign-fixture',organizationId:h.scope.organizationId};check((await h.native.read(foreign)).revision===0,'scope-isolation');
    return {sameCanonicalSource:true,membershipPreserved:true,unknownRemainsUnknown:true,reopenedIndexedDB:true,absenceDidNotDelete:true,otherScopeEmpty:true,coverageGapPreserved:result.coverage.gaps.includes('missing-inventory-status')};
   }finally{h.close();}
  });assert.equal(report.externalRequests,0);report.status='PASS';
 }catch(error){report.status='FAIL';report.error=error.message;throw error;}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await writeFile(output,JSON.stringify(report,null,2)+'\n');}
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await runDirectoryIDB(process.argv[2])));

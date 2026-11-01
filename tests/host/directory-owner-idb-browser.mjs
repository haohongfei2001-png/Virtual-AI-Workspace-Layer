import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
// A new headless context and real IndexedDB, with a synthetic private provider.
// No MV3/browser-receipt or real-account acceptance is asserted by this check.
export async function runDirectoryIDB(output,{authenticated=false}={}){
 let browser,server;const apiCalls=[];const report={status:'NOT_RUN',evidence:'S_ISOLATED_BROWSER_IDB',realAccount:'NOT_RUN',productionProviderRegistered:false,externalRequests:0};
 try{
  server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;
   if(authenticated&&['/api/auth/session','/backend-api/accounts/check/v4-2023-04-27','/backend-api/conversations'].includes(path)){
    apiCalls.push(path);res.setHeader('content-type','application/json');
    if(req.method!=='GET'||path!=='/api/auth/session'&&req.headers.authorization!=='Bearer FIXTURE_TOKEN'||path==='/backend-api/conversations'&&(req.url!=='/backend-api/conversations?offset=0&limit=100'||req.headers['chatgpt-account-id']!=='personal')){res.writeHead(403);res.end('{}');return;}
    const {ordinary,C,D}=await import('./fixtures/directory-owner.mjs');
    res.end(path==='/api/auth/session'?JSON.stringify({user:{id:'A'},expires:'2026-10-14T01:00:00Z',accessToken:'FIXTURE_TOKEN'}):path==='/backend-api/conversations'?ordinary([C,D]):JSON.stringify({accounts:{other:{account:{account_id:'other',structure:'workspace'}},personal:{account:{account_id:'personal',structure:'personal'}}}}));return;
   }
   if(path==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Directory owner IDB fixture</title>');return;}if(!path.startsWith('/src/')&&path!=='/tests/host/fixtures/directory-owner.mjs')throw Error('not-found');const file=resolve(root,'.'+path);if(!file.startsWith(root))throw Error('not-found');res.setHeader('content-type','text/javascript');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();report.externalRequests++;return route.abort();});
  const page=await context.newPage();await page.goto(origin);
  report.result=await page.evaluate(async authenticated=>{
   const {directoryHarness,ordinary,C,D}=await import('/tests/host/fixtures/directory-owner.mjs'),h=await directoryHarness(indexedDB),check=(v,reason)=>{if(!v)throw Error(reason);};
   try{
    check((await h.dom()).state==='accepted','dom-before');const before=await h.native.read(h.scope),sourceId=Object.keys(before.sources)[0];h.setPayload(ordinary([C,D]));const result=await h.observe();check(result.ok,'directory-commit');const metadata=await h.native.read(h.scope);check(Object.keys(metadata.sources).length===1&&metadata.sources[sourceId].channel==='host-metadata','one-canonical-source');check(JSON.stringify(metadata.membership)===JSON.stringify(before.membership),'membership-preserved');
    h.base.close();const reopened=await h.native.snapshot(h.scope);check(reopened.unknown.some(row=>row.id===D),'reopened-unknown');check(reopened.projects.some(p=>p.members.some(row=>row.id===C)),'prior-project-membership');
    check((await h.dom()).state==='accepted','dom-after');const final=await h.native.read(h.scope);check(final.refs[D]&&final.sources[sourceId].channel==='host-dom','unseen-row-retained');
    h.setPayload(ordinary([]));const empty=await h.observe();check(empty.replayed&&await h.native.version(h.scope)===final.revision,'no-absence-delete');
    if(!authenticated){h.advance(1);check((await h.dom()).state==='accepted','fresh-positive-fields');const positive=await h.native.read(h.scope);
    h.advance(1000);check((await h.dom({missingTitle:true})).state==='accepted','partial-field-observation');h.base.close();const partial=await h.native.read(h.scope),partialView=await h.native.snapshot(h.scope);
    check(partial.refs[C].nativeTitle===positive.refs[C].nativeTitle&&JSON.stringify(partial.refs[C].fieldWitnesses.nativeTitle)===JSON.stringify(positive.refs[C].fieldWitnesses.nativeTitle),'field-title-provenance');
    check(partialView.refs.find(r=>r.id===C).nativeTitle===positive.refs[C].nativeTitle&&partialView.refs.find(r=>r.id===C).membership==='PROJECT','field-projection-and-membership');}
    const foreign={verified:true,provider:h.scope.provider,accountId:'foreign-fixture',organizationId:h.scope.organizationId};check((await h.native.read(foreign)).revision===0,'scope-isolation');
    const summary={sameCanonicalSource:true,fieldProvenanceReopened:!authenticated,weakTitleDoesNotRenew:!authenticated,membershipPreserved:true,unknownRemainsUnknown:true,reopenedIndexedDB:true,absenceDidNotDelete:true,otherScopeEmpty:true,coverageGapPreserved:result.coverage.gaps.includes('missing-inventory-status')};
    if(authenticated){
     const {createSessionProvider}=await import('/src/runtime/session-provider.mjs'),{createSharedHostReadBudget}=await import('/src/runtime/shared-host-read-budget.mjs');const now=()=>Date.parse('2026-10-14T00:00:00Z');
     const make=()=>createSessionProvider({origin:location.origin,now,readBudget:createSharedHostReadBudget({repository:h.base,now}),profile:{id:'session',structures:{personal:'personal',workspace:'organization'},directoryReadEnabled:true,currentConversationContextHeader:true,currentConversationRosterContext:true}});
     h.profile.directoryProvider=make().directoryProvider;check((await h.observe()).ok,'authenticated-intake');const stored=await h.native.read(h.scope);check(!JSON.stringify(stored).includes('FIXTURE_TOKEN')&&!JSON.stringify(stored).includes('must-not-persist'),'no-private-persistence');
     h.base.close();check((await h.native.snapshot(h.scope)).unknown.some(row=>row.id===D),'authenticated-reopen');
     h.profile.directoryProvider=make().directoryProvider;check((await h.observe()).ok,'second-chain');const revision=await h.native.version(h.scope);h.base.close();h.profile.directoryProvider=make().directoryProvider;
     check(!(await h.observe()).ok&&await h.native.version(h.scope)===revision,'persisted-budget-blocks-third-chain');summary.authenticatedFixture={privateProviderToOwner:true,reopenedIndexedDB:true,sharedBudgetSurvivedProviderAndDatabaseReopen:true,noPartialCommitOnBudgetFailure:true};
    }
    return summary;
   }finally{h.close();}
  },authenticated);assert.equal(report.externalRequests,0);if(authenticated){assert.equal(apiCalls.length,12);assert.equal(apiCalls.filter(p=>p==='/backend-api/conversations').length,2);report.fixtureHttpRequests=apiCalls.length;}report.status='PASS';
 }catch(error){report.status='FAIL';report.error=error.message;throw error;}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await writeFile(output,JSON.stringify(report,null,2)+'\n');}
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await runDirectoryIDB(process.argv[2],{authenticated:process.argv.includes('--authenticated')})));

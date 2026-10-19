import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolvedNavigationProfile} from './resolved-navigation-profile.mjs';
import {modernExpectedWorld as oracle} from './expected/modern.mjs';
import {digest} from '../../src/data/hash.mjs';
test('default retains LEGACY root route and original resolved targets',()=>{
 const profile=resolvedNavigationProfile();assert.equal(profile.profile,'LEGACY');assert.equal(profile.offlineContext,false);assert.equal(profile.startPath,'/');assert.equal(profile.expectedScope,null);assert.equal(profile.conversation,'33333333-3333-4333-8333-333333333333');assert.equal(profile.project,'g-p-11111111111111111111111111111111');
});
test('MODERN independently selects team not roster head and starts on a different real visible conversation',()=>{
 const profile=resolvedNavigationProfile('MODERN'),scope=JSON.parse(profile.expectedScope);
 assert.equal(profile.offlineContext,true);assert.equal(scope[0],'chatgpt');assert.equal(scope[1],'principal_'+digest(['chatgpt-principal-v1',oracle.principalId]));assert.equal(scope[2],'context_'+digest(['chatgpt-context-v1',oracle.principalId,oracle.selectedContext]));assert.notEqual(scope[2],'context_'+digest(['chatgpt-context-v1',oracle.principalId,oracle.accountRoster[0]]));
 assert(oracle.initialVisibleIds.includes(profile.startPath.slice(3)));assert(oracle.initialVisibleIds.includes(profile.conversation));assert.notEqual(profile.startPath,'/c/'+profile.conversation);assert.equal(oracle.conversations.find(row=>row.id===profile.conversation).title,profile.conversationTitle);
});
test('unknown profile cannot silently downgrade to LEGACY',()=>{for(const value of ['',null,'modern','FAULT',{},1])assert.throws(()=>resolvedNavigationProfile(value),/invalid-resolved-navigation-profile/);});
test('actual runner uses fixture context and retains all seven real navigation oracles',async()=>{
 const source=await readFile(new URL('./resolved-navigation-package-browser.mjs',import.meta.url),'utf8');
 for(const token of ["createVariantHostFixtureServer({profile:'MODERN'})",'offlineContext:true','reply?.page?.scope','assert.equal(report.results.length,9)','ready.every(row=>row.reply.scope===selected.expectedScope)',"modifiers:['Meta']","modifiers:['Shift']","button:'middle'","surface:'sidebar'",'report.sidebarCreateGeometry=geometry','assert.equal(count(),beforeDisclosure)','assert.equal(requests.length,1)','assert.equal(replay?.ok,false)','assert.equal(native.draft,draft)','assert.equal(count(),before)','WORKER_READY_PRECONDITION_NOT_COLD_ACCEPTANCE','report.workerReadyBeforeNativeRequest=true','report.native=server.snapshot()','fixtureChangedDuringRun','sourceChangedDuringRun','scriptChangedDuringRun'])assert(source.includes(token),token);
 for(const banned of ['dispatchEvent(',"createElement('a')",'seed(','grantId:'])assert(!source.includes(banned),banned);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {j1JourneyProfile} from './j1-journey-profile.mjs';
import {modernExpectedWorld} from './expected/modern.mjs';
import {legacyExpectedWorld} from './expected/legacy.mjs';
import {j1PaginationExpected} from './expected/j1-pagination.mjs';
import {digest} from '../../src/data/hash.mjs';
test('default J1 retains LEGACY home route and complete membership oracle',()=>{const p=j1JourneyProfile();assert.equal(p.profile,'LEGACY');assert.equal(p.startPath,'/');assert.equal(p.offlineContext,false);assert.deepEqual(p.oracle.conversations,legacyExpectedWorld.conversations);});
test('MODERN J1 uses native UNKNOWN start and independently expected nonfirst team',()=>{
 const p=j1JourneyProfile('MODERN');assert.equal(p.offlineContext,true);assert.equal(p.startPath,'/c/'+modernExpectedWorld.conversations.find(c=>c.membership==='UNKNOWN').id);assert(modernExpectedWorld.initialVisibleIds.includes(p.startPath.slice(3)));
 assert.equal(p.expectedScope.organizationId,'context_'+digest(['chatgpt-context-v1',modernExpectedWorld.principalId,modernExpectedWorld.selectedContext]));assert.notEqual(p.expectedScope.organizationId,'context_'+digest(['chatgpt-context-v1',modernExpectedWorld.principalId,modernExpectedWorld.accountRoster[0]]));
 assert.deepEqual(p.oracle.conversations.map(c=>c.membership),['PROJECT','PROJECT','NONE','UNKNOWN']);assert.equal(modernExpectedWorld.conversations[0].membership,undefined);assert.equal(p.oraclePath,'./expected/modern.mjs');
});
test('unknown J1 profile cannot silently select personal fallback',()=>{for(const value of ['','modern','FAULT',null,{},true])assert.throws(()=>j1JourneyProfile(value),/invalid-j1-journey-profile/);});
test('J1 retains nonzero independent pagination oracle and all nine original journey assertions',async()=>{
 assert(j1PaginationExpected.canonicalPageOffset>0);assert(j1PaginationExpected.targetPageOffset>0);assert.equal(j1PaginationExpected.canonicalProjects,40);assert.equal(j1PaginationExpected.pendingControls,80);
 const source=await readFile(new URL('./j1-package-journey.mjs',import.meta.url),'utf8');
 for(const token of ["createVariantHostFixtureServer({profile:'MODERN',journey:'J1'})",'offlineContext:true','offlineProjectContext:true','selected.startPath','assert.deepEqual(initial.scope,selected.expectedScope)','assert.equal(report.steps.length,9)','candidatePosition.scrollTop>0','canonicalOrigin.scrollTop>0','canonicalReturn.scrollTop-canonicalOrigin.scrollTop','restoredScroll-candidatePosition.scrollTop','assert.deepEqual(report.canonicalLocation.ids,j1CanonicalOrder.slice','assert.deepEqual(returnedView.ids,j1CanonicalOrder.slice','report.coldDatabases.nativeScopeRoots,0','PARTIAL_J1_NOT_ACCEPTED','sourceChangedDuringRun','scriptChangedDuringRun','fixtureChangedDuringRun'])assert(source.includes(token),token);
 assert.equal((source.match(/record\('/g)??[]).length,9);
 for(const banned of ['seed(','grantId:','singlePersonalDefault:true'])assert(!source.includes(banned),banned);
});

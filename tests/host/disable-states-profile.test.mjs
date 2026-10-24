import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {disableStatesProfile} from './disable-states-profile.mjs';
import {modernExpectedWorld} from './expected/modern.mjs';import {digest} from '../../src/data/hash.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
test('disable matrix preserves LEGACY default and explicitly selects nonfirst MODERN Team',()=>{
 const old=disableStatesProfile();assert.equal(old.profile,'LEGACY');assert.equal(old.entryPath,'/');assert.deepEqual(old.packageOptions,{});
 const modern=disableStatesProfile('MODERN');assert.equal(modern.contextId,modernExpectedWorld.selectedContext);assert.notEqual(modern.contextId,modernExpectedWorld.accountRoster[0]);assert.deepEqual(modern.packageOptions,{offlineContext:true,offlineProjectContext:true});assert.equal(modern.entryPath,'/c/'+modern.conversationId);assert.equal(modern.scope.organizationId,'context_'+digest(['chatgpt-context-v1',modernExpectedWorld.principalId,modernExpectedWorld.selectedContext]));assert.equal(modern.scopeKey,JSON.stringify(['chatgpt',modern.scope.accountId,modern.scope.organizationId]));for(const value of ['','modern','PARTIAL',null])assert.throws(()=>disableStatesProfile(value),/invalid-disable-states-profile/);
});
test('ordinary MODERN fixture supplies existing native context request entry without a shared fixture mutation',async t=>{
 const p=disableStatesProfile('MODERN'),server=await createVariantHostFixtureServer({profile:'MODERN'});t.after(()=>server.close());const page=await fetch(server.origin+p.entryPath),headers={Cookie:page.headers.get('set-cookie').split(';')[0]};const html=await page.text();assert(html.includes('/variants-native.mjs'));
 const prefs=await(await fetch(server.origin+'/native/preferences',{headers})).json();assert.equal(prefs.account_id,p.contextId);
 const script=await(await fetch(server.origin+'/variants-native.mjs',{headers})).text();assert(script.includes("headers:{'Chatgpt-Account-Id':preferences.account_id}"));
 const response=await fetch(server.origin+'/backend-api/conversation/'+p.conversationId,{headers:{...headers,'Chatgpt-Account-Id':prefs.account_id}});assert.equal(response.status,200);assert.deepEqual(server.snapshot().nativeRequests.at(-1),{path:'/backend-api/conversation/'+p.conversationId,context:p.contextId});
});
test('runner retains all five original modes, native and privacy assertions, strict timeout and target-only management',async()=>{
 const source=await readFile(new URL('./disable-states-package-mv3-browser.mjs',import.meta.url),'utf8');
 for(const token of ["FREE_DISABLE_PROFILE??'LEGACY'","createVariantHostFixtureServer({profile:'MODERN'})",'...selected.packageOptions',"['both-open','workspace-only','sidebar-only','both-closed','synthetic-generation']",'timeout:15000','nativeRequestStart','selected.scopeKey','r.context===selected.contextId','privateProjectionAbsent,true','privateProjectionAbsent,false','native.nativeOperable,true',"native.draft,'DISABLE_STATES_DRAFT_AFTER_DISABLE'",'native.sameDocument,true','native.pageHides,0','stopped.stops,1',"LOCAL_SYNTHETIC_GENERATION_NOT_CHATGPT_G",'await chrome.management.setEnabled(target,enabled)',"permissions.includes('management'),false",'fixtureChangedDuringRun','sourceChangedDuringRun'])assert(source.includes(token),token);
 assert(!source.includes('waitForEvent(\'serviceworker\''));assert(!source.includes('setSelectedContext('));
});

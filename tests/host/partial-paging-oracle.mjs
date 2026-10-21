/** Independent test-process oracle. Never imported by the native page or product. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {partialExpectedWorld as world} from './expected/partial.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const partialScope=Object.freeze({verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1',world.principalId]),organizationId:'context_'+digest(['chatgpt-context-v1',world.principalId,world.contextId])});
export const partialScopeKey=JSON.stringify([partialScope.provider,partialScope.accountId,partialScope.organizationId]);
export const partialCheckpoints=Object.freeze([
 'deep-link-outside-initial-25-uses-native-title-UNKNOWN-and-current',
 'native-scroll-25-overlap-window-replacement-preserves-observed-union',
 'native-scroll-50-window-replacement-preserves-scoped-unique-union',
 'native-history-unmount-retains-reading-bound-current-and-editor',
 'native-search-SPA-second-unloaded-chat-does-not-reuse-old-current'
]);
export const partialPageIds=offset=>world.conversations.slice(offset===25?24:offset,offset===25?49:offset+25).map(r=>r.id);
export function partialUnion(offset,{searched=false}={}){
 return [...new Set([...partialPageIds(0),...(offset>=25?partialPageIds(25):[]),...(offset>=50?partialPageIds(50):[]),world.conversations[999].id,...(searched?[world.conversations[998].id]:[])])].sort();
}
export function assertPartialObserved(snapshot,offset,{searched=false}={}){
 assert.deepEqual(snapshot.ids,partialUnion(offset,{searched}),'exact observed union, not complete world');
 assert.equal(new Set(snapshot.ids).size,snapshot.ids.length);
 assert.deepEqual(Object.keys(snapshot.titles).sort(),snapshot.ids);
 for(const id of snapshot.ids){const title=world.conversations.find(r=>r.id===id).title;assert(snapshot.titles[id]===title||id===world.conversations[999].id&&snapshot.titles[id]===title+' refreshed','title must come from the same observed native identity');}
 assert.equal(snapshot.scopeKey,partialScopeKey);
 assert.deepEqual(snapshot.foreignIds,[],'unobserved context must not inherit refs');
 // UNKNOWN proposals deliberately do not create persistent membership facts.
 // Check raw positive claims separately from the complete production projection.
 assert(snapshot.rawMemberships&&typeof snapshot.rawMemberships==='object'&&!Array.isArray(snapshot.rawMemberships),'missing raw membership diagnostics');
 for(const [id,state] of Object.entries(snapshot.rawMemberships)){assert(snapshot.ids.includes(id),'orphan raw membership');assert.equal(state,'UNKNOWN','history alone must not persist NONE or PROJECT');}
 assert.deepEqual(Object.keys(snapshot.projectedMemberships).sort(),snapshot.ids,'every observed ref must be projected exactly once');
 assert(Object.values(snapshot.projectedMemberships).every(state=>state==='UNKNOWN'),'history alone must not project NONE or PROJECT');
 assert(snapshot.inventories.length>0&&snapshot.inventories.every(s=>s==='partial'||s==='unknown'),'no full inventory claim');
 assert.equal(snapshot.draftPreserved,true);assert.equal(snapshot.filePreserved,true);
}
export function assertPartialPaging(paging){
 assert.equal(paging.worldSize,1000);assert.equal(paging.coverage,'non-atomic-observed-scan');
 assert.deepEqual(paging.pages.map(p=>p.offset),[25,50]);
 for(const p of paging.pages){assert.deepEqual(p.nativeEntry,{kind:'GENUINE_NATIVE_COMPOSER_SURRENDER',openOwnedSurfaces:0,nativeHistoryVisible:true});assert.equal(p.method,'GET');assert.equal(p.status,200);assert.equal(p.limit,25);assert.equal(p.context,world.contextId);assert.equal(p.windowed,true);assert.deepEqual(p.nativeIds,partialPageIds(p.offset));assertPartialObserved(p.observed,p.offset);}
 assert.deepEqual(paging.requestOffsets,[25,50],'no hidden full-history fetch');
 assert.deepEqual(paging.serverRequestOffsets,[25,50],'worker or native must not scan unseen pages');
 assert.deepEqual(paging.unmountTransition,{surfacesClosed:true,returnControlVisible:true,renamedAdmitted:true,workspaceReentered:true},'native history mutation must surrender, admit rename and explicitly return');
 assert.equal(paging.afterUnmount.titles[world.conversations[999].id],'Archive conversation 1000 refreshed');
 assertPartialObserved(paging.afterUnmount,50);assertPartialObserved(paging.afterSearch,50,{searched:true});
}

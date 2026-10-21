// Test report factory, never browser/native input.
import {partialExpectedWorld as world} from './expected/partial.mjs';
import {partialPageIds,partialUnion,partialScopeKey} from './partial-paging-oracle.mjs';
export function samplePartialPaging(){
 const observed=(offset,searched=false)=>({ids:partialUnion(offset,{searched}),titles:Object.fromEntries(partialUnion(offset,{searched}).map(id=>[id,world.conversations.find(r=>r.id===id).title])),scopeKey:partialScopeKey,foreignIds:[],rawMemberships:{},projectedMemberships:Object.fromEntries(partialUnion(offset,{searched}).map(id=>[id,'UNKNOWN'])),inventories:['partial'],draftPreserved:true});
 const afterUnmount=observed(50);afterUnmount.titles[world.conversations[999].id]='Archive conversation 1000 refreshed';
 return {unmountTransition:{surfacesClosed:true,returnControlVisible:true,renamedAdmitted:true,workspaceReentered:true},worldSize:1000,coverage:'non-atomic-observed-scan',requestOffsets:[25,50],serverRequestOffsets:[25,50],pages:[25,50].map(offset=>({offset,limit:25,method:'GET',status:200,context:'account-host-personal',windowed:true,nativeIds:partialPageIds(offset),observed:observed(offset)})),afterUnmount,afterSearch:observed(50,true)};
}

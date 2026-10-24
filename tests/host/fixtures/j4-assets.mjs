// Portable user asset fixture. Imported only through production backup UI.
import {emptyState,placementId} from '../../../src/data/state.mjs';
import {createBackup} from '../../../src/data/backup.mjs';
import {digest} from '../../../src/data/hash.mjs';
export const J4_REF='33333333-3333-4333-8333-333333333333';
export function j4AssetBackup(scope,origin){
 const state=emptyState(scope),ref=J4_REF,owner={owner:'human',revision:1};state.revision=1;
 state.refs[ref]={id:ref,nativeUrl:origin+'/c/'+ref,projectId:null,nativeTitle:'Ordinary conversation',available:true};
 state.workspaces.j4_manual={id:'j4_manual',name:'J4 retained manual workspace',icon:'folder',order:0,locked:true,...owner};
 const pid=placementId('j4_manual',ref);state.placements[pid]={id:pid,workspaceId:'j4_manual',refId:ref,excluded:false,order:0,locked:true,...owner};
 state.identities[ref]={id:ref,title:'J4 retained private human title',aliases:['J4 previous title'],locked:true,...owner};
 state.preferences.workingSet={id:'workingSet',value:{refs:[ref],current:ref},...owner};
 const text='J4 retained human snippet';state.preferences.savedSnippets={id:'savedSnippets',value:[{id:'j4_snippet',refId:ref,messageId:'j4_message',branchId:'j4_branch',text,bodyHash:digest(text)}],...owner};
 return createBackup(state);
}

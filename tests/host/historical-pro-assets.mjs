/** Portable human asset input, consumed by the archived product's real import UI. */
export function historicalProBackup({emptyState,placementId,createBackup,digest},scope,origin){
 const s=emptyState(scope),ref='T0',human={owner:'human',revision:1};s.revision=1;
 s.refs[ref]={id:ref,nativeUrl:origin+'/hf/A/c/T0',projectId:null,nativeTitle:'Historical native reference',available:true};
 s.workspaces.history_manual={id:'history_manual',name:'Historical retained workspace',icon:'folder',order:0,locked:true,...human};
 const id=placementId('history_manual',ref);s.placements[id]={id,workspaceId:'history_manual',refId:ref,excluded:false,order:0,locked:true,...human};
 s.identities[ref]={id:ref,title:'Historical retained human title',aliases:['Historical retained alias'],locked:true,...human};
 s.preferences.workingSet={id:'workingSet',value:{refs:[ref],current:ref},...human};
 const text='Historical retained human snippet';s.preferences.savedSnippets={id:'savedSnippets',value:[{id:'history_snippet',refId:ref,messageId:'history_message',branchId:'history_branch',text,bodyHash:digest(text)}],...human};
 return createBackup(s);
}

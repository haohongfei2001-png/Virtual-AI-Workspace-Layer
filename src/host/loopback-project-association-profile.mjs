/** Fixture-only association grammar for exercising the observed Project layout
 * through MV3. Used only by the context bridge, never by the data adapter. */
export function loopbackProjectAssociationProfile(profile,config,actualOrigin){
 const origin=new URL(actualOrigin);
 if(origin.origin!==actualOrigin||origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||config.origin!==actualOrigin||config.offlineObservedProjectLayout!==true||config.scopeProfile?.projectRequestContext!=='loopback-project-v1'||config.scopeProfile?.browserRequestContext!==true||profile.id!=='chatgpt-zh-desktop-observed-20261018')throw Error('invalid-loopback-project-association');
 return {...profile,regions:{...profile.regions,members:'#project-panel[role="tabpanel"][data-vaiwl-fixture-project-id]'},memberProjectIdAttribute:'data-vaiwl-fixture-project-id',urlPolicy:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}};
}

import {modernExpectedWorld} from './expected/modern.mjs';
import {digest} from '../../src/data/hash.mjs';
export function resolvedNavigationProfile(value='LEGACY'){
 if(!['LEGACY','MODERN'].includes(value))throw Error('invalid-resolved-navigation-profile');
 const modern=value==='MODERN',oracle=modernExpectedWorld;
 const conversation=oracle.conversations.find(row=>row.membership==='NONE'),start=oracle.conversations.find(row=>row.membership==='UNKNOWN'),project=oracle.projects[0];
 if(oracle.accountRoster[0]===oracle.selectedContext||!oracle.accountRoster.includes(oracle.selectedContext))throw Error('invalid-modern-context-oracle');
 return Object.freeze({profile:value,modern,offlineContext:modern,startPath:modern?'/c/'+start.id:'/',conversation:conversation.id,conversationTitle:conversation.title,project:project.id,projectLabel:'打开项目以新建聊天 '+project.name,expectedScope:modern?JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1',oracle.principalId]),'context_'+digest(['chatgpt-context-v1',oracle.principalId,oracle.selectedContext])]):null});
}

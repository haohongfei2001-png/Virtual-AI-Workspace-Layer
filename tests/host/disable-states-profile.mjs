import {modernExpectedWorld} from './expected/modern.mjs';
import {legacyExpectedWorld} from './expected/legacy.mjs';
import {digest} from '../../src/data/hash.mjs';
/** Independent Node oracle only; never host-provided authorization. */
export function disableStatesProfile(value='LEGACY'){
 if(!['LEGACY','MODERN'].includes(value))throw Error('invalid-disable-states-profile');
 const modern=value==='MODERN',oracle=modern?modernExpectedWorld:legacyExpectedWorld,contextId=modern?oracle.selectedContext:oracle.contextId;
 if(modern&&(!oracle.accountRoster.includes(contextId)||oracle.accountRoster[0]===contextId))throw Error('invalid-disable-states-team-oracle');
 const scope={verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1',oracle.principalId]),organizationId:'context_'+digest(['chatgpt-context-v1',oracle.principalId,contextId])};
 const conversation=oracle.conversations.find(c=>c.membership==='NONE');if(!conversation)throw Error('missing-disable-conversation-oracle');
 return Object.freeze({profile:value,modern,contextId,scope:Object.freeze(scope),scopeKey:JSON.stringify([scope.provider,scope.accountId,scope.organizationId]),entryPath:modern?'/c/'+conversation.id:'/',conversationId:conversation.id,title:conversation.title,packageOptions:Object.freeze(modern?{offlineContext:true,offlineProjectContext:true}:{})});
}

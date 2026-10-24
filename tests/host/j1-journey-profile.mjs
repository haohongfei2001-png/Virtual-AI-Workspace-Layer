import {legacyExpectedWorld} from './expected/legacy.mjs';
import {modernExpectedWorld} from './expected/modern.mjs';
import {digest} from '../../src/data/hash.mjs';
/** Test-process oracle selection only; never supplied to the fixture or extension. */
export function j1JourneyProfile(value='LEGACY'){
 if(!['LEGACY','MODERN'].includes(value))throw Error('invalid-j1-journey-profile');
 const modern=value==='MODERN',source=modern?modernExpectedWorld:legacyExpectedWorld,context=modern?source.selectedContext:source.contextId;
 if(modern&&(!source.accountRoster.includes(context)||context===source.accountRoster[0]))throw Error('invalid-j1-modern-context-oracle');
 const oracle=Object.freeze({...source,conversations:Object.freeze(source.conversations.map(row=>Object.freeze({...row,membership:row.membership??(row.projectId?'PROJECT':null)})))});
 const start=oracle.conversations.find(row=>row.membership==='UNKNOWN');
 if(modern&&(!start||!source.initialVisibleIds.includes(start.id)))throw Error('invalid-j1-modern-start-oracle');
 return Object.freeze({profile:value,modern,oracle,oraclePath:modern?'./expected/modern.mjs':'./expected/legacy.mjs',startPath:modern?'/c/'+start.id:'/',offlineContext:modern,expectedScope:Object.freeze({provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1',oracle.principalId]),organizationId:'context_'+digest(['chatgpt-context-v1',oracle.principalId,context])})});
}

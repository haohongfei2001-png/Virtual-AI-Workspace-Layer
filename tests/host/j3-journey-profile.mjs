import {modernExpectedWorld} from './expected/modern.mjs';
import {legacyExpectedWorld} from './expected/legacy.mjs';
import {digest} from '../../src/data/hash.mjs';
/** Independent test-process expectations, never served as fixture authority. */
export function j3JourneyProfile(value='LEGACY'){
 if(!['LEGACY','MODERN'].includes(value))throw Error('invalid-j3-journey-profile');
 const modern=value==='MODERN',oracle=modern?modernExpectedWorld:legacyExpectedWorld,context=modern?oracle.selectedContext:oracle.contextId;
 if(modern&&(!oracle.accountRoster.includes(context)||oracle.accountRoster[0]===context))throw Error('invalid-j3-modern-context-oracle');
 return Object.freeze({profile:value,modern,sidebarAvailable:!modern,scope:Object.freeze({verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1',oracle.principalId]),organizationId:'context_'+digest(['chatgpt-context-v1',oracle.principalId,context])})});
}

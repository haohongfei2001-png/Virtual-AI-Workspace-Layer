import {modernExpectedWorld} from './expected/modern.mjs';
import {legacyExpectedWorld} from './expected/legacy.mjs';
import {digest} from '../../src/data/hash.mjs';
/** Independent test-process expectations, never served as fixture authority. */
export function j3JourneyProfile(value='LEGACY'){
 if(!['LEGACY','MODERN'].includes(value))throw Error('invalid-j3-journey-profile');
 const modern=value==='MODERN',oracle=modern?modernExpectedWorld:legacyExpectedWorld,context=modern?oracle.selectedContext:oracle.contextId;
 if(modern&&(!oracle.accountRoster.includes(context)||oracle.accountRoster[0]===context))throw Error('invalid-j3-modern-context-oracle');
 // Neither historical fixture has the proved Project/recent partition and
 // common NAV scroll owner required by the flow backend. This is a fixture
 // fact, not a fallback inferred from whether the product managed to mount.
 return Object.freeze({profile:value,modern,sidebarAvailable:false,sidebarLimitation:modern?'compact-history-without-flow-partition':'legacy-separated-roots-without-flow-partition',scope:Object.freeze({verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1',oracle.principalId]),organizationId:'context_'+digest(['chatgpt-context-v1',oracle.principalId,context])})});
}

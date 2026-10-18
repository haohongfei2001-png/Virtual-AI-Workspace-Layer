import test from 'node:test';
import assert from 'node:assert/strict';
import {CHATGPT_OBSERVED_PROFILE as observed,selectHostSurfaceProfile} from '../../src/host/chatgpt-observed-profile.mjs';
import {LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
import {CHATGPT_SELECTION_CURRENT_BODY} from '../../src/host/current-body-discovery.mjs';
test('observed profile is explicit and cannot replace default or invent authority',()=>{
 assert.equal(selectHostSurfaceProfile(),LEGACY_SURFACE_PROFILE);
 assert.equal(selectHostSurfaceProfile(observed.id),observed);
 for(const value of [null,'unknown','chatgpt-context-unverified',{},true])assert.throws(()=>selectHostSurfaceProfile(value),/unsupported-host-surface-profile/);
 assert.equal(observed.liveVerified,false);assert.equal(observed.reconstruction,false);
 assert.equal(observed.currentBody,CHATGPT_SELECTION_CURRENT_BODY);
 for(const key of ['scopeProfile','sendIntent','sendAckProfile','inputRisk','memberProjectIdAttribute','noneLabel'])assert.equal(Object.hasOwn(observed,key),false);
 assert(Object.isFrozen(observed)&&Object.isFrozen(observed.nativeLayout)&&Object.isFrozen(observed.regions));
});

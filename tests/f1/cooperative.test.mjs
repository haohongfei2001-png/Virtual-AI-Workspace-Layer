import test from 'node:test';
import assert from 'node:assert/strict';
import {dataProjection,dataProjectionAsync} from '../../src/data/evidence.mjs';
import {currentIndex,currentIndexAsync} from '../../src/navigation/current-index.mjs';
import {persistentSeed} from '../../simulator/persistent-seed.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
test('yielded projection matches synchronous accepted semantics across scopes and revocation',async()=>{for(const account of ['A','B'])for(const revoked of [false,true]){const state=persistentSeed(scopeOf(account),'http://127.0.0.1:48178');state.sources.fixture_v1.revoked=revoked;const expected=dataProjection(state,FIXTURE_NOW,'America/New_York');assert.deepEqual(await dataProjectionAsync(state,FIXTURE_NOW,'America/New_York'),expected);const synchronous=currentIndex(expected,expected.groups),yielded=await currentIndexAsync(expected,expected.groups);for(const ref of expected.refs)assert.equal(yielded.at(ref.nativeUrl).selected,synchronous.at(ref.nativeUrl).selected);}});
test('yielded computation rejects authority changes before publishing a partial result',async()=>{const state=persistentSeed(scopeOf('A'),'http://127.0.0.1:48178');let calls=0;await assert.rejects(()=>dataProjectionAsync(state,FIXTURE_NOW,'UTC',()=>++calls<2),/stale-client-response/);const snapshot=dataProjection(state,FIXTURE_NOW,'UTC');calls=0;await assert.rejects(()=>currentIndexAsync(snapshot,snapshot.groups,()=>++calls<2),/stale-client-response/);});

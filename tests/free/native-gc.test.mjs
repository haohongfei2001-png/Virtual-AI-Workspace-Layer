import test from 'node:test';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {runNativeGCRecovery} from './native-gc-browser-cases.mjs';
test('native GC after root recovery removes orphan older checkpoint pieces while retaining current and prior pieces',()=>runNativeGCRecovery(new MockIDBFactory()));

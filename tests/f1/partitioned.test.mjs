import test from 'node:test';
import { MockIDBFactory } from '../b23/mock-idb.mjs';
import { partitionedCases } from './native-partition-cases.mjs';
for(const c of partitionedCases(new MockIDBFactory()))test(c.name,c.run);

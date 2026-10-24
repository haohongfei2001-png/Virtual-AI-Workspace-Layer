import test from 'node:test';
import {knownAnchorRollbackCases} from './known-anchor-rollback-contract.mjs';
for(const [name,run] of knownAnchorRollbackCases)test('historical 531c146 writer: '+name,run);

import test from 'node:test';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {recoveryDeadlineCases,recoveryDeadlineCase} from './recoverydeadline-probe.mjs';
for(const {kind,boundary,deadline} of recoveryDeadlineCases())test(`${kind} deferred timers ${deadline} ${boundary}`,()=>recoveryDeadlineCase(new MockIDBFactory(),kind,boundary,deadline));

import {hostScaleScenario,HOST_SCALE_SIZES,HOST_SCALE_DISTRIBUTIONS} from './host-scale-world.mjs';
export const HOST_SCALE_GAPS=Object.freeze([
 'F1 navigation p95 <150ms and search first screen <300ms across repeated samples',
 'F1 qualified activity evidence to UI <1000ms; SYS-05 token/ACK/title contention',
 'Full admitted Host index cardinality at 1k/10k/100k, not just native fixture size',
 'Shared owner/index and bounded DTOs across both surfaces and multiple tabs',
 'First-schema preparing observed without false empty-library presentation',
 'Scope-wide 30s/12 request/2 retry budget across tabs and worker restart',
 'Physical weak device and real ChatGPT G/U; renderer 4x is not worker throttling',
]);
export function hostScalePlan(){return {requirement:'SYS-04 / original F1',status:'NOT_RUN',acceptance:'NOT_ESTABLISHED',rpcBudgetMs:6000,scenarios:HOST_SCALE_SIZES.flatMap(size=>HOST_SCALE_DISTRIBUTIONS.flatMap(distribution=>[1,4].map(cpuRate=>hostScaleScenario({size,distribution,cpuRate})))),remaining:HOST_SCALE_GAPS};}
